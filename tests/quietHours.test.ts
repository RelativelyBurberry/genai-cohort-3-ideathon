import { describe, it, expect } from 'vitest';
import {
  isWithinQuietHours,
  isOutsideQuietHours,
  parseTimeToMinutes,
  dateToMinutes,
} from '../src/intelligence/smartNudge/quietHours';

/** Build a local Date at a specific HH:mm. */
function at(hour: number, minute = 0): Date {
  const d = new Date(2026, 0, 15, hour, minute, 0, 0); // Jan 15, 2026
  return d;
}

describe('Quiet Hours — pure deterministic helper', () => {
  describe('parseTimeToMinutes', () => {
    it('parses valid 24-hour strings', () => {
      expect(parseTimeToMinutes('00:00')).toBe(0);
      expect(parseTimeToMinutes('08:00')).toBe(480);
      expect(parseTimeToMinutes('12:00')).toBe(720);
      expect(parseTimeToMinutes('20:00')).toBe(1200);
      expect(parseTimeToMinutes('23:59')).toBe(1439);
    });

    it('returns -1 for malformed input', () => {
      expect(parseTimeToMinutes(null)).toBe(-1);
      expect(parseTimeToMinutes(undefined)).toBe(-1);
      expect(parseTimeToMinutes('')).toBe(-1);
      expect(parseTimeToMinutes('99:99')).toBe(-1);
      expect(parseTimeToMinutes('25:00')).toBe(-1);
      expect(parseTimeToMinutes('8:60')).toBe(-1);
      expect(parseTimeToMinutes('eight')).toBe(-1);
    });
  });

  describe('dateToMinutes', () => {
    it('converts local wall-clock time to minutes', () => {
      expect(dateToMinutes(at(0, 0))).toBe(0);
      expect(dateToMinutes(at(13, 30))).toBe(810);
      expect(dateToMinutes(at(23, 59))).toBe(1439);
    });
  });

  describe('normal ranges (start < end)', () => {
    it('09:00 → 17:00 blocks mid-morning', () => {
      expect(isWithinQuietHours(at(9, 0), '09:00', '17:00')).toBe(true);
      expect(isWithinQuietHours(at(10, 30), '09:00', '17:00')).toBe(true);
      expect(isWithinQuietHours(at(16, 59), '09:00', '17:00')).toBe(true);
    });

    it('09:00 → 17:00 does not block outside the window', () => {
      expect(isWithinQuietHours(at(8, 59), '09:00', '17:00')).toBe(false);
      expect(isWithinQuietHours(at(17, 0), '09:00', '17:00')).toBe(false);
      expect(isWithinQuietHours(at(20, 0), '09:00', '17:00')).toBe(false);
    });
  });

  describe('overnight ranges (start > end)', () => {
    it('22:00 → 08:00 blocks late night and early morning', () => {
      expect(isWithinQuietHours(at(22, 0), '22:00', '08:00')).toBe(true);
      expect(isWithinQuietHours(at(23, 0), '22:00', '08:00')).toBe(true);
      expect(isWithinQuietHours(at(0, 30), '22:00', '08:00')).toBe(true);
      expect(isWithinQuietHours(at(3, 0), '22:00', '08:00')).toBe(true);
      expect(isWithinQuietHours(at(7, 59), '22:00', '08:00')).toBe(true);
    });

    it('22:00 → 08:00 does not block mid-day', () => {
      expect(isWithinQuietHours(at(12, 0), '22:00', '08:00')).toBe(false);
      expect(isWithinQuietHours(at(8, 0), '22:00', '08:00')).toBe(false);
      expect(isWithinQuietHours(at(21, 59), '22:00', '08:00')).toBe(false);
    });
  });

  describe('midnight boundaries', () => {
    it('00:00 → 00:00 blocks the entire day (same start/end)', () => {
      expect(isWithinQuietHours(at(0, 0), '00:00', '00:00')).toBe(true);
      expect(isWithinQuietHours(at(12, 0), '00:00', '00:00')).toBe(true);
      expect(isWithinQuietHours(at(23, 59), '00:00', '00:00')).toBe(true);
    });

    it('00:00 → 06:00 blocks only the early morning', () => {
      expect(isWithinQuietHours(at(0, 30), '00:00', '06:00')).toBe(true);
      expect(isWithinQuietHours(at(5, 59), '00:00', '06:00')).toBe(true);
      expect(isWithinQuietHours(at(6, 0), '00:00', '06:00')).toBe(false);
      expect(isWithinQuietHours(at(23, 0), '00:00', '06:00')).toBe(false);
    });

    it('22:00 → 23:59 boundary (end exclusive)', () => {
      expect(isWithinQuietHours(at(21, 59), '22:00', '23:59')).toBe(false);
      expect(isWithinQuietHours(at(22, 0), '22:00', '23:59')).toBe(true);
      expect(isWithinQuietHours(at(23, 0), '22:00', '23:59')).toBe(true);
      expect(isWithinQuietHours(at(23, 58), '22:00', '23:59')).toBe(true);
      expect(isWithinQuietHours(at(23, 59), '22:00', '23:59')).toBe(false);
    });
  });

  describe('malformed config fails safe', () => {
    it('null/undefined start or end → NOT quiet (never blocks)', () => {
      expect(isWithinQuietHours(at(12, 0), null, '18:00')).toBe(false);
      expect(isWithinQuietHours(at(12, 0), '09:00', null)).toBe(false);
      expect(isWithinQuietHours(at(12, 0), undefined, undefined)).toBe(false);
    });

    it('malformed strings → NOT quiet', () => {
      expect(isWithinQuietHours(at(12, 0), 'nope', '18:00')).toBe(false);
      expect(isWithinQuietHours(at(12, 0), '09:00', '')).toBe(false);
    });
  });

  describe('isOutsideQuietHours (honors enabled flag)', () => {
    it('disabled quiet hours never block', () => {
      expect(isOutsideQuietHours(at(3, 0), false, '22:00', '08:00')).toBe(true);
      expect(isOutsideQuietHours(at(12, 0), false, '22:00', '08:00')).toBe(true);
    });

    it('enabled quiet hours block in-window times', () => {
      expect(isOutsideQuietHours(at(23, 0), true, '22:00', '08:00')).toBe(false);
      expect(isOutsideQuietHours(at(12, 0), true, '22:00', '08:00')).toBe(true);
    });
  });
});