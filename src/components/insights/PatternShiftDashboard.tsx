import React, { useState, useEffect, useId } from 'react';
import {
  Sparkles,
  TrendingUp,
  TrendingDown,
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
  Activity,
  ChevronDown,
  Clock,
  MapPin,
  Moon,
  Sunrise,
  Sun,
  Sunset,
  Shuffle,
  Route,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useDemo, useIsDemoSession } from '../../demo';
import { fetchLatestInsight, triggerPatternAnalysis } from '../../services/patternShiftService';
import type { PatternShiftInsight, PatternShiftResponse } from '../../types/patternshift';
import { TIME_BUCKET_DISPLAY } from '../../intelligence/patternAnalysis';
import type {
  PatternIntelligence,
  PatternEvidence,
  MoodTrajectoryResult,
  ReflectionRhythmResult,
  ReflectionFrequencyResult,
  ThemeEvolutionResult,
  UnusualTimingResult,
  LocationPatternsResult,
} from '../../intelligence/patternAnalysis';

// ---------------------------------------------------------------------------
// Phase 10: Evidence-Grounded Intelligence sections
// Every surfaced pattern carries a "Why am I seeing this?" disclosure that
// answers how many reflections contributed and how the observation was
// computed — never exposing raw private content.
// ---------------------------------------------------------------------------

const BUCKET_ORDER: ReadonlyArray<'night' | 'morning' | 'afternoon' | 'evening'> = [
  'night',
  'morning',
  'afternoon',
  'evening',
];

const BUCKET_ICONS: Record<string, React.ReactNode> = {
  night: <Moon className="w-3.5 h-3.5" />,
  morning: <Sunrise className="w-3.5 h-3.5" />,
  afternoon: <Sun className="w-3.5 h-3.5" />,
  evening: <Sunset className="w-3.5 h-3.5" />,
};

const MOOD_TRAJECTORY_PRESENTATION: Record<string, { label: string; icon: React.ReactNode }> = {
  upward: { label: 'Generally Upward', icon: <ArrowUpRight className="w-4 h-4" /> },
  downward: { label: 'Shifting Lower', icon: <ArrowDownRight className="w-4 h-4" /> },
  stable: { label: 'Steady', icon: <Minus className="w-4 h-4" /> },
  high_variability: { label: 'Varied Swings', icon: <Activity className="w-4 h-4" /> },
};

const CADENCE_PRESENTATION: Record<string, { label: string; icon: React.ReactNode }> = {
  increasing: { label: 'Closer Together', icon: <TrendingUp className="w-4 h-4" /> },
  decreasing: { label: 'More Spaced Out', icon: <TrendingDown className="w-4 h-4" /> },
  consistent: { label: 'Steady Rhythm', icon: <Activity className="w-4 h-4" /> },
  irregular: { label: 'Irregular', icon: <Shuffle className="w-4 h-4" /> },
};

const formatDateOnly = (isoDate?: string): string => {
  if (!isoDate) return '';
  const d = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(d.getTime())) return isoDate;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

const formatHour = (hour: number): string => {
  const d = new Date(2000, 0, 1, hour, 0);
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
};

const humanizeKey = (key: string): string =>
  key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (c) => c.toUpperCase())
    .trim();

const formatStat = (value: number): string => {
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
};

const confidenceTone = (confidence?: string): string => {
  switch (confidence) {
    case 'strong':
      return 'patternshift-confidence-strong';
    case 'moderate':
      return 'patternshift-confidence-moderate';
    default:
      return 'patternshift-confidence-low';
  }
};

/** Accessible "Why am I seeing this?" disclosure backed by PatternEvidence. */
const EvidenceDisclosure: React.FC<{ evidence?: PatternEvidence | null }> = ({ evidence }) => {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  if (!evidence) return null;

  const breakdownEntries = Object.entries(
    evidence.breakdown || {}
  ) as Array<[string, number]>;

  return (
    <div className="patternshift-evidence">
      <button
        type="button"
        className="patternshift-evidence-toggle"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
      >
        <Info className="w-3.5 h-3.5" />
        <span>{open ? 'Hide the reasoning' : 'Why am I seeing this?'}</span>
        <ChevronDown className="patternshift-evidence-chevron" />
      </button>
      {open && (
        <div id={panelId} className="patternshift-evidence-body">
          <p className="patternshift-evidence-explanation">{evidence.explanation}</p>
          <div className="patternshift-evidence-meta">
            <span>
              Based on <strong>{evidence.sampleSize}</strong> reflections
            </span>
            <span className={`patternshift-confidence ${confidenceTone(evidence.confidence)}`}>
              {evidence.confidence} confidence
            </span>
            {evidence.periodStart || evidence.periodEnd ? (
              <span>
                {formatDateOnly(evidence.periodStart)}
                {evidence.periodStart && evidence.periodEnd ? ' – ' : ''}
                {formatDateOnly(evidence.periodEnd)}
              </span>
            ) : null}
          </div>
          {breakdownEntries.length > 0 && (
            <div className="patternshift-evidence-breakdown">
              {breakdownEntries.map(([key, value]) => (
                <span key={key} className="patternshift-evidence-stat">
                  <span className="patternshift-evidence-key">{humanizeKey(key)}</span>
                  <strong className="patternshift-evidence-value">{formatStat(value)}</strong>
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const MoodTrajectoryCard: React.FC<{ mood: MoodTrajectoryResult }> = ({ mood }) => {
  if (mood.status !== 'available') return null;
  const presentation =
    MOOD_TRAJECTORY_PRESENTATION[mood.trajectory] || MOOD_TRAJECTORY_PRESENTATION.stable;

  return (
    <div className="patternshift-rhythm-card">
      <div className="patternshift-rhythm-card-header">
        <span className="patternshift-rhythm-card-label">
          <Smile className="w-3.5 h-3.5 text-amber-500" />
          Mood Over Time
        </span>
        <span className="patternshift-rhythm-card-conf">Measured</span>
      </div>
      <div className="patternshift-rhythm-value">
        {presentation.icon}
        <span>{presentation.label}</span>
      </div>
      {mood.earlyAverageMood !== null && mood.recentAverageMood !== null && (
        <div className="patternshift-rhythm-meta">
          Average rating moved from <strong>{mood.earlyAverageMood}</strong> →{' '}
          <strong>{mood.recentAverageMood}</strong> / 5 across the period
        </div>
      )}
      {mood.observation && (
        <p className="patternshift-rhythm-observation">{mood.observation}</p>
      )}
      <EvidenceDisclosure evidence={mood.evidence} />
    </div>
  );
};

const ReflectionRhythmCard: React.FC<{ rhythm: ReflectionRhythmResult }> = ({ rhythm }) => {
  if (rhythm.status !== 'available') return null;
  const maxCount = Math.max(...BUCKET_ORDER.map((bucket) => rhythm.buckets[bucket]), 1);

  return (
    <div className="patternshift-rhythm-card">
      <div className="patternshift-rhythm-card-header">
        <span className="patternshift-rhythm-card-label">
          <Clock className="w-3.5 h-3.5 text-indigo-500" />
          When You Reflect
        </span>
        <span className="patternshift-rhythm-card-conf">Deterministic</span>
      </div>
      <div className="patternshift-rhythm-buckets">
        {BUCKET_ORDER.map((bucket) => {
          const count = rhythm.buckets[bucket];
          if (count === 0) return null;
          const width = Math.max(14, Math.round((count / maxCount) * 100));
          return (
            <div key={bucket} className="patternshift-rhythm-bucket">
              <span className="patternshift-rhythm-bucket-label">
                {BUCKET_ICONS[bucket]}
                {TIME_BUCKET_DISPLAY[bucket]}
              </span>
              <span className="patternshift-rhythm-bucket-track">
                <span
                  className={`patternshift-rhythm-bucket-bar bucket-${bucket}`}
                  style={{ width: `${width}%` }}
                />
              </span>
              <span className="patternshift-rhythm-bucket-count">{count}</span>
            </div>
          );
        })}
      </div>
      {rhythm.observation && (
        <p className="patternshift-rhythm-observation">{rhythm.observation}</p>
      )}
      <EvidenceDisclosure evidence={rhythm.evidence} />
    </div>
  );
};

const ReflectionFrequencyCard: React.FC<{ frequency: ReflectionFrequencyResult }> = ({
  frequency,
}) => {
  if (frequency.status !== 'available') return null;
  const presentation =
    CADENCE_PRESENTATION[frequency.cadence] || CADENCE_PRESENTATION.consistent;

  return (
    <div className="patternshift-rhythm-card">
      <div className="patternshift-rhythm-card-header">
        <span className="patternshift-rhythm-card-label">
          <Activity className="w-3.5 h-3.5 text-emerald-600" />
          How Often You Reflect
        </span>
        <span className="patternshift-rhythm-card-conf">Measured</span>
      </div>
      <div className="patternshift-rhythm-value">
        {presentation.icon}
        <span>{presentation.label}</span>
      </div>
      {frequency.avgGapDays !== null && (
        <div className="patternshift-rhythm-meta">
          About <strong>{frequency.avgGapDays} days</strong> between reflections on average
          {frequency.maxGapDays !== null ? ` · longest pause ${frequency.maxGapDays} days` : ''}
        </div>
      )}
      {frequency.observation && (
        <p className="patternshift-rhythm-observation">{frequency.observation}</p>
      )}
      <EvidenceDisclosure evidence={frequency.evidence} />
    </div>
  );
};

const ThemeEvolutionSection: React.FC<{ evolution: ThemeEvolutionResult }> = ({ evolution }) => {
  if (evolution.status !== 'available') return null;
  const hasAny =
    evolution.emergingThemes.length +
      evolution.increasingThemes.length +
      evolution.persistentThemes.length +
      evolution.fadingThemes.length >
    0;
  if (!hasAny) return null;

  return (
    <div className="patternshift-evo">
      <div className="patternshift-section-header">
        <h3 className="patternshift-section-title">
          <Route className="w-4 h-4 text-emerald-600" />
          <span>How Your Themes Are Evolving</span>
        </h3>
        <span className="patternshift-section-badge">Deterministic · Evidence-Grounded</span>
      </div>

      {evolution.observation && (
        <p className="patternshift-evo-observation">{evolution.observation}</p>
      )}

      <div className="patternshift-evo-groups">
        {evolution.emergingThemes.length > 0 && (
          <div className="patternshift-evo-group">
            <span className="patternshift-evo-group-label emerging">
              Emerging in your recent reflections
            </span>
            <div className="patternshift-evo-chips">
              {evolution.emergingThemes.map((row) => (
                <span key={row.tag} className="patternshift-evo-chip emerging">
                  #{row.tag}
                  <b>
                    {row.earlierCount} → {row.recentCount}
                  </b>
                </span>
              ))}
            </div>
          </div>
        )}

        {evolution.increasingThemes.length > 0 && (
          <div className="patternshift-evo-group">
            <span className="patternshift-evo-group-label growing">Appearing more often</span>
            <div className="patternshift-evo-chips">
              {evolution.increasingThemes.map((row) => (
                <span key={row.tag} className="patternshift-evo-chip growing">
                  #{row.tag}
                  <b>
                    {row.earlierCount} → {row.recentCount}
                  </b>
                </span>
              ))}
            </div>
          </div>
        )}

        {evolution.persistentThemes.length > 0 && (
          <div className="patternshift-evo-group">
            <span className="patternshift-evo-group-label persistent">Staying with you</span>
            <div className="patternshift-evo-chips">
              {evolution.persistentThemes.slice(0, 6).map((row) => (
                <span key={row.tag} className="patternshift-evo-chip persistent">
                  #{row.tag}
                  <b>
                    {row.earlierCount} → {row.recentCount}
                  </b>
                </span>
              ))}
            </div>
          </div>
        )}

        {evolution.fadingThemes.length > 0 && (
          <div className="patternshift-evo-group">
            <span className="patternshift-evo-group-label fading">
              Fading from your recent reflections
            </span>
            <div className="patternshift-evo-chips">
              {evolution.fadingThemes.map((row) => (
                <span key={row.tag} className="patternshift-evo-chip fading">
                  #{row.tag}
                  <b>
                    {row.earlierCount} → {row.recentCount}
                  </b>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <EvidenceDisclosure evidence={evolution.evidence} />
    </div>
  );
};

const UnusualTimingSection: React.FC<{ unusual: UnusualTimingResult }> = ({ unusual }) => {
  if (unusual.status !== 'available') return null;

  return (
    <div className="patternshift-unusual">
      <div className="patternshift-section-header">
        <h3 className="patternshift-section-title">
          <Shuffle className="w-4 h-4 text-amber-500" />
          <span>Unusual Moments</span>
        </h3>
        <span className="patternshift-section-badge">Timing Observation Only</span>
      </div>

      <div className="patternshift-unusual-body">
        <div className="patternshift-unusual-icon">
          <Clock className="w-5 h-5" />
        </div>
        <div className="space-y-2">
          {unusual.observation && (
            <p className="patternshift-unusual-text">{unusual.observation}</p>
          )}
          <p className="patternshift-unusual-meta">
            You usually reflect during the{' '}
            <strong>
              {unusual.typicalBucket ? TIME_BUCKET_DISPLAY[unusual.typicalBucket] : 'same window'}
            </strong>{' '}
            (about {Math.round(unusual.typicalShare * 100)}% of the time). {unusual.flaggedCount}{' '}
            recent {unusual.flaggedCount === 1 ? 'reflection was' : 'reflections were'} outside that
            window
            {unusual.flaggedHours.length > 0
              ? ` — around ${unusual.flaggedHours.map(formatHour).join(', ')}.`
              : '.'}
          </p>
          <p className="patternshift-unusual-note">
            A pattern observation about when reflections happened — not a judgment about how you
            are doing.
          </p>
        </div>
      </div>

      <EvidenceDisclosure evidence={unusual.evidence} />
    </div>
  );
};

const LocationPatternsSection: React.FC<{ locations: LocationPatternsResult }> = ({
  locations,
}) => {
  if (locations.status !== 'available') return null;

  return (
    <div className="patternshift-locations">
      <div className="patternshift-section-header">
        <h3 className="patternshift-section-title">
          <MapPin className="w-4 h-4 text-rose-500" />
          <span>Places Connected to Reflection</span>
        </h3>
        <span className="patternshift-section-badge">Only Places You Added</span>
      </div>

      <div className="patternshift-locations-body">
        <div className="patternshift-locations-icon">
          <MapPin className="w-5 h-5" />
        </div>
        <div className="space-y-3">
          {locations.observation && (
            <p className="patternshift-unusual-text">{locations.observation}</p>
          )}
          {locations.recurringLabels.length > 0 && (
            <div className="patternshift-locations-chips">
              {locations.recurringLabels.map((loc) => (
                <span key={loc.label} className="patternshift-location-chip">
                  <MapPin className="w-3 h-3" />
                  {loc.label}
                  <b>× {loc.count}</b>
                </span>
              ))}
            </div>
          )}
          <p className="patternshift-locations-note">
            Based only on locations you chose to attach to journal entries. Coordinates are never
            shown and are never included in analysis summaries.
          </p>
        </div>
      </div>

      <EvidenceDisclosure evidence={locations.evidence} />
    </div>
  );
};

const PatternIntelligenceSections: React.FC<{
  intelligence?: PatternIntelligence | null;
}> = ({ intelligence }) => {
  if (!intelligence) return null;

  const hasRhythm =
    intelligence.moodTrajectory.status === 'available' ||
    intelligence.reflectionRhythm.status === 'available' ||
    intelligence.reflectionFrequency.status === 'available';

  return (
    <>
      {hasRhythm && (
        <div className="patternshift-rhythm">
          <div className="patternshift-section-header">
            <h3 className="patternshift-section-title">
              <Activity className="w-4 h-4 text-indigo-600" />
              <span>Your Recent Rhythm</span>
            </h3>
            <span className="patternshift-section-badge">
              Deterministic · Grounded in Your Records
            </span>
          </div>
          <p className="patternshift-rhythm-intro">
            Small, measured observations about how your reflections unfold over time — computed
            directly from your records, not generated.
          </p>
          <div className="patternshift-rhythm-grid">
            <MoodTrajectoryCard mood={intelligence.moodTrajectory} />
            <ReflectionRhythmCard rhythm={intelligence.reflectionRhythm} />
            <ReflectionFrequencyCard frequency={intelligence.reflectionFrequency} />
          </div>
        </div>
      )}

      <ThemeEvolutionSection evolution={intelligence.themeEvolution} />
      <UnusualTimingSection unusual={intelligence.unusualTiming} />
      <LocationPatternsSection locations={intelligence.locationPatterns} />
    </>
  );
};

export const PatternShiftDashboard: React.FC = () => {
  const { getIdToken, user } = useAuth();
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
  // Phase 10 remediation: subtle, non-alarming note shown when an insight
  // was generated successfully but could NOT be persisted because the
  // preview runtime lacks backend Firestore IAM.
  const [persistenceNotice, setPersistenceNotice] = useState<string | null>(null);

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
      setPersistenceNotice(null);
      try {
        const latest = await fetchLatestInsight(getIdToken, user?.uid);
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
    setPersistenceNotice(null);
    try {
      const response: PatternShiftResponse = await triggerPatternAnalysis(
        getIdToken,
        user?.uid
      );
      if (response.status === 'success') {
        setInsight(response.insight);
        setInsufficientDataInfo(null);
        if (response.persistence && response.persistence.persisted === false) {
          setPersistenceNotice(
            'This analysis is shown live but may not be saved in the current preview environment.'
          );
        }
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

      {/* Phase 10 Remediation: Subtle Preview Persistence Notice */}
      {/* Shown ONLY when an insight was successfully generated but the
          preview runtime could not persist it. Not an error state. */}
      {persistenceNotice && !errorMessage && (
        <div id="patternshift-persistence-notice" className="patternshift-persistence-notice">
          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <p>{persistenceNotice}</p>
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
              Extracting deterministic mood trajectories, reflection rhythms, theme evolution, and
              non-clinical patterns from your authenticated reflections...
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
            <div className="patternshift-overview-eyebrow">Overview</div>
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

          {/* Phase 10: Evidence-Grounded Intelligence */}
          <PatternIntelligenceSections intelligence={insight.intelligence} />

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