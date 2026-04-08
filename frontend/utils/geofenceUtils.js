// ─── Geofencing Utilities ──────────────────────────────────────────────────────

window.geofenceUtils = {
    /**
     * Haversine formula to compute distance between two latitude and longitude coordinates.
     * Returns the exact distance in Kilometers.
     */
    calculateDistance: (lat1, lon1, lat2, lon2) => {
      const R = 6371; // Earth Radius in km
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLon = (lon2 - lon1) * Math.PI / 180;
      const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                Math.sin(dLon / 2) * Math.sin(dLon / 2);
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    },
  
    /**
     * Shifts the Leaflet graphics representing the target Zone.
     */
    updateZoneStyle: (circleLayer, isActive) => {
      if (!circleLayer) return;
      
      if (isActive) {
        // Vibrant Green inside geofence
        circleLayer.setStyle({
          color: '#10b981',
          fillColor: '#34d399',
          fillOpacity: 0.35,
          weight: 2
        });
      } else {
        // Standard Transparent Blue outside geofence
        circleLayer.setStyle({
          color: 'var(--accent)',
          fillColor: 'var(--accent)',
          fillOpacity: 0.05,
          weight: 1
        });
      }
    },
  
    /**
     * Iterates over a parking data array and returns them sorted sequentially by radial distance from target center.
     */
    sortZonesByDistance: (zones, uLat, uLng) => {
      return [...zones].map(z => {
        return {
          ...z,
          distanceKm: window.geofenceUtils.calculateDistance(uLat, uLng, z.lat, z.lng)
        };
      }).sort((a, b) => a.distanceKm - b.distanceKm);
    }
  };
  
