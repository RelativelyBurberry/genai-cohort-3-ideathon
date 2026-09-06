/**
 * PrivacySafeSystemOverview - Demo Admin Console: Privacy-safe system overview
 * 
 * Shows ONLY aggregate/anonymized system indicators.
 * Does NOT query or expose:
 * - Other users' journal/reflection content
 * - Other users' private data
 * - Raw Gemini prompts or responses
 * - Authentication tokens
 * - Private Firestore documents
 * - Personally identifiable reflection content
 * 
 * In production this data comes from the /api/admin/overview endpoint
 * which returns only server-computed indicators.
 * In demo mode it shows the same shape with local synthetic values.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Activity, Server, Database, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useIsDemoSession } from '../../demo';

interface SystemOverviewData {
  activeFeatureModules: { id: string; label: string; enabled: boolean }[];
  aiServiceAvailability: {
    geminiConfigured: boolean;
    secretManagerConfigured: boolean;
  };
  securityBoundaries: Record<string, boolean>;
  firestoreAuthorization: Record<string, boolean>;
}

interface OverviewResponse {
  authorization: {
    authenticated: boolean;
    role?: string;
    authorizationVerified: boolean;
    accessScope: string;
  };
  systemOverview: SystemOverviewData;
}

export const PrivacySafeSystemOverview: React.FC = () => {
  const { getIdToken } = useAuth();
  const isDemo = useIsDemoSession();
  const [data, setData] = useState<SystemOverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<'backend' | 'demo'>('demo');

  // Demo dataset — privacy-safe aggregate indicators only
  const DEMO_OVERVIEW: SystemOverviewData = {
    activeFeatureModules: [
      { id: 'journal', label: 'Journal', enabled: true },
      { id: 'guided_reflection', label: 'Guided Reflection', enabled: true },
      { id: 'patternshift', label: 'PatternShift', enabled: true },
    ],
    aiServiceAvailability: {
      geminiConfigured: true,
      secretManagerConfigured: false,
    },
    securityBoundaries: {
      authenticationVerified: true,
      roleResolutionActive: true,
      adminEmailAllowlistConfigured: true,
      routeAuthorizationEnforced: true,
      serverAuthorizationBoundaryActive: true,
      crossUserReflectionAccessDenied: true,
    },
    firestoreAuthorization: {
      ownerScopedReads: true,
      adminRoleFieldProtected: true,
      defaultDenyAllOtherPaths: true,
      conversationLifecycleProtected: true,
      insightsWriteProtected: true,
      rateLimitDocumentsProtected: true,
    },
  };

  const fetchOverview = useCallback(async () => {
    if (isDemo) {
      // Demo mode: use local synthetic overview (never calls the backend)
      setData(DEMO_OVERVIEW);
      setSource('demo');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const token = await getIdToken(false);
      if (!token) {
        setError('Unable to acquire ID token.');
        setLoading(false);
        return;
      }

      const response = await fetch('/api/admin/overview', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        setError(`Access denied (HTTP ${response.status}). The backend rejected this request.`);
        setLoading(false);
        return;
      }

      const json: OverviewResponse = await response.json();
      setData(json.systemOverview);
      setSource('backend');
    } catch (err: any) {
      setError(err?.message || 'Failed to load system overview.');
    } finally {
      setLoading(false);
    }
  }, [getIdToken, isDemo]);

  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  if (loading) {
    return (
      <div className="admin-card admin-overview-card" id="admin-system-overview">
        <p className="admin-card-kicker">PRIVACY-SAFE SYSTEM OVERVIEW</p>
        <h2 className="admin-card-title">System status</h2>
        <div className="admin-loading">
          <Loader2 className="admin-loading-spinner" aria-hidden="true" />
          <span>Loading privacy-safe indicators…</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="admin-card admin-overview-card" id="admin-system-overview">
        <p className="admin-card-kicker">PRIVACY-SAFE SYSTEM OVERVIEW</p>
        <h2 className="admin-card-title">System status</h2>
        <div className="admin-error">
          <AlertTriangle className="admin-error-icon" aria-hidden="true" />
          <span>{error}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-card admin-overview-card" id="admin-system-overview">
      <p className="admin-card-kicker">PRIVACY-SAFE SYSTEM OVERVIEW</p>
      <h2 className="admin-card-title">System status</h2>
      <p className="admin-card-copy">
        Aggregate, anonymized indicators only. No user reflections, journal entries, or
        raw AI content are shown here.
      </p>
      <p className="admin-overview-source">
        Source: <strong>{source === 'backend' ? 'Server-verified' : 'Demo (local synthetic)'}</strong>
      </p>

      {/* Active feature modules */}
      <h3 className="admin-overview-heading">
        <Activity className="admin-overview-heading-icon" aria-hidden="true" />
        Active feature modules
      </h3>
      <ul className="admin-overview-list">
        {data?.activeFeatureModules.map((mod) => (
          <li key={mod.id} className="admin-overview-item">
            <span className="admin-overview-item-label">{mod.label}</span>
            <span className={`admin-overview-item-status ${mod.enabled ? 'ok' : 'off'}`}>
              {mod.enabled ? 'ACTIVE' : 'UNAVAILABLE'}
            </span>
          </li>
        ))}
      </ul>

      {/* AI service availability */}
      <h3 className="admin-overview-heading">
        <Server className="admin-overview-heading-icon" aria-hidden="true" />
        AI service availability
      </h3>
      <ul className="admin-overview-list">
        <li className="admin-overview-item">
          <span className="admin-overview-item-label">Gemini AI service</span>
          <span className={`admin-overview-item-status ${data?.aiServiceAvailability.geminiConfigured ? 'ok' : 'off'}`}>
            {data?.aiServiceAvailability.geminiConfigured ? 'CONFIGURED' : 'NOT CONFIGURED'}
          </span>
        </li>
        <li className="admin-overview-item">
          <span className="admin-overview-item-label">Secret Manager</span>
          <span className={`admin-overview-item-status ${data?.aiServiceAvailability.secretManagerConfigured ? 'ok' : 'off'}`}>
            {data?.aiServiceAvailability.secretManagerConfigured ? 'CONFIGURED' : 'NOT CONFIGURED'}
          </span>
        </li>
      </ul>

      {/* Security boundaries */}
      <h3 className="admin-overview-heading">
        <Database className="admin-overview-heading-icon" aria-hidden="true" />
        Security boundaries enabled
      </h3>
      <ul className="admin-overview-list admin-overview-list-check">
        {data && Object.entries(data.securityBoundaries).map(([key, enabled]) => (
          <li key={key} className="admin-overview-item">
            <span className="admin-overview-item-label">
              {enabled && <CheckCircle2 className="admin-overview-check-icon" aria-hidden="true" />}
              {formatBoundaryLabel(key)}
            </span>
            <span className={`admin-overview-item-status ${enabled ? 'ok' : 'off'}`}>
              {enabled ? 'ENABLED' : 'DISABLED'}
            </span>
          </li>
        ))}
      </ul>

      {/* Firestore authorization */}
      <h3 className="admin-overview-heading">
        <Database className="admin-overview-heading-icon" aria-hidden="true" />
        Firestore authorization
      </h3>
      <ul className="admin-overview-list admin-overview-list-check">
        {data && Object.entries(data.firestoreAuthorization).map(([key, enabled]) => (
          <li key={key} className="admin-overview-item">
            <span className="admin-overview-item-label">
              {enabled && <CheckCircle2 className="admin-overview-check-icon" aria-hidden="true" />}
              {formatBoundaryLabel(key)}
            </span>
            <span className={`admin-overview-item-status ${enabled ? 'ok' : 'off'}`}>
              {enabled ? 'ENABLED' : 'DISABLED'}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
};

/**
 * Convert camelCase boundary keys to readable labels
 */
function formatBoundaryLabel(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (c) => c.toUpperCase());
}