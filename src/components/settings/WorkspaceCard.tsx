import React from 'react';
import { BookOpen, Sparkles, TrendingUp } from 'lucide-react';
import { useDemo, useIsDemoSession } from '../../demo';

/**
 * WorkspaceCard - Informational summary of the user's Reflectra workspace.
 *
 * In demo mode, lightweight counts are derived from data already loaded in
 * DemoContext (no extra subscriptions, no service duplication).
 *
 * In production, no counts are displayed: surfacing real totals would require
 * additional Firestore subscriptions for decorative purposes only. Correctness
 * is preferred over decorative metrics, so the feature indicators are shown
 * without fabricated numbers.
 */

interface WorkspaceFeature {
  icon: React.ReactNode;
  label: string;
  description: string;
}

const FEATURES: WorkspaceFeature[] = [
  {
    icon: <BookOpen className="settings-feature-icon" aria-hidden="true" />,
    label: 'Journal',
    description: 'Long-form entries, saved in your own words.',
  },
  {
    icon: <Sparkles className="settings-feature-icon" aria-hidden="true" />,
    label: 'Guided Reflection',
    description: 'Conversations that ask a little deeper.',
  },
  {
    icon: <TrendingUp className="settings-feature-icon" aria-hidden="true" />,
    label: 'PatternShift',
    description: 'Gentle observations across your reflections.',
  },
];

export const WorkspaceCard: React.FC = () => {
  const { demoJournalEntries, demoConversations } = useDemo();
  const isDemo = useIsDemoSession();

  // Demo-only informational counts, sourced from state already in memory.
  const demoCounts =
    isDemo
      ? [
          {
            label: 'Journal entries',
            value: String(demoJournalEntries.length),
          },
          {
            label: 'Reflections',
            value: String(demoConversations.length),
          },
        ]
      : null;

  return (
    <div className="settings-card settings-workspace-card">
      <p className="settings-section-kicker">YOUR WORKSPACE</p>
      <h2 className="settings-card-title">Everything in one quiet place</h2>
      <p className="settings-card-copy">
        Your journal entries, guided reflections, and personal patterns live
        together as part of your Reflectra space.
      </p>

      {demoCounts && (
        <dl className="settings-workspace-counts">
          {demoCounts.map((count) => (
            <div key={count.label} className="settings-workspace-count">
              <dt className="settings-workspace-count-label">{count.label}</dt>
              <dd className="settings-workspace-count-value">{count.value}</dd>
            </div>
          ))}
        </dl>
      )}

      <ul className="settings-feature-list">
        {FEATURES.map((feature) => (
          <li key={feature.label} className="settings-feature-item">
            <span className="settings-feature-icon-wrap">{feature.icon}</span>
            <span className="settings-feature-text">
              <strong className="settings-feature-label">{feature.label}</strong>
              <small className="settings-feature-desc">{feature.description}</small>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
};
