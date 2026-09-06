import { Router, Response } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.js';
import { checkAndIncrementRateLimit } from '../services/rateLimiter.js';
import { screenForCrisis } from '../services/crisisScreener.js';
import {
  generateReflectionResponse,
  generateConversationSummary,
  getGeminiModelName,
} from '../services/geminiService.js';
import {
  getConversation,
  getAuthoritativeMessages,
  formatTurnsForGemini,
  persistAssistantMessage,
  completeAndSummarizeConversation,
  deleteConversationServer,
  BackendPersistenceUnavailableError,
} from '../services/conversationService.js';
import { getTimestampMillis } from '../services/firestoreRestService.js';
import {
  toBackendPersistenceApiResponse,
  BACKEND_PERSISTENCE_UNAVAILABLE,
} from '../services/privilegedPersistence.js';
import { dispatchReflectionCompleted } from '../services/notificationIntegrationService.js';

export const reflectionRouter = Router();

// Validate conversation ID path segment to prevent injection
function isValidDocId(id: unknown): id is string {
  return typeof id === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(id);
}

/**
 * Determine the read transport label for diagnostics.
 *
 * USER-AUTHORIZED reads in this router may use either the user's ID
 * token over REST (AI Studio preview compatibility) or the Admin SDK
 * (when the runtime has privileged IAM). Reads are NOT the same as
 * backend-owned writes; this router only routes backend-owned writes
 * through the privileged Admin SDK path.
 */
function isReadUsingUserToken(token: string | undefined): boolean {
  // The user token is only used for owner-scoped reads. We never use
  // it as authority for backend-owned writes (assistant messages,
  // lifecycle transitions). The presence of a token simply signals
  // that this runtime chose the user-token REST read path.
  return Boolean(token);
}

interface StageState {
  status: 'enter' | 'success' | 'failure';
  transport?: string;
  errorCode?: string;
  errorMessage?: string;
}

function createDiagnostics(
  failedStage: string,
  status: number,
  errorName: string,
  errorCode: string,
  errorMessage: string,
  stageTrace: Record<string, StageState>,
  readTransport: 'firestore_rest_user_token' | 'admin_sdk'
) {
  const stageOrder = [
    'request_received',
    'auth_verified',
    'conversation_lookup',
    'authoritative_messages_lookup',
    'crisis_screen',
    'rate_limit_check',
    'gemini_client_initialization',
    'gemini_generate_content',
    'assistant_message_persistence',
    'request_complete'
  ];

  let lastSuccessfulStage = 'none';
  for (const s of stageOrder) {
    if (stageTrace[s]?.status === 'success') {
      lastSuccessfulStage = s;
    } else {
      break;
    }
  }

  return {
    lastSuccessfulStage,
    failedStage,
    status,
    errorName,
    errorCode,
    errorMessage,
    // Read transport only. Backend-owned writes always use the
    // privileged Admin SDK path; they never have a user-token variant.
    readTransport,
    conversationLookupSucceeded: stageTrace['conversation_lookup']?.status === 'success',
    authoritativeMessagesLookupSucceeded: stageTrace['authoritative_messages_lookup']?.status === 'success',
    rateLimiterSucceeded: stageTrace['rate_limit_check']?.status === 'success',
    crisisScreeningSucceeded: stageTrace['crisis_screen']?.status === 'success',
    geminiInitializationSucceeded: stageTrace['gemini_client_initialization']?.status === 'success',
    generateContentReached: stageTrace['gemini_generate_content']?.status !== undefined,
    assistantPersistenceReached: stageTrace['assistant_message_persistence']?.status !== undefined,
    stageTrace: {
      request_received: stageTrace['request_received'] || { status: 'enter' },
      auth_verified: stageTrace['auth_verified'] || { status: 'enter' },
      conversation_lookup: stageTrace['conversation_lookup'] || { status: 'enter', transport: readTransport },
      authoritative_messages_lookup: stageTrace['authoritative_messages_lookup'] || { status: 'enter', transport: readTransport },
      crisis_screen: stageTrace['crisis_screen'] || { status: 'enter' },
      rate_limit_check: stageTrace['rate_limit_check'] || { status: 'enter' },
      gemini_client_initialization: stageTrace['gemini_client_initialization'] || { status: 'enter' },
      gemini_generate_content: stageTrace['gemini_generate_content'] || { status: 'enter' },
      assistant_message_persistence: stageTrace['assistant_message_persistence'] || { status: 'enter', transport: 'admin_sdk' },
      request_complete: stageTrace['request_complete'] || { status: 'enter' }
    }
  };
}

reflectionRouter.post('/api/reflect', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const stageTrace: Record<string, StageState> = {};
  let activeStage = 'request_received';
  // Hoisted to the route scope so the catch block can return the Gemini
  // output as a client-persistence fallback when Admin SDK persistence
  // is unavailable in the preview sandbox.
  let assistantText: string | null = null;
  stageTrace[activeStage] = { status: 'success' };
  console.log(`[STAGE_TRACE] stage: ${activeStage} | status: success`);

  const uid = req.user?.uid;
  const token = req.token;
  // USER-AUTHORIZED READS: may use the user's ID token for owner-scoped
  // reads of conversation and messages. This is a legitimate use of
  // user-token REST transport.
  const readToken = token;
  const readTransport: 'firestore_rest_user_token' | 'admin_sdk' = isReadUsingUserToken(readToken)
    ? 'firestore_rest_user_token'
    : 'admin_sdk';

  if (!uid) {
    activeStage = 'auth_verified';
    stageTrace[activeStage] = { status: 'failure', errorCode: 'unauthorized', errorMessage: 'Authentication required' };
    console.error(`[STAGE_TRACE] stage: ${activeStage} | status: failure | http: 401 | error: unauthorized`);
    const diagnostics = createDiagnostics(activeStage, 401, 'Error', 'unauthorized', 'Authentication required', stageTrace, readTransport);
    console.error(`[REFLECT_DIAG]\nlastSuccessfulStage: ${diagnostics.lastSuccessfulStage}\nfailedStage: ${diagnostics.failedStage}\nerrorName: ${diagnostics.errorName}\nerrorCode: ${diagnostics.errorCode}\nerrorMessage: ${diagnostics.errorMessage}`);
    res.status(401).json({ error: 'unauthorized', message: 'Authentication required.', diagnostics });
    return;
  }

  activeStage = 'auth_verified';
  stageTrace[activeStage] = { status: 'success' };
  console.log(`[STAGE_TRACE] stage: ${activeStage} | status: success`);

  const { conversationId } = req.body || {};

  if (!isValidDocId(conversationId)) {
    activeStage = 'conversation_lookup';
    stageTrace[activeStage] = { status: 'failure', errorCode: 'invalid_request', errorMessage: 'A valid conversationId string is required' };
    console.error(`[STAGE_TRACE] stage: ${activeStage} | status: failure | http: 400 | error: invalid_request`);
    const diagnostics = createDiagnostics(activeStage, 400, 'Error', 'invalid_request', 'A valid conversationId string is required.', stageTrace, readTransport);
    console.error(`[REFLECT_DIAG]\nlastSuccessfulStage: ${diagnostics.lastSuccessfulStage}\nfailedStage: ${diagnostics.failedStage}\nerrorName: ${diagnostics.errorName}\nerrorCode: ${diagnostics.errorCode}\nerrorMessage: ${diagnostics.errorMessage}`);
    res.status(400).json({
      error: 'invalid_request',
      message: 'A valid conversationId string is required.',
      diagnostics,
    });
    return;
  }

  try {
    // Stage: conversation_lookup (USER-AUTHORIZED READ)
    activeStage = 'conversation_lookup';
    stageTrace[activeStage] = { status: 'enter', transport: readTransport };
    console.log(`[STAGE_TRACE] stage: ${activeStage} | readTransport: ${readTransport} | database: named | status: enter`);
    const conversation = await getConversation(uid, conversationId, readToken);
    if (!conversation) {
      stageTrace[activeStage] = { status: 'failure', transport: readTransport, errorCode: 'conversation_not_found', errorMessage: 'Reflection conversation not found.' };
      console.error(`[STAGE_TRACE] stage: ${activeStage} | status: failure | http: 404 | error: conversation_not_found`);
      const diagnostics = createDiagnostics(activeStage, 404, 'Error', 'conversation_not_found', 'Reflection conversation not found.', stageTrace, readTransport);
      console.error(`[REFLECT_DIAG]\nlastSuccessfulStage: ${diagnostics.lastSuccessfulStage}\nfailedStage: ${diagnostics.failedStage}\nerrorName: ${diagnostics.errorName}\nerrorCode: ${diagnostics.errorCode}\nerrorMessage: ${diagnostics.errorMessage}`);
      res.status(404).json({
        error: 'conversation_not_found',
        message: 'Reflection conversation not found.',
        diagnostics,
      });
      return;
    }

    if (conversation.status === 'completed') {
      stageTrace[activeStage] = { status: 'failure', transport: readTransport, errorCode: 'conversation_completed', errorMessage: 'This reflection conversation is completed and cannot accept new turns.' };
      console.error(`[STAGE_TRACE] stage: ${activeStage} | status: failure | http: 409 | error: conversation_completed`);
      const diagnostics = createDiagnostics(activeStage, 409, 'Error', 'conversation_completed', 'This reflection conversation is completed and cannot accept new turns.', stageTrace, readTransport);
      console.error(`[REFLECT_DIAG]\nlastSuccessfulStage: ${diagnostics.lastSuccessfulStage}\nfailedStage: ${diagnostics.failedStage}\nerrorName: ${diagnostics.errorName}\nerrorCode: ${diagnostics.errorCode}\nerrorMessage: ${diagnostics.errorMessage}`);
      res.status(409).json({
        error: 'conversation_completed',
        message: 'This reflection conversation is completed and cannot accept new turns.',
        diagnostics,
      });
      return;
    }
    stageTrace[activeStage] = { status: 'success', transport: readTransport };
    console.log(`[STAGE_TRACE] stage: ${activeStage} | readTransport: ${readTransport} | database: named | status: success`);

    // Stage: authoritative_messages_lookup (USER-AUTHORIZED READ)
    activeStage = 'authoritative_messages_lookup';
    stageTrace[activeStage] = { status: 'enter', transport: readTransport };
    console.log(`[STAGE_TRACE] stage: ${activeStage} | readTransport: ${readTransport} | database: named | status: enter`);
    const messages = await getAuthoritativeMessages(uid, conversationId, undefined, readToken);

    if (messages.length === 0) {
      stageTrace[activeStage] = { status: 'failure', transport: readTransport, errorCode: 'empty_conversation', errorMessage: 'No messages found in this conversation.' };
      console.error(`[STAGE_TRACE] stage: ${activeStage} | status: failure | http: 400 | error: empty_conversation`);
      const diagnostics = createDiagnostics(activeStage, 400, 'Error', 'empty_conversation', 'No messages found in this conversation. Please record a reflection first.', stageTrace, readTransport);
      console.error(`[REFLECT_DIAG]\nlastSuccessfulStage: ${diagnostics.lastSuccessfulStage}\nfailedStage: ${diagnostics.failedStage}\nerrorName: ${diagnostics.errorName}\nerrorCode: ${diagnostics.errorCode}\nerrorMessage: {diagnostics.errorMessage}`);
      res.status(400).json({
        error: 'empty_conversation',
        message: 'No messages found in this conversation. Please record a reflection first.',
        diagnostics,
      });
      return;
    }

    // Context Telemetry Trace
    const messageCount = messages.length;
    const rolesStr = messages.map((m) => m.role).join(', ');
    const oldestMillis = getTimestampMillis(messages[0].createdAt);
    const newestMillis = getTimestampMillis(messages[messages.length - 1].createdAt);
    const oldestTs = oldestMillis > 0 ? new Date(oldestMillis).toISOString() : 'unknown';
    const newestTs = newestMillis > 0 ? new Date(newestMillis).toISOString() : 'unknown';

    console.log(
      `[CONTEXT_TRACE] conversationId: ${conversationId} | messageCount: ${messageCount} | chronologicalOrder: verified | roles: [${rolesStr}] | oldestTimestamp: ${oldestTs} | newestTimestamp: ${newestTs}`
    );

    const latestMessage = messages[messages.length - 1];
    if (latestMessage.role !== 'user') {
      stageTrace[activeStage] = { status: 'failure', transport: readTransport, errorCode: 'invalid_turn', errorMessage: 'The latest message in this conversation was already answered.' };
      console.error(`[STAGE_TRACE] stage: ${activeStage} | status: failure | http: 400 | error: invalid_turn`);
      const diagnostics = createDiagnostics(activeStage, 400, 'Error', 'invalid_turn', 'The latest message in this conversation was already answered.', stageTrace, readTransport);
      console.error(`[REFLECT_DIAG]\nlastSuccessfulStage: ${diagnostics.lastSuccessfulStage}\nfailedStage: {diagnostics.failedStage}\nerrorName: {diagnostics.errorName}\nerrorCode: {diagnostics.errorCode}\nerrorMessage: {diagnostics.errorMessage}`);
      res.status(400).json({
        error: 'invalid_turn',
        message: 'The latest message in this conversation was already answered.',
        diagnostics,
      });
      return;
    }
    stageTrace[activeStage] = { status: 'success', transport: readTransport };
    console.log(`[STAGE_TRACE] stage: ${activeStage} | status: success`);

    // Stage: crisis_screen
    activeStage = 'crisis_screen';
    stageTrace[activeStage] = { status: 'enter' };
    console.log(`[STAGE_TRACE] stage: ${activeStage} | status: enter`);
    const crisisCheck = screenForCrisis(latestMessage.content);
    if (crisisCheck.requiresSupport) {
      stageTrace[activeStage] = { status: 'success' };
      console.log(`[STAGE_TRACE] stage: ${activeStage} | status: success | action: crisis_support_triggered`);
      res.status(200).json({
        conversationId,
        crisisSupportRequired: true,
        assistantMessage: null,
      });
      return;
    }
    stageTrace[activeStage] = { status: 'success' };
    console.log(`[STAGE_TRACE] stage: ${activeStage} | status: success`);

    // Stage: rate_limit_check
    activeStage = 'rate_limit_check';
    stageTrace[activeStage] = { status: 'enter' };
    console.log(`[STAGE_TRACE] stage: ${activeStage} | status: enter`);
    const rateLimit = await checkAndIncrementRateLimit(uid, {
      maxRequests: 10,
      windowSeconds: 60,
    });

    if (!rateLimit.allowed) {
      stageTrace[activeStage] = { status: 'failure', errorCode: 'rate_limit_exceeded', errorMessage: 'Reflection rate limit reached.' };
      console.error(`[STAGE_TRACE] stage: ${activeStage} | status: failure | http: 429 | error: rate_limit_exceeded`);
      res.setHeader('Retry-After', String(rateLimit.retryAfterSeconds));
      const diagnostics = createDiagnostics(activeStage, 429, 'Error', 'rate_limit_exceeded', 'Reflection rate limit reached. Please pause and reflect before continuing.', stageTrace, readTransport);
      console.error(`[REFLECT_DIAG]\nlastSuccessfulStage: {diagnostics.lastSuccessfulStage}\nfailedStage: {diagnostics.failedStage}\nerrorName: {diagnostics.errorName}\nerrorCode: {diagnostics.errorCode}\nerrorMessage: {diagnostics.errorMessage}`);
      res.status(429).json({
        error: 'rate_limit_exceeded',
        message: 'Reflection rate limit reached. Please pause and reflect before continuing.',
        retryAfterSeconds: rateLimit.retryAfterSeconds,
        diagnostics,
      });
      return;
    }
    stageTrace[activeStage] = { status: 'success' };
    console.log(`[STAGE_TRACE] stage: ${activeStage} | status: success`);

    // Stage: gemini_client_initialization
    activeStage = 'gemini_client_initialization';
    stageTrace[activeStage] = { status: 'enter' };
    console.log(`[STAGE_TRACE] stage: ${activeStage} | status: enter | model: ${getGeminiModelName()} | hasApiKey: ${Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim().length > 0)}`);
    const priorTurns = formatTurnsForGemini(messages.slice(0, -1));
    const hasApiKey = Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim().length > 0);
    if (!hasApiKey) {
      throw new Error('GEMINI_CONFIGURATION_ERROR: API key is missing');
    }
    stageTrace[activeStage] = { status: 'success' };
    console.log(`[STAGE_TRACE] stage: ${activeStage} | status: success`);

    // Stage: gemini_generate_content
    activeStage = 'gemini_generate_content';
    stageTrace[activeStage] = { status: 'enter' };
    console.log(`[STAGE_TRACE] stage: ${activeStage} | status: enter | model: ${getGeminiModelName()}`);
    assistantText = await generateReflectionResponse(priorTurns, latestMessage.content);
    stageTrace[activeStage] = { status: 'success' };
    console.log(`[STAGE_TRACE] stage: ${activeStage} | status: success`);

    // Stage: assistant_message_persistence (BACKEND-OWNED WRITE)
    //
    // PRIVILEGE BOUNDARY: We call persistAssistantMessage with NO user
    // token. The function is strictly privileged (Admin SDK).
    //
    // FALLBACK POLICY (preview sandbox):
    //   If the runtime lacks Firestore IAM, the Admin SDK throws
    //   BackendPersistenceUnavailableError. Because Gemini already
    //   succeeded by this point, we MUST NOT discard the generated
    //   response. Instead we return HTTP 200 with the generated
    //   assistant message and persistence.fallbackRequired = true.
    //   The authenticated client then persists the assistant message
    //   using the Firebase Client SDK under existing Firestore
    //   ownership rules.
    //
    //   This fallback is NARROW: it only applies to
    //   BackendPersistenceUnavailableError (a classified capability
    //   failure), never to auth failures, Gemini failures, or
    //   arbitrary errors — those still fail closed.
    activeStage = 'assistant_message_persistence';
    stageTrace[activeStage] = { status: 'enter', transport: 'admin_sdk' };
    console.log(`[STAGE_TRACE] stage: ${activeStage} | transport: admin_sdk | database: named | status: enter`);
    const assistantMessage = await persistAssistantMessage(uid, conversationId, assistantText, undefined);
    stageTrace[activeStage] = { status: 'success', transport: 'admin_sdk' };
    console.log(`[STAGE_TRACE] stage: ${activeStage} | transport: admin_sdk | database: named | status: success`);

    // Stage: request_complete — normal production persistence succeeded
    activeStage = 'request_complete';
    stageTrace[activeStage] = { status: 'success' };
    res.status(200).json({
      status: 'success',
      conversationId,
      message: {
        id: assistantMessage.id,
        role: assistantMessage.role,
        content: assistantMessage.content,
        createdAt: new Date().toISOString(),
      },
      persistence: {
        persisted: true,
      },
    });
    console.log(`[STAGE_TRACE] stage: ${activeStage} | status: success | http: 200`);
  } catch (error: any) {
    // CAPABILITY FALLBACK: Privileged persistence unavailable in the
    // preview sandbox AFTER Gemini already succeeded. We MUST NOT
    // discard the generated assistant response. Return it with
    // fallbackRequired so the authenticated client persists it via
    // the Firebase Client SDK under existing ownership rules.
    //
    // This is the ONLY error class that triggers the fallback.
    // Auth failures, Gemini failures, malformed requests, etc.
    // propagate to the normal error handler below and fail closed.
    if (error instanceof BackendPersistenceUnavailableError && assistantText !== null) {
      if (activeStage) {
        stageTrace[activeStage] = {
          status: 'failure',
          errorCode: BACKEND_PERSISTENCE_UNAVAILABLE,
          errorMessage: 'Backend persistence unavailable; returning generated response for client fallback.',
          transport: 'admin_sdk',
        };
      }
      const diagnostics = createDiagnostics(
        activeStage,
        200,
        'BackendPersistenceUnavailableError',
        BACKEND_PERSISTENCE_UNAVAILABLE,
        'Backend persistence unavailable; client fallback triggered.',
        stageTrace,
        readTransport
      );
      console.warn(
        `[REFLECT_FALLBACK] Gemini succeeded but Admin persistence unavailable. ` +
        `Returning generated response for client-side persistence fallback. ` +
        `conversationId: ${conversationId}`
      );
      res.status(200).json({
        status: 'success',
        conversationId,
        message: {
          id: null,
          role: 'assistant',
          content: assistantText,
          createdAt: new Date().toISOString(),
        },
        persistence: {
          persisted: false,
          fallbackRequired: true,
          reason: 'backend_persistence_unavailable',
        },
        diagnostics,
      });
      return;
    }

    // If BackendPersistenceUnavailableError reached here without
    // assistantText (should not happen in the reflect flow, but
    // defensive), fail closed with the standard 503.
    if (error instanceof BackendPersistenceUnavailableError) {
      const apiResp = toBackendPersistenceApiResponse(error, 'persistAssistantMessage');
      const sanitizedMsg = apiResp.body.message;
      const errorCode = apiResp.body.error;
      if (activeStage) {
        stageTrace[activeStage] = {
          status: 'failure',
          errorCode: String(errorCode),
          errorMessage: sanitizedMsg,
          transport: 'admin_sdk',
        };
      }
      const diagnostics = createDiagnostics(activeStage, apiResp.status, 'BackendPersistenceUnavailableError', String(errorCode), sanitizedMsg, stageTrace, readTransport);
      console.error(`[REFLECT_DIAG]\nlastSuccessfulStage: ${diagnostics.lastSuccessfulStage}\nfailedStage: ${diagnostics.failedStage}\nerrorName: ${diagnostics.errorName}\nerrorCode: ${diagnostics.errorCode}\nerrorMessage: ${diagnostics.errorMessage}`);
      console.error(`[STAGE_TRACE] stage: ${activeStage} | status: failure | http: ${apiResp.status} | errorCode: ${errorCode} | errorMsg: ${sanitizedMsg}`);
      res.status(apiResp.status).json({
        error: apiResp.body.error,
        message: apiResp.body.message,
        diagnostics,
      });
      return;
    }

    const sanitizedMsg = error?.message ? String(error.message).replace(/[A-Za-z0-9_-]{25,}/g, '[REDACTED]') : 'Unknown';
    const errorCode = error?.code || error?.status || (error as any)?.statusCode || 'UNKNOWN';
    const errorName = error?.name || 'Error';

    // Update failed stage trace
    if (activeStage) {
      stageTrace[activeStage] = {
        status: 'failure',
        errorCode: String(errorCode),
        errorMessage: sanitizedMsg,
        transport: (activeStage === 'conversation_lookup' || activeStage === 'authoritative_messages_lookup')
          ? readTransport
          : (activeStage === 'assistant_message_persistence' ? 'admin_sdk' : undefined)
      };
    }

    const isPermissionDenied = errorCode === 7 || error?.message?.includes('PERMISSION_DENIED');
    const isGeminiConfigError = error?.message?.includes('GEMINI_CONFIGURATION_ERROR');
    const httpStatus = isGeminiConfigError ? 503 : 500;

    const diagnostics = createDiagnostics(activeStage, httpStatus, errorName, String(errorCode), sanitizedMsg, stageTrace, readTransport);

    console.error(`[REFLECT_DIAG]\nlastSuccessfulStage: {diagnostics.lastSuccessfulStage}\nfailedStage: {diagnostics.failedStage}\nerrorName: {diagnostics.errorName}\nerrorCode: {diagnostics.errorCode}\nerrorMessage: {diagnostics.errorMessage}`);
    console.error(`[STAGE_TRACE] stage: {activeStage} | status: failure | http: {httpStatus} | errorCode: {errorCode} | errorMsg: {sanitizedMsg}`);

    res.status(httpStatus).json({
      error: isGeminiConfigError ? 'service_unavailable' : (isPermissionDenied ? 'database_permission_denied' : 'internal_error'),
      message: sanitizedMsg,
      diagnostics,
    });
  }
});

/**
 * POST /api/conversations/:id/summarize
 * Authenticated endpoint to end a reflection session, generate a structured summary,
 * and mark the conversation completed.
 */
reflectionRouter.post('/api/conversations/:id/summarize', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const uid = req.user?.uid;
  const token = req.token;
  // USER-AUTHORIZED READS only; never a write authority.
  const readToken = token;
  const readTransport: 'firestore_rest_user_token' | 'admin_sdk' = isReadUsingUserToken(readToken)
    ? 'firestore_rest_user_token'
    : 'admin_sdk';

  if (!uid) {
    res.status(401).json({ error: 'unauthorized', message: 'Authentication required.' });
    return;
  }

  const conversationId = req.params.id;

  if (!isValidDocId(conversationId)) {
    res.status(400).json({
      error: 'invalid_request',
      message: 'A valid conversation ID parameter is required.',
    });
    return;
  }

  // Hoisted to the route scope so the catch block can return the
  // Gemini-generated summary as a client-persistence fallback when
  // Admin SDK persistence is unavailable in the preview sandbox.
  let summary: string | null = null;

  try {
    // 1. Authoritative conversation verification (USER-AUTHORIZED READ)
    console.log(`[STAGE_TRACE] stage: conversation_lookup | readTransport: ${readTransport} | database: named | status: enter`);
    const conversation = await getConversation(uid, conversationId, readToken);
    if (!conversation) {
      res.status(404).json({
        error: 'conversation_not_found',
        message: 'Reflection conversation not found.',
      });
      return;
    }

    if (conversation.status === 'completed' && conversation.summary) {
      res.status(409).json({
        error: 'already_completed',
        message: 'This conversation has already been summarized and completed.',
        summary: conversation.summary,
      });
      return;
    }

    // 2. Read authoritative message history (USER-AUTHORIZED READ)
    const messages = await getAuthoritativeMessages(uid, conversationId, 50, readToken);
    if (messages.length === 0) {
      res.status(400).json({
        error: 'empty_conversation',
        message: 'Cannot summarize an empty conversation.',
      });
      return;
    }

    // 3. Distributed rate limit check
    const rateLimit = await checkAndIncrementRateLimit(uid, {
      maxRequests: 10,
      windowSeconds: 60,
    });

    if (!rateLimit.allowed) {
      res.setHeader('Retry-After', String(rateLimit.retryAfterSeconds));
      res.status(429).json({
        error: 'rate_limit_exceeded',
        message: 'Rate limit reached. Please wait before requesting a summary.',
        retryAfterSeconds: rateLimit.retryAfterSeconds,
      });
      return;
    }

    // 4. Generate summary with Gemini
    const turns = formatTurnsForGemini(messages);
    summary = await generateConversationSummary(turns);

    // 5. Atomically update conversation to completed state with summary
    //    (BACKEND-OWNED WRITE — privileged Admin SDK only, no user token)
    //
    // FALLBACK POLICY (preview sandbox):
    //   If the runtime lacks Firestore IAM, the Admin SDK throws
    //   BackendPersistenceUnavailableError. Because Gemini already
    //   succeeded by this point, we MUST NOT discard the generated
    //   summary. Instead we return HTTP 200 with the generated summary
    //   and persistence.fallbackRequired = true. The authenticated
    //   client then completes the conversation using the Firebase
    //   Client SDK under existing (narrow) Firestore rules.
    //
    //   This fallback is NARROW: it only applies to
    //   BackendPersistenceUnavailableError (a classified capability
    //   failure), never to auth failures, Gemini failures, or
    //   arbitrary errors — those still fail closed.
    await completeAndSummarizeConversation(uid, conversationId, summary, undefined);

    // Phase 14: Dispatch to external notification channels (non-blocking)
    // Fire-and-forget; delivery failures are isolated
    dispatchReflectionCompleted(uid).catch((err) => {
      console.warn('[REFLECTION_SUMMARIZE] External channel dispatch failed (non-fatal):', err?.message);
    });

    res.status(200).json({
      status: 'success',
      conversationId,
      summary,
      persistence: {
        persisted: true,
      },
    });
  } catch (error: any) {
    // CAPABILITY FALLBACK: Privileged persistence unavailable in the
    // preview sandbox AFTER Gemini already succeeded. We MUST NOT
    // discard the generated summary. Return it with fallbackRequired
    // so the authenticated client completes the conversation via the
    // Firebase Client SDK under existing (narrow) ownership rules.
    //
    // This is the ONLY error class that triggers the fallback.
    // Auth failures, Gemini failures, malformed requests, etc.
    // propagate to the normal error handler below and fail closed.
    if (error instanceof BackendPersistenceUnavailableError && summary !== null) {
      console.warn(
        `[SUMMARIZE_FALLBACK] Gemini summary succeeded but Admin persistence unavailable. ` +
        `Returning generated summary for client-side completion fallback. ` +
        `conversationId: ${conversationId}`
      );
      res.status(200).json({
        status: 'success',
        conversationId,
        summary,
        persistence: {
          persisted: false,
          fallbackRequired: true,
          reason: 'backend_persistence_unavailable',
        },
      });
      return;
    }

    // If BackendPersistenceUnavailableError reached here without
    // summary (should not happen in the summarize flow, but
    // defensive), fail closed with the standard 503.
    if (error instanceof BackendPersistenceUnavailableError) {
      const apiResp = toBackendPersistenceApiResponse(error, 'completeAndSummarizeConversation');
      res.status(apiResp.status).json({
        error: apiResp.body.error,
        message: apiResp.body.message,
      });
      return;
    }

    // On failure: conversation remains active, messages remain intact, retry is possible
    if (error?.message?.includes('GEMINI_CONFIGURATION_ERROR')) {
      res.status(503).json({
        error: 'service_unavailable',
        message: 'Reflection summarization service is currently unconfigured or unavailable.',
      });
      return;
    }

    const isPermissionDenied = error?.code === 7 || error?.message?.includes('PERMISSION_DENIED');
    if (isPermissionDenied) {
      res.status(500).json({
        error: 'database_permission_denied',
        message: 'Unable to access reflection records due to insufficient backend permissions. Your session remains intact.',
      });
      return;
    }

    res.status(500).json({
      error: 'summarization_failed',
      message: 'Failed to generate reflection summary. Your conversation remains active and you can retry.',
    });
  }
});

/**
 * DELETE /api/conversations/:id
 * Authenticated endpoint to perform cascade deletion of a reflection conversation and all its messages.
 */
reflectionRouter.delete('/api/conversations/:id', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const uid = req.user?.uid;
  const token = req.token;
  // USER-AUTHORIZED DELETE (rules allow owner delete of conversation
  // + subcollection messages). May use user-token REST for AI Studio
  // preview compatibility.
  const deleteToken = token;

  const conversationId = req.params.id;
  console.log(`[DIAG_DELETE_STAGE] stage: delete_route_entered | conversationId: ${conversationId}`);

  if (!uid) {
    res.status(401).json({ error: 'unauthorized', message: 'Authentication required.' });
    return;
  }

  console.log(`[DIAG_DELETE_STAGE] stage: delete_auth_verified | conversationId: ${conversationId} | uid: ${uid}`);

  if (!isValidDocId(conversationId)) {
    res.status(400).json({
      error: 'invalid_request',
      message: 'A valid conversation ID parameter is required.',
    });
    return;
  }

  try {
    const diag = await deleteConversationServer(uid, conversationId, deleteToken);
    res.status(200).json({
      conversationId,
      success: true,
      diagnostics: diag,
    });
  } catch (error: any) {
    const sanitizedMsg = error?.message ? String(error.message).replace(/[A-Za-z0-9_-]{25,}/g, '[REDACTED]') : 'Unknown error';
    console.error(`[DELETE_CONVERSATION] Failed to delete conversation ${conversationId} for user ${uid}:`, sanitizedMsg);
    res.status(500).json({
      error: 'deletion_failed',
      message: sanitizedMsg,
    });
  }
});
