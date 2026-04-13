// ─── Route Service ──────────────────────────────────────────────────────────
// Fetches driving routes from OpenRouteService with road-snapping.
// All API key handling stays server-side — never exposed to the frontend.

const ORS_API_KEY = process.env.ORS_API_KEY || '';

// Cache snapped coordinates to avoid redundant API calls
const snapCache = new Map();

/**
 * Snap a coordinate to the nearest road using ORS.
 * Returns the snapped [lng, lat] or falls back to original.
 */
async function snapToRoad(lat, lng) {
  const cacheKey = `${lat.toFixed(6)},${lng.toFixed(6)}`;
  if (snapCache.has(cacheKey)) return snapCache.get(cacheKey);

  try {
    const response = await fetch('https://api.openrouteservice.org/v2/snap/driving-car', {
      method: 'POST',
      headers: {
        'Authorization': ORS_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        locations: [[lng, lat]],
        radius: 350
      })
    });

    if (response.ok) {
      const data = await response.json();
      if (data.locations && data.locations[0] && data.locations[0].location) {
        const snapped = data.locations[0].location; // [lng, lat]
        const result = { lat: snapped[1], lng: snapped[0] };
        snapCache.set(cacheKey, result);
        return result;
      }
    }
  } catch (err) {
    console.warn('Snap API failed, using raw coordinates:', err.message);
  }

  // Fallback: return original coordinates
  const fallback = { lat, lng };
  snapCache.set(cacheKey, fallback);
  return fallback;
}

/**
 * Calculate a driving route between two points using OpenRouteService.
 * Both start and end are snapped to the nearest road before routing.
 */
async function calculateRoute(start, end) {
  if (!ORS_API_KEY) {
    throw new Error('ORS_API_KEY is not configured in .env');
  }

  // Snap both points to nearest road
  const [snappedStart, snappedEnd] = await Promise.all([
    snapToRoad(start.lat, start.lng),
    snapToRoad(end.lat, end.lng)
  ]);

  // ORS requires [lng, lat] ordering
  const coordinates = [
    [snappedStart.lng, snappedStart.lat],
    [snappedEnd.lng, snappedEnd.lat]
  ];

  const response = await fetch('https://api.openrouteservice.org/v2/directions/driving-car/geojson', {
    method: 'POST',
    headers: {
      'Authorization': ORS_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      coordinates,
      preference: 'fastest',
      units: 'km',
      geometry: true,
      instructions: false,
      options: {
        avoid_features: ['ferries', 'tollways']
      }
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error('ORS Route API Error:', response.status, errText);
    throw new Error(`ORS returned ${response.status}: ${errText}`);
  }

  const data = await response.json();

  if (!data.features || data.features.length === 0) {
    throw new Error('No route found between the given coordinates');
  }

  const feature = data.features[0];
  const summary = feature.properties.summary;

  return {
    distance: parseFloat((summary.distance).toFixed(2)),     // km
    duration: Math.max(1, Math.round(summary.duration / 60)), // minutes
    geometry: feature.geometry,                                // GeoJSON LineString
    bbox: data.bbox || null,
    snappedStart,
    snappedEnd
  };
}

/**
 * Snap an array of parking locations to the nearest road.
 * Processes in batches to respect API rate limits.
 */
async function snapParkingLocations(locations) {
  if (!ORS_API_KEY || locations.length === 0) return locations;

  // ORS snap supports up to 5000 locations, but batch in groups of 50
  const batchSize = 50;
  const results = [...locations];

  for (let i = 0; i < locations.length; i += batchSize) {
    const batch = locations.slice(i, i + batchSize);
    const orsLocations = batch.map(loc => [loc.lng, loc.lat]);

    try {
      const response = await fetch('https://api.openrouteservice.org/v2/snap/driving-car', {
        method: 'POST',
        headers: {
          'Authorization': ORS_API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          locations: orsLocations,
          radius: 350
        })
      });

      if (response.ok) {
        const data = await response.json();
        if (data.locations) {
          data.locations.forEach((snapped, idx) => {
            const globalIdx = i + idx;
            if (snapped && snapped.location) {
              results[globalIdx] = {
                ...results[globalIdx],
                lat: snapped.location[1],
                lng: snapped.location[0]
              };
            }
          });
        }
      }
    } catch (err) {
      console.warn(`Snap batch ${i}-${i + batchSize} failed:`, err.message);
    }
  }

  return results;
}

module.exports = { calculateRoute, snapToRoad, snapParkingLocations };
