/**
 * Location types for optional journal entry location support.
 * 
 * PRIVACY DESIGN:
 * - Location is completely optional
 * - Only persists what user explicitly selects
 * - Never automatically captures location
 * - No tracking or history
 */

/**
 * Represents a selected location attached to a journal entry.
 * All fields are optional to support partial data (e.g., coordinates without label).
 */
export interface EntryLocation {
  /** Latitude in decimal degrees */
  latitude: number;
  /** Longitude in decimal degrees */
  longitude: number;
  /** Human-readable place name (e.g., "Brooklyn Bridge, New York") */
  label?: string;
}

/**
 * Result from geocoding search or reverse geocoding.
 */
export interface GeocodingResult {
  latitude: number;
  longitude: number;
  label: string;
}

/**
 * Error states for geolocation operations.
 */
export type GeolocationErrorType = 
  | 'permission_denied'
  | 'position_unavailable'
  | 'timeout'
  | 'unsupported'
  | 'search_failed'
  | 'no_results'
  | 'network_error';

/**
 * Error object for geolocation operations.
 */
export interface GeolocationError {
  type: GeolocationErrorType;
  message: string;
}

/**
 * Props for location selection in the journal editor.
 */
export interface LocationSelectionProps {
  /** Currently selected location (if any) */
  value?: EntryLocation | null;
  /** Callback when location is selected */
  onChange: (location: EntryLocation | null) => void;
  /** Whether the picker is disabled */
  disabled?: boolean;
}
