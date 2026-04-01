(function () {
  "use strict";
  
  // init floating icons
  lucide.createIcons();

  // Initialize Map
  const map = L.map('map', {
    zoomControl: false // Hide default zoom controls for cleaner UI
  }).setView([13.0478, 80.2426], 13); // Chennai default origin

  // Add CartoDB Positron for a super clean, minimal basemap
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 19
  }).addTo(map);

  const userLat = 13.0478;
  const userLng = 80.2426;
  
  const carSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21 8-2 2-1.5-3.7A2 2 0 0 0 15.64 5H8.4a2 2 0 0 0-1.9 1.3L5 10 3 8"/><path d="M1 14h22"/><path d="M9 15h6"/><path d="M3 10h18v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><circle cx="7" cy="15" r="2"/><circle cx="17" cy="15" r="2"/></svg>`;

  const userIcon = L.divIcon({
    className: 'user-marker',
    html: carSvg,
    iconSize: [40, 40],
    iconAnchor: [20, 20]
  });

  L.marker([userLat, userLng], { icon: userIcon, zIndexOffset: 1000 }).addTo(map);

  // Helper mappings
  const STATUS_CLASSES = {
    "available": "marker-available",
    "limited": "marker-limited",
    "occupied": "marker-full"
  };

  // Keep track of all generated spot markers to clear them when searching a new area
  let allMarkers = [];

  // Function to build a leaflet marker and bind standard popups natively
  const renderParkingMarker = (lat, lng, name, status, availableSlots, totalSlots) => {
    const markerClass = STATUS_CLASSES[status] || "marker-full";
    const icon = L.divIcon({
      className: `custom-marker ${markerClass}`,
      iconSize: [28, 28],
      iconAnchor: [14, 34]
    });

    const marker = L.marker([lat, lng], { icon }).addTo(map);
    allMarkers.push(marker);

    const isFull = status === "occupied";
    const btnText = isFull ? "Lot Full" : "Reserve Spot";
    const btnDisabled = isFull ? "disabled" : "";
    
    const displayStatus = status.charAt(0).toUpperCase() + status.slice(1);
    let badgeClassSuffix = displayStatus;
    if (displayStatus === "Occupied") badgeClassSuffix = "Full";
    
    const badgeHtml = `<div class="tag-badge badge-${badgeClassSuffix}">${displayStatus}</div>`;
    const mockDistNum = (Math.random() * 2 + 0.1).toFixed(1);

    const popupHtml = `
      <div class="popup-card">
        <h3 class="popup-title">${name}</h3>
        <div class="popup-meta">
          <span>
            <svg class="meta-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12h11m0 0L9 9m4 3-4 3"/><path d="M22 12A10 10 0 1 1 12 2"/></svg>
            ${mockDistNum} km
          </span>
          <span>
            <svg class="meta-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
            ${availableSlots}/${totalSlots} Slots
          </span>
        </div>
        ${badgeHtml}
        <button class="btn-reserve" ${btnDisabled} data-lat="${lat}" data-lng="${lng}">${btnText}</button>
      </div>
    `;

    marker.bindPopup(popupHtml, {
      minWidth: 260,
      offset: [0, -4],
      autoPanPadding: [50, 50]
    });

    marker.on('click', function(e) {
      map.setView(e.latlng, 15, { animate: true, duration: 0.8 });
    });
  };

  // Fetch and Parse Initial Baseline CSV Data (Chennai wide snapshot)
  fetch('parkingSlots_30.csv.xls')
    .then(response => response.text())
    .then(csvText => {
      const lines = csvText.split('\n').filter(line => line.trim() !== '');
      const dataLines = lines.slice(1);
      
      dataLines.forEach(line => {
        const [id, name, latStr, lngStr, statusStr, totalSlots, availableSlots] = line.split(',');
        const lat = parseFloat(latStr);
        const lng = parseFloat(lngStr);
        if (isNaN(lat) || isNaN(lng)) return;

        const status = statusStr.trim().toLowerCase();
        renderParkingMarker(lat, lng, name, status, availableSlots, totalSlots);
      });
    })
    .catch(err => console.error('Error fetching parking data:', err));

  // Global Routing State
  let routingControl = null;

  document.addEventListener('click', function(e) {
    if (e.target && e.target.classList.contains('btn-reserve') && !e.target.disabled) {
      const destLat = parseFloat(e.target.getAttribute('data-lat'));
      const destLng = parseFloat(e.target.getAttribute('data-lng'));
      
      e.target.innerText = "Routing...";
      e.target.disabled = true;

      if (routingControl) {
        map.removeControl(routingControl);
      }

      routingControl = L.Routing.control({
        waypoints: [
          L.latLng(userLat, userLng),
          L.latLng(destLat, destLng)
        ],
        routeWhileDragging: false,
        addWaypoints: false,
        fitSelectedRoutes: true,
        show: false
      }).addTo(map);
      
      setTimeout(() => { map.closePopup(); }, 500);
    }
  });

  // ════════ LOCATION SEARCH LOGIC & LIVE OVERPASS OSM ════════
  const searchInput = document.querySelector('.location-input[placeholder="Where to park?"]');
  const searchBtn = document.querySelector('.search-btn');
  let searchMarker = null;

  // Function to pull legit, real-world public parking spaces strictly around the supplied coordinate radius
  const fetchLiveParking = (lat, lon, queryName) => {
    // Clear out the previous baseline / search markers so the map isn't cluttered
    allMarkers.forEach(m => map.removeLayer(m));
    allMarkers = [];

    // Query OSM for actual real-world legitimate parking amenity nodes within 3km of search center
    const overpassUrl = `https://overpass-api.de/api/interpreter?data=[out:json];node(around:3000,${lat},${lon})["amenity"="parking"];out;`;
    
    fetch(overpassUrl)
      .then(res => res.json())
      .then(data => {
        if (!data.elements || data.elements.length === 0) {
           alert(`No official public parking areas tracked by OpenStreetMap in "${queryName}".`);
           return;
        }

        // Plot legitimate OSM parking spaces on the map
        data.elements.forEach(node => {
          const pLat = node.lat;
          const pLon = node.lon;
          const name = (node.tags && node.tags.name) ? node.tags.name : "Public Parking Area";
          
          // Generate a realistic live simulation of the slot capacities for these actual map coordinates
          const totalSlots = Math.floor(Math.random() * 150) + 20; 
          const availableSlots = Math.floor(Math.random() * totalSlots);
          const ratio = availableSlots / totalSlots;
          
          let status = 'available';
          if (ratio === 0) status = 'occupied';
          else if (ratio < 0.2) status = 'limited';
          
          renderParkingMarker(pLat, pLon, name, status, availableSlots, totalSlots);
        });
      })
      .catch(err => console.error("Error fetching live OSM parking data:", err));
  };


  if (searchInput && searchBtn) {
    const executeSearch = () => {
      const query = searchInput.value.trim();
      if (!query) return;

      searchBtn.innerText = "...";
      searchBtn.disabled = true;
      
      const encodedQuery = encodeURIComponent(query + ', Chennai');
      const url = `https://nominatim.openstreetmap.org/search?q=${encodedQuery}&format=json&limit=1`;

      fetch(url)
        .then(res => res.json())
        .then(data => {
          searchBtn.innerText = "Search";
          searchBtn.disabled = false;
          
          if (data && data.length > 0) {
            const lat = parseFloat(data[0].lat);
            const lon = parseFloat(data[0].lon);
            
            map.flyTo([lat, lon], 15, {
              animate: true,
              duration: 1.5
            });

            if (searchMarker) {
              map.removeLayer(searchMarker);
            }

            searchMarker = L.marker([lat, lon]).addTo(map)
              .bindPopup(`Searched: <strong>${query.charAt(0).toUpperCase() + query.slice(1)}</strong>`)
              .openPopup();
              
            // Fetch authentic OSM public parking lots mapping to this specific Chennai coordinate area
            fetchLiveParking(lat, lon, query);
          } else {
            alert(`We couldn't locate "${query}" within Chennai. Please try entering a specific local area.`);
          }
        })
        .catch(err => {
          console.error("Geocoding Error:", err);
          searchBtn.innerText = "Search";
          searchBtn.disabled = false;
          alert('Error resolving location. Please check your connection and try again.');
        });
    };

    searchBtn.addEventListener('click', executeSearch);

    searchInput.addEventListener('keypress', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        executeSearch();
      }
    });
  }

})();
