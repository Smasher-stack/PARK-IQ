// ─── Map Array Filters ───────────────────────────────────────────────────────

window.mapFilters = {
    /**
     * Executes filters against the raw array.
     * @param {Array} arr - The raw parking locations array
     * @param {Object} rules - The user's active filter states e.g. { maxPrice: 40, type: 'public', availableOnly: true }
     */
    applyActiveFilters: (arr, rules) => {
      return arr.filter(slot => {
        // 1. Price Filtering
        if (rules.maxPrice && slot.price > rules.maxPrice) return false;
        
        // 2. Type Filtering
        if (rules.type && rules.type !== 'all' && slot.type !== rules.type) return false;
  
        // 3. Availability Filtering
        if (rules.availableOnly && slot.available_slots <= 0) return false;
  
        return true;
      });
    },
  
    /**
     * Determine graphical rendering bounds visually indicating capacity limits.
     */
    getColorCodeByAvailability: (available, total) => {
      if (total === 0 || available === 0) return 'red';
      const ratio = available / total;
      if (ratio > 0.6) return 'green';
      if (ratio > 0.1) return 'yellow';
      return 'red';
    }
  };
  
