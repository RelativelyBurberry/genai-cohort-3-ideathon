import type { PatternShiftInsight, PatternShiftResponse } from '../types/patternshift';

/**
 * Client service for PatternShift Longitudinal Insights.
 * Communicates exclusively through authenticated backend API endpoints.
 */

export async function fetchLatestInsight(
  getIdToken: () => Promise<string | null>
): Promise<PatternShiftInsight | null> {
  const token = await getIdToken();
  if (!token) {
    throw new Error('Authentication required: Unable to acquire session token.');
  }

  const response = await fetch('/api/patternshift/latest', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const errorJson = await response.json().catch(() => ({}));
    throw new Error(
      errorJson.message || errorJson.error || `HTTP ${response.status} failed to load latest insight`
    );
  }

  const json = await response.json();
  return json.insight || null;
}

export async function triggerPatternAnalysis(
  getIdToken: () => Promise<string | null>
): Promise<PatternShiftResponse> {
  const token = await getIdToken();
  if (!token) {
    throw new Error('Authentication required: Unable to acquire session token.');
  }

  const response = await fetch('/api/patternshift/analyze', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });

  const json = await response.json().catch(() => ({}));

  if (response.status === 429) {
    return {
      status: 'error',
      error: 'rate_limit_exceeded',
      message: json.message || 'Analysis limit reached. Please wait a moment before re-analyzing.',
    };
  }

  if (!response.ok) {
    return {
      status: 'error',
      error: json.error || 'server_error',
      message: json.message || `Analysis failed with HTTP ${response.status}`,
    };
  }

  if (json.status === 'insufficient_data') {
    return {
      status: 'insufficient_data',
      required: json.required || 3,
      available: json.available || 0,
      message: json.message || 'More reflection history required.',
    };
  }

  if (json.status === 'success' && json.insight) {
    return {
      status: 'success',
      insight: json.insight,
    };
  }

  return {
    status: 'error',
    error: 'unexpected_response',
    message: 'Received unexpected response format from server.',
  };
}
