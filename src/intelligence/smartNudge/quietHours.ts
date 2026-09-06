/**
 * Quiet Hours — pure deterministic helpers.
 *
 * Quiet hours suppress real notifications during a configured window.
 * The window may cross midnight (e.g. 22:00 → 08:00) and may be
 * disabled entirely.
 *
 * All times are represented as "HH:mm" (24-hour) strings and compared
 * using integer minute-of-day. No timezone tricks are used — the caller
 * passes a JavaScript Date reflecting the user's local browser time.
 */

/** Parse a "HH:mm" string into minutes-of-day. Returns -1 for malformed input. */
export function parseTimeToMinutes(time: string | null | undefined): number {
  if (!time || typeof time !== 'string') return -1;
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(time.trim());
  if (!match) return -1;
  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  return hours * 60 + minutes;
}

/** Extract minutes-of-day (0..1439) from a Date using local time. */
export function dateToMinutes(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

/**
 * Determine whether `current` falls inside the quiet-hours window
 * defined by `start` and `end` (both "HH:mm" 24-hour).
 *
 * Behavior:
 *   - Malformed (unparseable) start/end → NOT quiet (fail safe).
 *   - start === end → treat as a full 24-hour window (always quiet).
 *   - start < end  → normal range (e.g. 09:00 → 17:00).
 *   - start > end  → overnight range (e.g. 22:00 → 08:00).
 */
export function isWithinQuietHours(
  current: Date | number,
  start: string | null | undefined,
  end: string | null | undefined
): boolean {
  const currentMinutes =
    typeof current === 'number' ? current : dateToMinutes(current);

  const startMinutes = parseTimeToMinutes(start);
  const endMinutes = parseTimeToMinutes(end);

  // Fail safe: malformed configuration never blocks a nudge.
  if (startMinutes === -1 || endMinutes === -1) return false;

  // Explicit full-day quiet (same start/end) → always quiet.
  if (startMinutes === endMinutes) return true;

  if (startMinutes < endMinutes) {
    // Normal range: within [start, end) — end is exclusive.
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  }

  // Overnight range: current >= start (late) OR current < end (early).
  return currentMinutes >= startMinutes || currentMinutes < endMinutes;
}

/**
 * Convenience wrapper honoring the quietHoursEnabled flag.
 * When disabled, quiet hours never block a nudge.
 */
export function isOutsideQuietHours(
  current: Date | number,
  enabled: boolean,
  start: string | null | undefined,
  end: string | null | undefined
): boolean {
  if (!enabled) return true;
  return !isWithinQuietHours(current, start, end);
}
