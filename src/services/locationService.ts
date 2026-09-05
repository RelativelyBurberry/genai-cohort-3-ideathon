/**
 * Location Service
 * 
 * Provides free, open-source geocoding using Nominatim (OpenStreetMap).
 * 
 * IMPORTANT USAGE NOTES:
 * - Nominatim is free but rate-limited (1 request/second)
 * - No API key required
 * - For prototype use only - production would need a dedicated provider
 * - All requests include proper attribution and rate limiting
 * 
 * PRIVACY:
 * - Never automatically captures location
 * - Only processes explicitly user-requested searches
 * - No location history stored
 */

import type { GeocodingResult, GeolocationError, EntryLocation } from '../types/location';

// Rate limiting: Nominatim requires max 1 request per second
const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 1100; // 1.1 seconds to be safe

/**
 * Rate-limited fetch wrapper for Nominatim
 */
async function nominatimFetch(endpoint: string, params: Record<string, string>): Promise<Response> {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  
  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
    await new Promise(resolve => setTimeout(resolve, MIN_REQUEST_INTERVAL - timeSinceLastRequest));
  }
  
  lastRequestTime = Date.now();
  
  const url = new URL(`${NOMINATIM_BASE}${endpoint}`);
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.append(key, value);
  });
  
  // Required by Nominatim usage policy
  url.searchParams.append('format', 'json');
  
  const response = await fetch(url.toString(), {
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'Reflectra-Journal-App/1.0 (reflectra.local)',
    },
  });
  
  return response;
}

/**
 * Search for locations by query string.
 * Uses Nominatim geocoding (free, no API key required).
 */
export async function searchLocations(query: string): Promise<GeocodingResult[]> {
  if (!query || query.trim().length < 2) {
    return [];
  }
  
  try {
    const response = await nominatimFetch('/search', {
      q: query.trim(),
      limit: '5',
      addressdetails: '1',
    });
    
    if (!response.ok) {
      throw new Error(`Geocoding request failed: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (!Array.isArray(data)) {
      return [];
    }
    
    return data.map((item: any): GeocodingResult => ({
      latitude: parseFloat(item.lat),
      longitude: parseFloat(item.lon),
      label: item.display_name || item.name || 'Unknown location',
    }));
  } catch (error) {
    console.error('[LocationService] Search failed:', error);
    return [];
  }
}

/**
 * Reverse geocode coordinates to get a human-readable label.
 */
export async function reverseGeocode(latitude: number, longitude: number): Promise<string | null> {
  try {
    const response = await nominatimFetch('/reverse', {
      lat: latitude.toString(),
      lon: longitude.toString(),
      zoom: '14',
      addressdetails: '1',
    });
    
    if (!response.ok) {
      throw new Error(`Reverse geocoding failed: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data && data.display_name) {
      // Shorten to just the relevant parts (city, region, country)
      const parts = data.display_name.split(',').slice(0, 3).map((s: string) => s.trim());
      return parts.join(', ') || data.display_name;
    }
    
    return null;
  } catch (error) {
    console.error('[LocationService] Reverse geocoding failed:', error);
    return null;
  }
}

/**
 * Get the user's current position using the browser Geolocation API.
 * ONLY called after explicit user interaction (button click).
 */
export function getCurrentPosition(): Promise<EntryLocation> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      const error: GeolocationError = {
        type: 'unsupported',
        message: 'Geolocation is not supported by your browser.',
      };
      reject(error);
      return;
    }
    
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        
        // Try to get a human-readable label via reverse geocoding
        let label: string | undefined;
        try {
          label = await reverseGeocode(latitude, longitude);
        } catch {
          // Label is optional - continue without it
        }
        
        resolve({
          latitude,
          longitude,
          label: label || undefined,
        });
      },
      (err) => {
        let type: GeolocationError['type'] = 'position_unavailable';
        let message = 'Unable to retrieve your location.';
        
        switch (err.code) {
          case err.PERMISSION_DENIED:
            type = 'permission_denied';
            message = 'Location permission was denied. You can still search for a location manually.';
            break;
          case err.POSITION_UNAVAILABLE:
            type = 'position_unavailable';
            message = 'Location information is unavailable at this time.';
            break;
          case err.TIMEOUT:
            type = 'timeout';
            message = 'Location request timed out. Please try again.';
            break;
        }
        
        const error: GeolocationError = { type, message };
        reject(error);
      },
      {
        enableHighAccuracy: false, // Privacy: don't need precise location
        timeout: 15000, // 15 seconds
        maximumAge: 60000, // Cache for 1 minute
      }
    );
  });
}

/**
 * Format a location label for display.
 * Truncates if too long and falls back to coordinates.
 */
export function formatLocationLabel(location: EntryLocation, maxLength = 50): string {
  if (location.label && location.label.length <= maxLength) {
    return location.label;
  }
  
  if (location.label && location.label.length > maxLength) {
    // Try to shorten by taking first parts
    const parts = location.label.split(',').slice(0, 2);
    const shortened = parts.join(',').trim();
    if (shortened.length <= maxLength) {
      return shortened;
    }
  }
  
  // Fall back to coordinates
  const lat = location.latitude.toFixed(4);
  const lon = location.longitude.toFixed(4);
  return `${lat}, ${lon}`;
}
