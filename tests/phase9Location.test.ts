import { describe, it, expect } from 'vitest';
import { formatLocationLabel } from '../src/services/locationService';
import type { EntryLocation } from '../src/types/location';

describe('Phase 9 Location Service Pure Logic Tests', () => {
  describe('formatLocationLabel', () => {
    it('returns label when within maxLength', () => {
      const location: EntryLocation = { latitude: 40.7128, longitude: -74.006, label: 'New York' };
      expect(formatLocationLabel(location, 50)).toBe('New York');
    });

    it('returns shortened label when original too long but shortened fits', () => {
      const location: EntryLocation = { 
        latitude: 40.7128, 
        longitude: -74.006, 
        label: 'New York, New York, USA' 
      };
      expect(formatLocationLabel(location, 20)).toBe('New York, New York');
    });

    it('returns coordinates when label too long and shortening doesnt fit', () => {
      const location: EntryLocation = { 
        latitude: 40.7128, 
        longitude: -74.006, 
        label: 'A very long location name that exceeds the maximum length allowed for display in the UI' 
      };
      expect(formatLocationLabel(location, 20)).toBe('40.7128, -74.0060');
    });

    it('returns coordinates when label is null', () => {
      const location: EntryLocation = { latitude: 40.7128, longitude: -74.006, label: null };
      expect(formatLocationLabel(location, 50)).toBe('40.7128, -74.0060');
    });

    it('returns coordinates when label is undefined', () => {
      const location: EntryLocation = { latitude: 40.7128, longitude: -74.006 };
      expect(formatLocationLabel(location, 50)).toBe('40.7128, -74.0060');
    });
  });
});