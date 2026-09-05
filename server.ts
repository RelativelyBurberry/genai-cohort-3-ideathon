import dotenv from 'dotenv';
dotenv.config({ override: true });
import express from 'express';
import path from 'path';
import crypto from 'crypto';
import { createServer as createViteServer } from 'vite';
import { requireAuth, AuthenticatedRequest, logAuthConfigStartup } from './server/middleware/auth.js';
import { reflectionRouter } from './server/routes/reflection.js';
import { patternShiftRouter } from './server/routes/patternShift.js';

const app = express();
const PORT = 3000;

// Body parsing with strict size limit to prevent payload flooding
app.use(express.json({ limit: '64kb' }));

// Privacy-safe observability middleware
// Strictly logs ONLY metadata: requestId, timestamp, endpoint, status, latency
// Never logs request bodies, response reflection content, tokens, or auth headers
app.use((req, res, next) => {
  const start = Date.now();
  const requestId = crypto.randomUUID();
  res.setHeader('X-Request-Id', requestId);

  res.on('finish', () => {
    const latency = Date.now() - start;
    // Pseudonymized user identifier if authenticated (first 8 chars of SHA-256 hash)
    const userUid = (req as AuthenticatedRequest).user?.uid;
    const pseudoUid = userUid
      ? crypto.createHash('sha256').update(userUid).digest('hex').slice(0, 8)
      : 'anonymous';

    // Structured, privacy-safe audit record
    console.log(
      JSON.stringify({
        requestId,
        timestamp: new Date().toISOString(),
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        latencyMs: latency,
        clientHash: pseudoUid,
      })
    );
  });

  next();
});

// 1. Health Probe (Public)
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
  });
});

// 2. Identity Verification Test Endpoint (Protected)
// Demonstrates that Firebase ID tokens are strictly verified and UID is derived exclusively from the token
app.get('/api/auth/me', requireAuth, (req: AuthenticatedRequest, res) => {
  res.status(200).json({
    authenticated: true,
    user: {
      uid: req.user?.uid,
      email: req.user?.email,
    },
  });
});

// 3. Milestone 3 Guided Reflection & Summarization Routes
app.use(reflectionRouter);

// 4. Milestone 5 PatternShift Longitudinal Insights Routes
app.use(patternShiftRouter);

// Fallback for API routes
app.all('/api/*', (req, res) => {
  res.status(404).json({ error: 'not_found', message: 'API endpoint does not exist.' });
});

async function startServer() {
  // Vite middleware in development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // In production, serve static frontend from dist
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Reflectra] Server listening on http://0.0.0.0:${PORT}`);
    logAuthConfigStartup();
  });
}

startServer().catch((err) => {
  console.error('[Reflectra] Failed to start server:', err);
  process.exit(1);
});
