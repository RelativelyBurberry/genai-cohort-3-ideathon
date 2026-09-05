/**
 * EntryLocationDisplay Component
 * 
 * Displays a location indicator for a saved journal entry.
 * Shows the place name with an optional expandable mini-map.
 * 
 * DESIGN PHILOSOPHY:
 * - Location should feel secondary to the journal content
 * - Never visually overpower the reflection
 * - Subtle, editorial presentation
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { MapPin, X, ExternalLink } from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import type { LatLngExpression } from 'leaflet';
import type { EntryLocation } from '../../types/location';
import { formatLocationLabel } from '../../services/locationService';

/**
 * Component that re-centers the map when coordinates change.
 * Leaflet maps do not auto-update their center via props.
 */
const MapRecenter: React.FC<{ center: LatLngExpression }> = ({ center }) => {
  const map = useMap();
  useEffect(() => {
    map.setView(center, 14);
  }, [map, center]);
  return null;
};

/**
 * Mini-map for displaying a journal entry's location.
 * Uses Leaflet + OpenStreetMap tiles (free, no API keys).
 * Small and calm - the map is a secondary detail, not the focus.
 */
const MiniMap: React.FC<{
  latitude: number;
  longitude: number;
  label?: string;
}> = ({ latitude, longitude, label }) => {
  const center: LatLngExpression = [latitude, longitude];

  return (
    <MapContainer
      key={`${latitude}-${longitude}`}
      center={center}
      zoom={14}
      scrollWheelZoom={false}
      className="location-minimap"
      style={{ height: '200px', width: '100%' }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Marker position={center}>
        {label && <Popup>{label}</Popup>}
      </Marker>
      <MapRecenter center={center} />
    </MapContainer>
  );
};

export const EntryLocationDisplay: React.FC<{
  location: EntryLocation;
  showMap?: boolean;
  compact?: boolean;
}> = ({ location, showMap = false, compact = false }) => {
  const [showMiniMap, setShowMiniMap] = useState(false);

  const handleOpenMap = useCallback(() => {
    setShowMiniMap((prev) => !prev);
  }, []);

  const handleOpenExternal = useCallback(() => {
    // Open in OpenStreetMap (no proprietary map service)
    const url = `https://www.openstreetmap.org/?mlat=${location.latitude}&mlon=${location.longitude}#map=15/${location.latitude}/${location.longitude}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  }, [location]);

  if (compact) {
    // Compact display for list rows
    return (
      <span className="location-indicator-compact">
        <MapPin style={{ width: '0.75rem', height: '0.75rem' }} aria-hidden="true" />
        <span>{formatLocationLabel(location, 30)}</span>
      </span>
    );
  }

  return (
    <div className="location-indicator">
      <MapPin className="location-indicator-icon" aria-hidden="true" />

      <div className="location-indicator-body">
        <span className="location-indicator-label">
          {formatLocationLabel(location)}
        </span>
        {location.label && (
          <span className="location-indicator-context">
            Where this moment happened
          </span>
        )}
      </div>

      <div className="location-indicator-actions">
        {showMap && (
          <button
            type="button"
            onClick={handleOpenMap}
            className="location-indicator-action"
            aria-label={showMiniMap ? 'Close map' : 'View on map'}
            aria-expanded={showMiniMap}
          >
            {showMiniMap ? 'Close map' : 'View on map'}
          </button>
        )}
        <button
          type="button"
          onClick={handleOpenExternal}
          className="location-indicator-action-external"
          aria-label="Open in OpenStreetMap"
          title="Open in OpenStreetMap"
        >
          <ExternalLink style={{ width: '0.75rem', height: '0.75rem' }} aria-hidden="true" />
        </button>
      </div>

      {/* Mini-map (collapsible) */}
      {showMiniMap && showMap && (
        <div className="location-minimap-wrapper">
          <MiniMap
            latitude={location.latitude}
            longitude={location.longitude}
            label={location.label}
          />
        </div>
      )}
    </div>
  );
};