// ─── Distance & Movement Utilities ───────────────────────────────────────────

window.distanceUtils = {
    /**
     * Calculates the estimated walking time in minutes based on real-world average walking speed.
     * Assumes an average walking speed of 80 meters per minute (~4.8 km/h).
     */
    getWalkingTimeMins: (distanceKm) => {
      const distanceMeters = distanceKm * 1000;
      const speedMetersPerMin = 80;
      const mins = Math.ceil(distanceMeters / speedMetersPerMin);
      return Math.max(1, mins); // Minimum 1 minute
    }
  };
  
