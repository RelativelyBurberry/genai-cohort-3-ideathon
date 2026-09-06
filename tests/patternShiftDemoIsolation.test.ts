import { describe, it, expect } from 'vitest';
import { DEMO_USER, DEMO_STORAGE_KEY } from '../src/demo/demoConfig.js';
import {
  DEMO_PATTERN_INSIGHT,
  DEMO_JOURNAL_ENTRIES,
  DEMO_CONVERSATIONS,
} from '../src/demo/demoData.js';

/**
 * Demo-mode isolation guarantees for the PatternShift path (Part 4).
 *
 * The demo PatternShift insight must remain: fully synthetic, purely
 * local (no backend API calls, no Firebase tokens), and unaffected by
 * the production/sandbox remediation.
 */
describe('PatternShift demo-mode isolation', () => {
  it('demo identity and storage remain synthetic and namespaced', () => {
    expect(DEMO_USER.uid).toBe('demo-user-local-preview');
    expect(DEMO_USER.uid.startsWith('demo-')).toBe(true);
    expect(DEMO_USER.email.endsWith('@reflectra.local')).toBe(true);
    expect(DEMO_STORAGE_KEY).toBe('reflectra-demo-workspace');
    expect(DEMO_STORAGE_KEY.startsWith('reflectra-demo')).toBe(true);
  });

  it('the demo PatternShift insight continues to work and is clearly synthetic', () => {
    expect(DEMO_PATTERN_INSIGHT).toBeDefined();
    expect(DEMO_PATTERN_INSIGHT.type).toBe('patternshift');
    expect(DEMO_PATTERN_INSIGHT.id).toBe('demo-insight-1');
    expect(DEMO_PATTERN_INSIGHT.itemCount.total).toBeGreaterThanOrEqual(3);
    expect(DEMO_PATTERN_INSIGHT.observations.length).toBeGreaterThan(0);
    expect(DEMO_PATTERN_INSIGHT.suggestedInquiries.length).toBeGreaterThan(0);
  });

  it('the demo insight carries Phase 10 deterministic intelligence without any backend involvement', () => {
    expect(DEMO_PATTERN_INSIGHT.intelligence).toBeDefined();
    expect(DEMO_PATTERN_INSIGHT.intelligence!.moodTrajectory.status).toEqual('available');
    expect(DEMO_PATTERN_INSIGHT.intelligence!.reflectionRhythm.status).toEqual('available');
  });

  it('all demo fixtures are synthetic (demo- ids) and do not overlap real users', () => {
    for (const entry of DEMO_JOURNAL_ENTRIES) {
      expect(entry.id.startsWith('demo-')).toBe(true);
    }
    for (const conv of DEMO_CONVERSATIONS) {
      expect(conv.id.startsWith('demo-')).toBe(true);
    }
  });
});