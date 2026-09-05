import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  TrendingUp,
  Calendar,
  Layers,
  HelpCircle,
  RefreshCw,
  AlertCircle,
  Tag,
  Smile,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  CheckCircle2,
  Info,
  ChevronRight,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useDemo, useIsDemoSession } from '../../demo';
import { fetchLatestInsight, triggerPatternAnalysis } from '../../services/patternShiftService';
import type { PatternShiftInsight, PatternShiftResponse } from '../../types/patternshift';

export const PatternShiftDashboard: React.FC = () => {
  const { getIdToken } = useAuth();
  const { isDemoSession, demoPatternInsight } = useDemo();
  const isDemo = useIsDemoSession();
  const [insight, setInsight] = useState<PatternShiftInsight | null>(null);
  const [loadingLatest, setLoadingLatest] = useState<boolean>(true);
  const [analyzing, setAnalyzing] = useState<boolean>(false);
  const [insufficientDataInfo, setInsufficientDataInfo] = useState<{
    available: number;
    required: number;
  } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Load existing persisted insight on mount (or demo insight)
  useEffect(() => {
    if (isDemo) {
      setInsight(demoPatternInsight);
      setLoadingLatest(false);
      return;
    }

    let isMounted = true;
    async function loadLatest() {
      setLoadingLatest(true);
      setErrorMessage(null);
      try {
        const latest = await fetchLatestInsight(getIdToken);
        if (isMounted) {
          if (latest) {
            setInsight(latest);
            setInsufficientDataInfo(null);
          }
        }
      } catch (err: any) {
        if (isMounted) {
          console.warn('[PatternShiftDashboard] No previous insight loaded:', err.message);
        }
      } finally {
        if (isMounted) {
          setLoadingLatest(false);
        }
      }
    }

    loadLatest();
    return () => {
      isMounted = false;
    };
  }, [getIdToken, isDemo, demoPatternInsight]);

  const handleRunAnalysis = async () => {
    // DEMO MODE: show demo notice instead of real analysis
    if (isDemo) {
      setErrorMessage('Demo mode: PatternShift analysis requires the backend. Showing synthetic demo insight.');
      if (!insight && demoPatternInsight) {
        setInsight(demoPatternInsight);
      }
      return;
    }

    setAnalyzing(true);
    setErrorMessage(null);
    try {
      const response: PatternShiftResponse = await triggerPatternAnalysis(getIdToken);
      if (response.status === 'success') {
        setInsight(response.insight);
        setInsufficientDataInfo(null);
      } else if (response.status === 'insufficient_data') {
        setInsufficientDataInfo({
          available: response.available,
          required: response.required,
        });
      } else {
        setErrorMessage(response.message || 'Analysis failed.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'An unexpected error occurred during analysis.');
    } finally {
      setAnalyzing(false);
    }
  };

  const formatDate = (isoString?: string) => {
    if (!isoString) return '';
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return isoString;
    }
  };

  const getTrajectoryIcon = (trajectory?: string) => {
    switch (trajectory) {
      case 'improving':
        return <ArrowUpRight className="w-4 h-4" />;
      case 'declining':
        return <ArrowDownRight className="w-4 h-4" />;
      case 'stable':
        return <Minus className="w-4 h-4" />;
      default:
        return null;
    }
  };

  const getTrajectoryLabel = (trajectory?: string) => {
    switch (trajectory) {
      case 'improving':
        return 'Upward Trajectory';
      case 'declining':
        return 'Shifting Lower';
      case 'stable':
        return 'Consistent Level';
      default:
        return 'Baseline Establishing';
    }
  };

  return (
    <div id="patternshift-workspace" className="patternshift-page">
      {/* Header */}
      <div className="patternshift-header">
        <div className="patternshift-eyebrow">PatternShift</div>
        <h1 className="patternshift-title">The patterns beneath your thoughts.</h1>
        <p className="patternshift-subtitle">
          A quieter look at the themes, rhythms, and connections emerging across your reflections.
        </p>
        
        <button
          type="button"
          id="btn-run-patternshift"
          onClick={handleRunAnalysis}
          disabled={analyzing}
          className="patternshift-update-btn"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${analyzing ? 'animate-spin' : ''}`} />
          <span>{analyzing ? 'Analyzing Patterns...' : insight ? 'Update Analysis' : 'Run Analysis'}</span>
        </button>
      </div>

      {/* Error Banner */}
      {errorMessage && (
        <div id="patternshift-error" className="patternshift-error">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <span className="font-semibold">Analysis Encountered an Issue</span>
            <p className="text-rose-700">{errorMessage}</p>
          </div>
        </div>
      )}

      {/* Initial Loading Skeleton */}
      {loadingLatest && (
        <div className="reflection-loading">
          <RefreshCw className="w-6 h-6 animate-spin" style={{ color: 'var(--color-primary)' }} />
          <p className="text-xs text-slate-500">Retrieving latest longitudinal reflections...</p>
        </div>
      )}

      {/* Analyzing State Banner */}
      {analyzing && (
        <div id="patternshift-analyzing-card" className="patternshift-analyzing">
          <div className="patternshift-analyzing-icon">
            <Sparkles className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h3 className="patternshift-analyzing-title">Computing Longitudinal Patterns</h3>
            <p className="patternshift-analyzing-text">
              Extracting deterministic mood trajectories, tag frequencies, and non-clinical themes from your
              authenticated reflections...
            </p>
          </div>
        </div>
      )}

      {/* Insufficient Data State */}
      {!loadingLatest && !analyzing && insufficientDataInfo && (
        <div id="patternshift-insufficient-data" className="patternshift-insufficient">
          <div className="patternshift-insufficient-icon">
            <Layers className="w-6 h-6" />
          </div>
          <div className="max-w-md space-y-1.5">
            <h3 className="patternshift-insufficient-title">More Reflection History Needed</h3>
            <p className="patternshift-insufficient-text">
              PatternShift requires at least <strong className="text-slate-900">{insufficientDataInfo.required}</strong> meaningful
              journal entries or completed guided reflections to discover recurring themes and emotional
              trajectories.
            </p>
          </div>

          <div className="patternshift-progress-bar">
            <div
              className="patternshift-progress-fill"
              style={{
                width: `${Math.min(
                  100,
                  Math.round((insufficientDataInfo.available / insufficientDataInfo.required) * 100)
                )}%`,
              }}
            />
          </div>
          <span className="patternshift-progress-label">
            {insufficientDataInfo.available} of {insufficientDataInfo.required} reflections recorded
          </span>

          <p className="text-[11px] text-slate-400 max-w-sm">
            Write a few more journal entries or complete a guided reflection session to unlock longitudinal insights.
          </p>
        </div>
      )}

      {/* Empty State (No previous analysis yet and not insufficient) */}
      {!loadingLatest && !analyzing && !insufficientDataInfo && !insight && (
        <div id="patternshift-empty-state" className="patternshift-empty">
          <div className="patternshift-empty-icon">
            <Sparkles className="w-6 h-6" />
          </div>
          <div className="max-w-md space-y-1.5">
            <h3 className="patternshift-empty-title">Discover Your Reflection Patterns</h3>
            <p className="patternshift-empty-text">
              PatternShift evaluates your journaling trajectory, recurring themes, and tag associations over time
              to offer gentle, non-clinical insights.
            </p>
          </div>
          <button
            type="button"
            onClick={handleRunAnalysis}
            className="patternshift-empty-btn"
          >
            <TrendingUp className="w-3.5 h-3.5" />
            <span>Generate Longitudinal Insights</span>
          </button>
        </div>
      )}

      {/* Active Generated Insight View */}
      {!loadingLatest && insight && (
        <div id="patternshift-results" className="space-y-6 animate-fade-in">
          {/* Metadata & Non-Clinical Framing Banner */}
          <div className="bg-slate-900 text-white rounded-2xl p-5 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-semibold text-slate-100">Analysis Summary</span>
                <span className="text-slate-400">·</span>
                <span className="text-slate-300 flex items-center gap-1">
                  <Calendar className="w-3 h-3 text-slate-400" />
                  {formatDate(insight.timeRange?.start)} – {formatDate(insight.timeRange?.end)}
                </span>
              </div>
              <p className="text-xs text-slate-300">
                Grounded in{' '}
                <strong className="text-white font-medium">
                  {insight.itemCount?.entries || 0} journal entries
                </strong>{' '}
                and{' '}
                <strong className="text-white font-medium">
                  {insight.itemCount?.completedConversations || 0} completed guided reflections
                </strong>
                .
              </p>
            </div>

            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/90 border border-slate-700 text-[11px] text-slate-300 shrink-0">
              <Info className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>Observational · Non-Clinical</span>
            </div>
          </div>

          {/* Overview Section */}
          <div className="patternshift-overview">
            <div className="patternshift-overview-eyebrow">Your Recent Rhythm</div>
            <h2 className="patternshift-overview-title">A short human-readable overview generated from the existing analysis data.</h2>
            <p className="patternshift-overview-text">
              {insight.metrics?.mood?.averageMood ? (
                <>
                  Your average mood rating is <strong>{insight.metrics.mood.averageMood.toFixed(1)}/5.0</strong> with a 
                  <strong>{getTrajectoryLabel(insight.metrics.mood.trajectory).toLowerCase()}</strong> trajectory. 
                  {insight.itemCount?.total} reflections analyzed reveal{' '}
                  {insight.metrics.tags?.topTags?.length > 0
                    ? `primary focus on ${insight.metrics.tags.topTags.slice(0, 3).join(', ')}`
                    : 'emerging themes'}
                  .
                </>
              ) : (
                'Patterns are beginning to emerge as you continue reflecting.'
              )}
            </p>
            <div className="patternshift-disclaimer">
              <strong>Observational & Non-Clinical:</strong> These insights are synthesized from your private reflection data 
              using deterministic analysis. They are not medical, psychological, or diagnostic assessments.
            </div>
          </div>

          {/* Key Signals Grid */}
          <div className="patternshift-signals">
            {/* Average Mood & Trajectory */}
            <div className="patternshift-signal-card">
              <div className="patternshift-signal-header">
                <span className="patternshift-signal-label">
                  <Smile className="w-3.5 h-3.5 text-amber-500" />
                  Mood Rating Average
                </span>
                <span className="text-[11px] font-mono text-slate-400">1–5 Scale</span>
              </div>
              <div className="patternshift-signal-value">
                {insight.metrics?.mood?.averageMood?.toFixed(1) || '—'}
              </div>
              <div className="patternshift-signal-meta">
                {getTrajectoryIcon(insight.metrics?.mood?.trajectory)}
                <span>{getTrajectoryLabel(insight.metrics?.mood?.trajectory)}</span>
              </div>
            </div>

            {/* Total Reflected Content */}
            <div className="patternshift-signal-card">
              <div className="patternshift-signal-header">
                <span className="patternshift-signal-label">
                  <Layers className="w-3.5 h-3.5 text-indigo-500" />
                  Analyzed Records
                </span>
                <span className="text-[11px] font-mono text-slate-400">Deterministic</span>
              </div>
              <div className="patternshift-signal-value">
                {insight.itemCount?.total || 0}
              </div>
              <div className="patternshift-signal-meta">
                {insight.itemCount?.entries || 0} Entries · {insight.itemCount?.completedConversations || 0} Guided
              </div>
            </div>

            {/* Top Themes & Tags */}
            <div className="patternshift-signal-card">
              <div className="patternshift-signal-header">
                <span className="patternshift-signal-label">
                  <Tag className="w-3.5 h-3.5 text-emerald-500" />
                  Primary Focus Areas
                </span>
                <span className="text-[11px] font-mono text-slate-400">Recurring</span>
              </div>
              <div className="my-2 flex flex-wrap gap-1">
                {(insight.metrics?.tags?.topTags || []).length > 0 ? (
                  insight.metrics.tags.topTags.map((tag) => (
                    <span
                      key={tag}
                      className="px-2.5 py-0.5 text-[11px] font-medium bg-slate-100 text-slate-700 rounded-md border border-slate-200"
                    >
                      #{tag}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-slate-400 italic">No specific tags recorded</span>
                )}
              </div>
              <div className="patternshift-signal-meta">
                {insight.metrics?.tags?.tagFrequencies?.length || 0} distinct tags extracted
              </div>
            </div>
          </div>

          {/* Observations Section */}
          <div className="patternshift-observations">
            <div className="patternshift-section-header">
              <h3 className="patternshift-section-title">
                <Sparkles className="w-4 h-4 text-amber-500" />
                <span>Things Worth Noticing</span>
              </h3>
              <span className="patternshift-section-badge">AI Synthesized from Metrics</span>
            </div>

            <div className="space-y-3">
              {(insight.observations || []).map((obs, idx) => (
                <div
                  key={idx}
                  className="patternshift-observation"
                >
                  <CheckCircle2 className="patternshift-observation-icon w-4 h-4 shrink-0 mt-0.5" />
                  <p className="text-xs leading-relaxed font-normal">{obs}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Recurring Themes Section */}
          {(insight.metrics?.tags?.topTags || []).length > 0 && (
            <div className="patternshift-themes">
              <div className="patternshift-section-header">
                <h3 className="patternshift-section-title">
                  <Tag className="w-4 h-4 text-emerald-600" />
                  <span>Themes Returning to You</span>
                </h3>
                <span className="patternshift-section-badge">{insight.metrics.tags.tagFrequencies?.length || 0} distinct themes</span>
              </div>

              <div className="patternshift-themes-list">
                {insight.metrics.tags.topTags.map((tag) => (
                  <span key={tag} className="patternshift-theme-tag">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Suggested Inquiries for Future Reflection */}
          {(insight.suggestedInquiries || []).length > 0 && (
            <div className="patternshift-inquiries">
              <div className="patternshift-section-header">
                <h3 className="patternshift-section-title">
                  <HelpCircle className="w-4 h-4 text-indigo-600" />
                  <span>Questions for Future Journaling</span>
                </h3>
                <span className="patternshift-section-badge">Open-Ended Inquiries</span>
              </div>

              <div className="patternshift-inquiry-grid">
                {(insight.suggestedInquiries || []).map((inquiry, idx) => (
                  <div key={idx} className="patternshift-inquiry-card">
                    <p className="patternshift-inquiry-text">"{inquiry}"</p>
                    <span className="patternshift-inquiry-label">Prompt {idx + 1}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tag & Mood Correlation Matrix (Deterministic) */}
          {(insight.metrics?.tags?.tagMoodAssociations || []).length > 0 && (
            <div className="patternshift-correlations">
              <div className="patternshift-section-header">
                <h3 className="patternshift-section-title">
                  <Tag className="w-4 h-4 text-emerald-600" />
                  <span>Tag & Mood Correlations</span>
                </h3>
              </div>
              <p className="text-xs text-slate-500 mb-4">
                Average mood ratings recorded on days with specific tags.
              </p>

              <div className="patternshift-correlation-grid">
                {insight.metrics.tags.tagMoodAssociations.slice(0, 8).map((assoc) => (
                  <div key={assoc.tag} className="patternshift-correlation-item">
                    <span className="patternshift-correlation-tag">#{assoc.tag}</span>
                    <span className="patternshift-correlation-value">
                      {assoc.averageMood.toFixed(1)} ★
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};