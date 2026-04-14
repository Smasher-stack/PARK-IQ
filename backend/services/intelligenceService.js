// ─── Intelligence Service ──────────────────────────────────────────────────────
// Advanced SIH-Level Intelligence Layer for ParkIQ.
// Context-aware, traffic-responsive scoring engine.

const ORS_API_KEY = process.env.ORS_API_KEY || 'eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6ImVkMmY4ODI2MGJhOTRjOWZiNWNlMmFmMjA0NTg3MDkwIiwiaCI6Im11cm11cjY0In0=';

// BASE SCORING WEIGHTS
const DEFAULT_WEIGHTS = {
  travelTime: 0.4,
  distance: 0.2,
  price: 0.15,
  availability: 0.15,
  demand: 0.1
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
 * Dynamically adjust weights based on exact user preference
 */
function getDynamicWeights(preference) {
  let weights = { ...DEFAULT_WEIGHTS };
  if (preference === 'fastest') {
    weights.travelTime = 0.6;
    weights.price = 0.1;
    weights.distance = 0.1;
  } else if (preference === 'cheapest') {
    weights.price = 0.5;
    weights.travelTime = 0.2;
    weights.distance = 0.1;
  } else if (preference === 'closest') {
    weights.distance = 0.6;
    weights.travelTime = 0.2;
    weights.price = 0.05;
  }
  return weights;
}

/**
 * Calculate the best parking matches intelligently
 * @param {Array} slots - Array of parking slot objects
 * @param {Number} userLat - Latitude of the user query
 * @param {Number} userLng - Longitude of the user query
 * @param {Object} options - { preference: 'fastest' | 'cheapest' | 'closest' | 'smart' }
 */
async function rankParkingSlots(slots, userLat, userLng, options = {}) {
  if (!slots || slots.length === 0) return [];
  const preference = options.preference || 'smart';
  const weights = getDynamicWeights(preference);
  
  const currentHour = new Date().getHours();
  // Peak hours: 8am-10am and 5pm-8pm
  const isPeakHour = (currentHour >= 8 && currentHour <= 10) || (currentHour >= 17 && currentHour <= 20);
  
  // 1. Initial Filtering & Haversine fallback assignment
  let candidates = slots.map(slot => {
    const distKm = getHaversineDistance(userLat, userLng, slot.lat, slot.lng);
    const avgSpeedKmH = isPeakHour ? 15 : 25; // km/h
    
    return {
      ...slot,
      _haversineDist: distKm,
      _simulatedDriveTimeMin: (distKm / avgSpeedKmH) * 60,
    };
  });

  // Calculate true driving durations via OpenRouteService Matrix API (up to 50 items matrix)
  try {
    if (candidates.length > 0 && candidates.length <= 50) {
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
          sources: [0], 
          metrics: ['duration', 'distance']
        })
      });

      if (response.ok) {
        const matrixData = await response.json();
        const durations = matrixData.durations[0];
        
        candidates.forEach((c, i) => {
          const seconds = durations[i + 1];
          if (seconds !== null) {
            // Apply slight traffic multiplier if peak hour, since ORS doesn't always have live traffic
            const multiplier = isPeakHour ? 1.3 : 1.0;
            c._simulatedDriveTimeMin = (seconds / 60) * multiplier;
          }
        });
      }
    }
  } catch (err) {
    console.warn("ORS Routing Failed. Falling back to distance-based ETA.", err.message);
  }

  // 2. Extrema calculation for Normalization
  const maxDriveTime = Math.max(...candidates.map(c => c._simulatedDriveTimeMin));
  const minDriveTime = Math.min(...candidates.map(c => c._simulatedDriveTimeMin));
  const maxDist = Math.max(...candidates.map(c => c._haversineDist));
  const minDist = Math.min(...candidates.map(c => c._haversineDist));
  const maxPrice = Math.max(...candidates.map(c => Number(c.price)));
  const minPrice = Math.min(...candidates.map(c => Number(c.price)));

  // Demand tracking limits
  const maxDemand = 1; // 1.0 is max demand
  const minDemand = 0; 

  // 3. Scoring Engine
  candidates = candidates.map(slot => {
    // A. Travel Time
    const timeScore = normalize(slot._simulatedDriveTimeMin, minDriveTime, maxDriveTime) * weights.travelTime;
    
    // B. Walking Distance
    const distScore = normalize(slot._haversineDist, minDist, maxDist) * weights.distance;
    
    // C. Price
    const priceScore = normalize(Number(slot.price), minPrice, maxPrice) * weights.price;

    // D. Availability Logic
    const availableSlots = Number(slot.availableSlots || slot.available_slots || 0);
    const totalSlots = Number(slot.totalSlots || slot.total_slots || 1);
    let availabilityPenalty = 0;
    
    if (totalSlots > 0) {
      if (availableSlots === 0) availabilityPenalty = 100; // Unacceptable if full
      else {
        const occupancy = (totalSlots - availableSlots) / totalSlots;
        // Sharper penalty if almost full
        if (occupancy > 0.8) availabilityPenalty = occupancy + 0.5;
        else availabilityPenalty = occupancy;
      }
    }
    const availableScore = availabilityPenalty * weights.availability;

    // E. Demand Intelligence (Booking frequency & Area pressure)
    // We proxy booking frequency using current occupancy for stateless efficiency.
    const demandRatio = Math.min(1, (totalSlots - availableSlots) / totalSlots);
    const demandScore = normalize(demandRatio, minDemand, maxDemand) * weights.demand;

    // F. Vehicle-Type Intelligence (Requirement 4)
    let vehicleScore = 0;
    const selectedVehicle = (options.vehicle || 'car').toLowerCase();
    
    // Logic: 
    // - Bikes prefer cheaper, smaller lots (residential/on-street).
    // - Large/SUVs prefer commercial/public lots with high capacity.
    if (selectedVehicle === 'bike') {
      if (type === 'residential') vehicleScore -= 0.1; // Reward residential for bikes
      if (Number(slot.price) < 20) vehicleScore -= 0.05; // Reward cheaper for bikes
    } else if (selectedVehicle === 'large') {
      if (totalSlots > 100) vehicleScore -= 0.1; // Reward high capacity for SUVs
      if (type === 'public') vehicleScore -= 0.05; // Public lots usually have better SUV ramps
    }

    // G. Context-Aware Logic (Reward/Penalty)
    let contextModifier = 0;
    // Morning (6am - 11am): prioritize commercial/office
    if (currentHour >= 6 && currentHour < 11) {
      if (type === 'commercial' || type === 'office') contextModifier -= 0.05;
      if (type === 'residential') contextModifier += 0.05; 
    }
    // Evening (17pm - 23pm): prioritize residential
    else if (currentHour >= 17 && currentHour <= 23) {
       if (type === 'residential') contextModifier -= 0.05;
       if (type === 'commercial') contextModifier += 0.05;
    }

    // We want the LOWEST score possible
    const totalScore = timeScore + distScore + priceScore + availableScore + demandScore + vehicleScore + contextModifier;

    return {
      ...slot,
      distance: slot._haversineDist,             
      etaText: Math.max(1, Math.round(slot._simulatedDriveTimeMin)) + " min",
      score: totalScore
    };
  });

  // 4. Sort by score ascending (lowest score = best parking)
  candidates.sort((a, b) => a.score - b.score);

  // 5. Generate Labels
  if (candidates.length > 0) {
    // Find the one with highest available slots that is ALSO decently scored
    const safeCandidates = candidates.filter(c => (c.availableSlots || c.available_slots) > 0);
    if (safeCandidates.length > 0) {
      safeCandidates[0].isBestMatch = true;
      
      let badgeLabel = "Best Option (Smart)";
      let reason = "Optimal balance of time, price, and availability";
      
      const vehicle = (options.vehicle || 'car').toLowerCase();
      const vehicleText = (vehicle === 'bike') ? "Bike-friendly" : (vehicle === 'large' ? "SUV-friendly" : "Car-friendly");

      if (preference === 'fastest') {
         badgeLabel = `Best Option (${vehicleText})`;
         reason = "Quickest route considering vehicle type & traffic";
      } else if (preference === 'cheapest') {
         badgeLabel = `Best Option (${vehicleText})`;
         reason = "Lowest price per hour for your vehicle";
      } else if (preference === 'closest') {
         badgeLabel = `Best Option (${vehicleText})`;
         reason = "Shortest walking distance for your vehicle";
      } else {
         badgeLabel = `Best Option (${vehicleText})`;
         reason = "Best match for your vehicle & location";
      }
      
      safeCandidates[0].label = badgeLabel;
      safeCandidates[0].reason = reason;

      // Assign label 2
      if (safeCandidates.length > 1) {
          safeCandidates[1].label = "Good Alternative";
      }
    }
  }

  // Cleanup internal properties
  return candidates.map(c => {
    delete c._haversineDist;
    delete c._simulatedDriveTimeMin;
    return c;
  });
}

module.exports = { rankParkingSlots };
