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
        return <ArrowUpRight className="w-4 h-4 text-emerald-600" />;
      case 'declining':
        return <ArrowDownRight className="w-4 h-4 text-amber-600" />;
      case 'stable':
        return <Minus className="w-4 h-4 text-slate-500" />;
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
    <div
      id="patternshift-workspace"
      className="h-full flex flex-col min-h-0 overflow-y-auto pr-1 pb-8 space-y-6"
    >
      {/* Header & Control Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-indigo-600" />
              <span>PatternShift Insights</span>
            </h2>
            <span className="px-2.5 py-0.5 text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-full">
              Longitudinal Intelligence
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1 max-w-xl">
            Identifies recurring emotional themes, tag correlations, and mood trajectories across your
            personal reflections. Non-clinical and grounded in your private records.
          </p>
        </div>

        <button
          type="button"
          id="btn-run-patternshift"
          onClick={handleRunAnalysis}
          disabled={analyzing}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-xs font-semibold rounded-xl shadow-xs transition cursor-pointer shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${analyzing ? 'animate-spin' : ''}`} />
          <span>{analyzing ? 'Analyzing Patterns...' : insight ? 'Update Analysis' : 'Run Analysis'}</span>
        </button>
      </div>

      {/* Error Banner */}
      {errorMessage && (
        <div
          id="patternshift-error"
          className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs flex items-start gap-3"
        >
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <span className="font-semibold">Analysis Encountered an Issue</span>
            <p className="text-rose-700">{errorMessage}</p>
          </div>
        </div>
      )}

      {/* Initial Loading Skeleton */}
      {loadingLatest && (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400 space-y-3">
          <RefreshCw className="w-6 h-6 animate-spin text-indigo-500" />
          <p className="text-xs text-slate-500">Retrieving latest longitudinal reflections...</p>
        </div>
      )}

      {/* Analyzing State Banner */}
      {analyzing && (
        <div
          id="patternshift-analyzing-card"
          className="p-6 rounded-2xl bg-indigo-50/70 border border-indigo-200 text-indigo-950 flex flex-col items-center justify-center text-center space-y-3 animate-fade-in"
        >
          <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600">
            <Sparkles className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-indigo-900">Computing Longitudinal Patterns</h3>
            <p className="text-xs text-indigo-700/80 mt-1 max-w-md">
              Extracting deterministic mood trajectories, tag frequencies, and non-clinical themes from your
              authenticated reflections...
            </p>
          </div>
        </div>
      )}

      {/* Insufficient Data State */}
      {!loadingLatest && !analyzing && insufficientDataInfo && (
        <div
          id="patternshift-insufficient-data"
          className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 flex flex-col items-center text-center space-y-4 shadow-xs"
        >
          <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600">
            <Layers className="w-6 h-6" />
          </div>
          <div className="max-w-md space-y-1.5">
            <h3 className="text-sm font-bold text-slate-900">More Reflection History Needed</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              PatternShift requires at least <strong className="text-slate-900">{insufficientDataInfo.required}</strong> meaningful
              journal entries or completed guided reflections to discover recurring themes and emotional
              trajectories.
            </p>
          </div>

          <div className="w-full max-w-xs bg-slate-100 rounded-full h-3 p-0.5 overflow-hidden border border-slate-200">
            <div
              className="bg-amber-500 h-full rounded-full transition-all duration-500"
              style={{
                width: `${Math.min(
                  100,
                  Math.round((insufficientDataInfo.available / insufficientDataInfo.required) * 100)
                )}%`,
              }}
            />
          </div>
          <span className="text-[11px] font-medium text-slate-500">
            {insufficientDataInfo.available} of {insufficientDataInfo.required} reflections recorded
          </span>

          <p className="text-[11px] text-slate-400 max-w-sm">
            Write a few more journal entries or complete a guided reflection session to unlock longitudinal insights.
          </p>
        </div>
      )}

      {/* Empty State (No previous analysis yet and not insufficient) */}
      {!loadingLatest && !analyzing && !insufficientDataInfo && !insight && (
        <div
          id="patternshift-empty-state"
          className="bg-white rounded-2xl border border-slate-200 p-8 flex flex-col items-center text-center space-y-4 shadow-xs"
        >
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
            <Sparkles className="w-6 h-6" />
          </div>
          <div className="max-w-md space-y-1.5">
            <h3 className="text-sm font-bold text-slate-900">Discover Your Reflection Patterns</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              PatternShift evaluates your journaling trajectory, recurring themes, and tag associations over time
              to offer gentle, non-clinical insights.
            </p>
          </div>
          <button
            type="button"
            onClick={handleRunAnalysis}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl shadow-xs transition cursor-pointer"
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
              <Info className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
              <span>Observational · Non-Clinical</span>
            </div>
          </div>

          {/* Metric Highlights Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Average Mood & Trajectory */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
              <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
                <span className="flex items-center gap-1.5">
                  <Smile className="w-3.5 h-3.5 text-amber-500" />
                  Mood Rating Average
                </span>
                <span className="text-[11px] font-mono text-slate-400">1–5 Scale</span>
              </div>
              <div className="my-3 flex items-baseline gap-2">
                <span className="text-2xl font-bold text-slate-900 font-mono">
                  {insight.metrics?.mood?.averageMood?.toFixed(1) || '—'}
                </span>
                <span className="text-xs text-slate-400">/ 5.0</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs font-medium text-slate-600 border-t border-slate-100 pt-2">
                {getTrajectoryIcon(insight.metrics?.mood?.trajectory)}
                <span>{getTrajectoryLabel(insight.metrics?.mood?.trajectory)}</span>
              </div>
            </div>

            {/* Total Reflected Content */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
              <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
                <span className="flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-indigo-500" />
                  Analyzed Records
                </span>
                <span className="text-[11px] font-mono text-slate-400">Deterministic</span>
              </div>
              <div className="my-3 flex items-baseline gap-2">
                <span className="text-2xl font-bold text-slate-900 font-mono">
                  {insight.itemCount?.total || 0}
                </span>
                <span className="text-xs text-slate-400">total reflections</span>
              </div>
              <div className="text-[11px] text-slate-500 border-t border-slate-100 pt-2">
                {insight.itemCount?.entries || 0} Entries · {insight.itemCount?.completedConversations || 0} Guided
              </div>
            </div>

            {/* Top Themes & Tags */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
              <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
                <span className="flex items-center gap-1.5">
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
                      className="px-2 py-0.5 text-[11px] font-medium bg-slate-100 text-slate-700 rounded-md border border-slate-200"
                    >
                      #{tag}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-slate-400 italic">No specific tags recorded</span>
                )}
              </div>
              <div className="text-[11px] text-slate-500 border-t border-slate-100 pt-2">
                {insight.metrics?.tags?.tagFrequencies?.length || 0} distinct tags extracted
              </div>
            </div>
          </div>

          {/* AI Observational Reflections */}
          <div
            id="patternshift-observations-section"
            className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-500" />
                <span>Reflective Observations</span>
              </h3>
              <span className="text-[11px] text-slate-400">AI Synthesized from Metrics</span>
            </div>

            <div className="space-y-3">
              {(insight.observations || []).map((obs, idx) => (
                <div
                  key={idx}
                  className="p-3.5 rounded-xl bg-slate-50/80 border border-slate-200/80 flex items-start gap-3"
                >
                  <CheckCircle2 className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-slate-700 leading-relaxed font-normal">{obs}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Suggested Inquiries for Future Reflection */}
          <div
            id="patternshift-inquiries-section"
            className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <HelpCircle className="w-4 h-4 text-indigo-600" />
                <span>Questions for Future Journaling</span>
              </h3>
              <span className="text-[11px] text-slate-400">Open-Ended Inquiries</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {(insight.suggestedInquiries || []).map((inquiry, idx) => (
                <div
                  key={idx}
                  className="p-4 rounded-xl bg-indigo-50/40 border border-indigo-100/80 flex flex-col justify-between space-y-2"
                >
                  <p className="text-xs text-indigo-950 font-medium leading-relaxed italic">
                    "{inquiry}"
                  </p>
                  <span className="text-[10px] text-indigo-700/60 font-medium">
                    Prompt {idx + 1}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Tag & Mood Correlation Matrix (Deterministic) */}
          {(insight.metrics?.tags?.tagMoodAssociations || []).length > 0 && (
            <div
              id="patternshift-tag-associations"
              className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-3"
            >
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Tag className="w-4 h-4 text-emerald-600" />
                <span>Tag & Mood Correlations</span>
              </h3>
              <p className="text-xs text-slate-500">
                Average mood ratings recorded on days with specific tags.
              </p>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2">
                {insight.metrics.tags.tagMoodAssociations.slice(0, 8).map((assoc) => (
                  <div
                    key={assoc.tag}
                    className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/80 flex items-center justify-between"
                  >
                    <span className="text-xs font-medium text-slate-700 truncate mr-2">
                      #{assoc.tag}
                    </span>
                    <span className="text-xs font-bold text-indigo-700 font-mono shrink-0">
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
