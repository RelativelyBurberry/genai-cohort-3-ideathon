import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { Timestamp } from 'firebase/firestore';
import {
  isValidLocation,
  formatCoordinates,
  validateJournalEntryInput,
} from '../src/utils/journal';
import type { EntryLocation } from '../src/types/location';

describe('Phase 9 Location Utilities', () => {
  describe('isValidLocation', () => {
    it('accepts undefined or null (location is always optional)', () => {
      expect(isValidLocation(undefined)).toBe(true);
      expect(isValidLocation(null)).toBe(true);
    });

    it('accepts a valid location object with just coordinates', () => {
      expect(isValidLocation({ latitude: 40.7128, longitude: -74.006 })).toBe(true);
    });

    it('accepts a valid location with an optional label', () => {
      expect(isValidLocation({
        latitude: 40.7128,
        longitude: -74.006,
        label: 'Brooklyn, New York',
      })).toBe(true);
    });

    it('rejects locations with out-of-range latitude', () => {
      expect(isValidLocation({ latitude: 91, longitude: 0 })).toBe(false);
      expect(isValidLocation({ latitude: -91, longitude: 0 })).toBe(false);
    });

    it('rejects locations with out-of-range longitude', () => {
      expect(isValidLocation({ latitude: 0, longitude: 181 })).toBe(false);
      expect(isValidLocation({ latitude: 0, longitude: -181 })).toBe(false);
    });

    it('rejects locations with non-number coordinates', () => {
      expect(isValidLocation({ latitude: '40.71', longitude: -74 })).toBe(false);
      expect(isValidLocation({ latitude: 40.71, longitude: null })).toBe(false);
      expect(isValidLocation({ latitude: NaN, longitude: -74 })).toBe(false);
    });

    it('rejects non-object location values', () => {
      expect(isValidLocation('paris')).toBe(false);
      expect(isValidLocation(42)).toBe(false);
      expect(isValidLocation([])).toBe(false);
    });

    it('rejects locations with non-string labels', () => {
      expect(isValidLocation({ latitude: 0, longitude: 0, label: 42 })).toBe(false);
    });

    it('accepts locations with null labels', () => {
      expect(isValidLocation({ latitude: 0, longitude: 0, label: null })).toBe(true);
    });
  });

  describe('formatCoordinates', () => {
    it('formats coordinates to 4 decimal places', () => {
      expect(formatCoordinates(40.71281, -74.00604)).toBe('40.7128, -74.0060');
    });

    it('handles negative coordinates with the minus sign', () => {
      expect(formatCoordinates(-33.8688, 151.2093)).toBe('-33.8688, 151.2093');
    });
  });

  describe('validateJournalEntryInput with location', () => {
    it('accepts entries without a location (backward compatible)', () => {
      const res = validateJournalEntryInput({
        content: 'A reflection without a place.',
        moodRating: 3,
      });
      expect(res.valid).toBe(true);
    });

     it('accepts entries with null location', () => {
       const res = validateJournalEntryInput({
         content: 'A reflection.',
         moodRating: 4,
         location: null,
       });
       expect(res.valid).toBe(true);
     });

     it('accepts entries with undefined location (backward compatible)', () => {
       const res = validateJournalEntryInput({
         content: 'A reflection.',
         moodRating: 3,
         location: undefined,
       });
       expect(res.valid).toBe(true);
     });

    it('accepts entries with valid location', () => {
      const location: EntryLocation = {
        latitude: 48.8566,
        longitude: 2.3522,
        label: 'Paris, France',
      };
      const res = validateJournalEntryInput({
        content: 'A reflection in Paris.',
        moodRating: 5,
        location,
      });
      expect(res.valid).toBe(true);
    });

    it('rejects entries with an invalid location object', () => {
      const res = validateJournalEntryInput({
        content: 'A reflection.',
        moodRating: 3,
        location: { latitude: 999, longitude: 0, label: 'Nowhere' } as EntryLocation,
      });
      expect(res.valid).toBe(false);
      expect(res.error).toContain('location');
    });
  });
});

describe('Phase 9 Firestore Rules Static Checks', () => {
  it('firestore.rules contains the optional location schema validator', () => {
    const rulesContent = fs.readFileSync(path.join(process.cwd(), 'firestore.rules'), 'utf8');

    expect(rulesContent).toContain('function isValidLocation');
    expect(rulesContent).toContain('location.latitude is number');
    expect(rulesContent).toContain('location.longitude is number');
    expect(rulesContent).toMatch(/location\.latitude >= -90/);
  });

  it('firestore.rules keeps location optional in isValidEntry', () => {
    const rulesContent = fs.readFileSync(path.join(process.cwd(), 'firestore.rules'), 'utf8');

    // The validator must permit entries WITHOUT a location field
    expect(rulesContent).toMatch(/!\('location' in data\) \|\| isValidLocation/);
  });
});