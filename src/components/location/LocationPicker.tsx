/**
 * LocationPicker Component
 * 
 * A privacy-conscious location selector for journal entries.
 * Provides two options:
 * 1. Use current location (via browser Geolocation API)
 * 2. Search for a location manually
 * 
 * PRIVACY DESIGN:
 * - Never requests location automatically
 * - Only activates after explicit user interaction
 * - Clear affordance that location is optional
 * - Easy to remove selected location
 */

import React, { useState, useCallback } from 'react';
import { MapPin, Navigation, X, Search, Loader2 } from 'lucide-react';
import type { EntryLocation, GeolocationError } from '../../types/location';
import { getCurrentPosition, searchLocations, formatLocationLabel } from '../../services/locationService';

interface LocationPickerProps {
  /** Currently selected location (if any) */
  value?: EntryLocation | null;
  /** Callback when location is selected or removed */
  onChange: (location: EntryLocation | null) => void;
  /** Whether the picker is disabled */
  disabled?: boolean;
}

export const LocationPicker: React.FC<LocationPickerProps> = ({
  value,
  onChange,
  disabled = false,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<EntryLocation[]>([]);
  const [error, setError] = useState<string | null>(null);

  const handleUseCurrentLocation = useCallback(async () => {
    if (disabled || isLocating) return;
    
    setIsLocating(true);
    setError(null);
    
    try {
      const location = await getCurrentPosition();
      onChange(location);
      setIsExpanded(false);
    } catch (err) {
      const geoError = err as GeolocationError;
      setError(geoError.message);
    } finally {
      setIsLocating(false);
    }
  }, [disabled, isLocating, onChange]);

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim() || isSearching) return;
    
    setIsSearching(true);
    setError(null);
    
    try {
      const results = await searchLocations(searchQuery.trim());
      if (results.length === 0) {
        setError('No locations found. Try a different search.');
      } else {
        setSearchResults(results);
      }
    } catch (err) {
      setError('Search failed. Please try again.');
    } finally {
      setIsSearching(false);
    }
  }, [searchQuery, isSearching]);

  const handleSelectResult = useCallback((location: EntryLocation) => {
    onChange(location);
    setSearchResults([]);
    setSearchQuery('');
    setIsExpanded(false);
  }, [onChange]);

  const handleRemoveLocation = useCallback(() => {
    onChange(null);
    setError(null);
  }, [onChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSearch();
    }
  }, [handleSearch]);

  // If location is already selected, show preview with remove option
  if (value) {
    return (
      <div className="location-picker-selected">
        <MapPin className="location-picker-icon" aria-hidden="true" />
        <span className="location-picker-label">
          {formatLocationLabel(value)}
        </span>
        <button
          type="button"
          onClick={handleRemoveLocation}
          disabled={disabled}
          className="location-picker-remove"
          aria-label="Remove location"
        >
          <X style={{ width: '0.875rem', height: '0.875rem' }} aria-hidden="true" />
        </button>
      </div>
    );
  }

  // Show collapsed "Add location" affordance
  if (!isExpanded) {
    return (
      <button
        type="button"
        onClick={() => setIsExpanded(true)}
        disabled={disabled}
        className="location-picker-trigger"
        aria-label="Add a location to this entry (optional)"
      >
        <MapPin style={{ width: '1rem', height: '1rem' }} aria-hidden="true" />
        <span>Add a place</span>
        <span className="location-picker-optional">(optional)</span>
      </button>
    );
  }

  // Expanded picker with two options
  return (
    <div className="location-picker-expanded">
      <div className="location-picker-header">
        <span className="location-picker-title">Add a place</span>
        <button
          type="button"
          onClick={() => {
            setIsExpanded(false);
            setError(null);
            setSearchQuery('');
            setSearchResults([]);
          }}
          className="location-picker-close"
          aria-label="Cancel location selection"
        >
          <X style={{ width: '1rem', height: '1rem' }} aria-hidden="true" />
        </button>
      </div>

      {/* Error message */}
      {error && (
        <div className="location-picker-error" role="alert">
          <span>{error}</span>
        </div>
      )}

      {/* Option 1: Use current location */}
      <button
        type="button"
        onClick={handleUseCurrentLocation}
        disabled={disabled || isLocating}
        className="location-picker-option"
      >
        {isLocating ? (
          <Loader2 className="location-picker-spinner" aria-hidden="true" />
        ) : (
          <Navigation style={{ width: '1rem', height: '1rem' }} aria-hidden="true" />
        )}
        <span>{isLocating ? 'Getting your location...' : 'Use my current location'}</span>
      </button>

      {/* Divider */}
      <div className="location-picker-divider">
        <span>or search</span>
      </div>

      {/* Option 2: Search for location */}
      <div className="location-picker-search">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled || isSearching}
          placeholder="Search for a place..."
          className="location-picker-search-input"
          aria-label="Search for a location"
        />
        <button
          type="button"
          onClick={handleSearch}
          disabled={disabled || isSearching || !searchQuery.trim()}
          className="location-picker-search-btn"
          aria-label="Search"
        >
          {isSearching ? (
            <Loader2 className="location-picker-spinner-small" aria-hidden="true" />
          ) : (
            <Search style={{ width: '1rem', height: '1rem' }} aria-hidden="true" />
          )}
        </button>
      </div>

      {/* Search results */}
      {searchResults.length > 0 && (
        <ul className="location-picker-results" role="listbox">
          {searchResults.map((result, index) => (
            <li key={`${result.latitude}-${result.longitude}-${index}`}>
              <button
                type="button"
                onClick={() => handleSelectResult(result)}
                className="location-picker-result"
                role="option"
              >
                <MapPin style={{ width: '0.875rem', height: '0.875rem' }} aria-hidden="true" />
                <span>{formatLocationLabel(result, 60)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
