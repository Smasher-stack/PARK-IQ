// ─── Intelligence Service ──────────────────────────────────────────────────────
// Core scoring and ranking engine for ParkIQ.
// Replaces simple distance sorting with intelligent weighting algorithms.

const ORS_API_KEY = process.env.ORS_API_KEY || 'eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6ImVkMmY4ODI2MGJhOTRjOWZiNWNlMmFmMjA0NTg3MDkwIiwiaCI6Im11cm11cjY0In0=';

// Scoring Weights
const WEIGHTS = {
  TRAVEL_TIME: 2.0,      // Priority on getting there fast
  WALKING_DISTANCE: 1.5, // Priority on closeness to final destination
  PRICE: 1.0,            // Cost sensitivity
  AVAILABILITY: 3.0      // High penalty if it's likely full
};

/**
 * Normalizes a value between 0 and 1
 */
function normalize(val, min, max) {
  if (max === min) return 0;
  return (val - min) / (max - min);
}

/**
 * Calculates straight line distance (Haversine) in KM
 */
function getHaversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Radius of the earth in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; 
}

/**
 * Calculate the best parking matches for a user
 * @param {Array} slots - Array of parking slot objects
 * @param {Number} userLat - Latitude of the user query
 * @param {Number} userLng - Longitude of the user query
 * @param {Object} options - { isDestination: boolean }
 */
async function rankParkingSlots(slots, userLat, userLng, options = {}) {
  if (!slots || slots.length === 0) return [];

  // 1. Initial Filtering & Haversine fallback assignment
  let candidates = slots.map(slot => {
    const distKm = getHaversineDistance(userLat, userLng, slot.lat, slot.lng);
    return {
      ...slot,
      _haversineDist: distKm,
      _simulatedDriveTimeMin: (distKm / 20) * 60, // Assumes 20km/h traffic speed
    };
  });

  // Fetch true driving durations via OpenRouteService Matrix API (up to 50 locations)
  try {
    if (candidates.length > 0 && candidates.length <= 50) {
      // Index 0: User, Index 1+: Parking locations (ORS format: [lng, lat])
      const locations = [[userLng, userLat]];
      candidates.forEach(c => locations.push([c.lng, c.lat]));

      const response = await fetch('https://api.openrouteservice.org/v2/matrix/driving-car', {
        method: 'POST',
        headers: {
          'Authorization': ORS_API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          locations,
          sources: [0], // Only calculate from user to destinations
          metrics: ['duration', 'distance']
        })
      });

      if (response.ok) {
        const matrixData = await response.json();
        // duration matrix: sources x destinations (1 x N+1)
        const durations = matrixData.durations[0];
        
        candidates.forEach((c, i) => {
          // i + 1 because index 0 is user-to-user
          const seconds = durations[i + 1];
          if (seconds !== null) {
             c._simulatedDriveTimeMin = seconds / 60;
          }
        });
      }
    }
  } catch (err) {
    console.warn("Intelligence Layer ORS Routing Failed. Falling back to Haversine.", err.message);
  }

  // 2. Extrema calculation for Normalization
  const maxDriveTime = Math.max(...candidates.map(c => c._simulatedDriveTimeMin));
  const minDriveTime = Math.min(...candidates.map(c => c._simulatedDriveTimeMin));
  const maxDist = Math.max(...candidates.map(c => c._haversineDist));
  const minDist = Math.min(...candidates.map(c => c._haversineDist));
  const maxPrice = Math.max(...candidates.map(c => Number(c.price)));
  const minPrice = Math.min(...candidates.map(c => Number(c.price)));

  // 3. Scoring Engine
  candidates = candidates.map(slot => {
    // A. Travel Time Penalty (Lower drives are better)
    const timeScore = normalize(slot._simulatedDriveTimeMin, minDriveTime, maxDriveTime) * WEIGHTS.TRAVEL_TIME;
    
    // B. Distance Penalty (Closer is better)
    const distScore = normalize(slot._haversineDist, minDist, maxDist) * WEIGHTS.WALKING_DISTANCE;
    
    // C. Price Penalty (Cheaper is better)
    const priceScore = normalize(Number(slot.price), minPrice, maxPrice) * WEIGHTS.PRICE;

    // D. Availability Penalty (Exponential penalty for nearly full)
    const availableSlots = Number(slot.availableSlots || slot.available_slots);
    const totalSlots = Number(slot.totalSlots || slot.total_slots);
    let availabilityPenalty = 0;
    
    if (totalSlots > 0) {
      const occupancy = (totalSlots - availableSlots) / totalSlots;
      if (occupancy >= 1) availabilityPenalty = 100; // Hard penalty if full
      else if (occupancy > 0.8) availabilityPenalty = occupancy * 2; // Sharp scaling
      else availabilityPenalty = occupancy;
    }

    const availableScore = availabilityPenalty * WEIGHTS.AVAILABILITY;

    // We want the LOWEST score possible
    const totalScore = timeScore + distScore + priceScore + availableScore;

    return {
      ...slot,
      distance: slot._haversineDist,             // Keep for backwards compatibility
      etaText: Math.round(slot._simulatedDriveTimeMin) + " min",
      score: totalScore
    };
  });

  // 4. Sort by score ascending (lowest score = best parking)
  candidates.sort((a, b) => a.score - b.score);

  // Eliminate absolutely full slots if there are valid alternatives
  const hasAvailableAlternatives = candidates.some(c => Number(c.availableSlots || c.available_slots) > 0);
  
  if (candidates.length > 0) {
    if (hasAvailableAlternatives) {
      const best = candidates.find(c => Number(c.availableSlots || c.available_slots) > 0) || candidates[0];
      // Mark it as best
      best.isBestMatch = true;
    } else {
      candidates[0].isBestMatch = true;
    }
  }

  // Cleanup internal properties before returning to frontend
  return candidates.map(c => {
    delete c._haversineDist;
    delete c._simulatedDriveTimeMin;
    return c;
  });
}

module.exports = { rankParkingSlots };
