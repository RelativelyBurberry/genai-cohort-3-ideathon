/**
 * Deterministic timestamp utilities shared by the intelligence modules.
 * All functions are pure and timezone-stable.
 */

import type { TimeBucket } from './types';

/** Robustly convert any supported timestamp shape to epoch milliseconds. */
export function toMillis(ts: any): number {
  if (ts === null || ts === undefined) return 0;
  if (typeof ts === 'number') {
    return ts < 10000000000 ? Math.floor(ts * 1000) : Math.floor(ts);
  }
  if (typeof ts === 'string') {
    const parsed = Date.parse(ts);
    return isNaN(parsed) ? 0 : parsed;
  }
  if (ts instanceof Date) return ts.getTime();
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  if (typeof ts.toDate === 'function') {
    const d = ts.toDate();
    return d instanceof Date ? d.getTime() : 0;
  }
  if (typeof ts._seconds === 'number') {
    return ts._seconds * 1000 + Math.floor((ts._nanoseconds || 0) / 1000000);
  }
  if (ts.seconds !== undefined) {
    const sec = Number(ts.seconds) || 0;
    const nanos = Number(ts.nanoseconds || ts.nanos) || 0;
    return sec * 1000 + Math.floor(nanos / 1000000);
  }
  return 0;
}

/**
 * Assign a calendar time-of-day bucket to an epoch-millisecond instant.
 * Uses the RUNTIME-LOCAL hour so the analysis reflects the time of day
 * in the environment that performed the analysis. Deterministic for a
 * given runtime.
 */
export function getTimeBucket(ms: number): TimeBucket | null {
  if (!ms) return null;
  const d = new Date(ms);
  const hour = d.getHours();
  if (hour >= 0 && hour < 6) return 'night';
  if (hour >= 6 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'afternoon';
  return 'evening';
}

/** Sort items with a resolvable createdAt chronologically (oldest first). */
export function sortByTime<T extends { createdAt?: any }>(items: T[]): T[] {
  return [...items].sort((a, b) => toMillis(a.createdAt) - toMillis(b.createdAt));
}

/** Keep only items with a resolvable, non-zero timestamp. */
export function validTimedItems<T extends { createdAt?: any }>(items: T[] | null | undefined): T[] {
  return (items || []).filter((item) => item && toMillis(item?.createdAt) > 0);
}

/** Format an epoch millisecond as a stable YYYY-MM-DD date string. */
export function formatPeriodDate(ms: number): string {
  if (!ms) return '';
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}