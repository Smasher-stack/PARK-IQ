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

  const blueDotIcon = L.divIcon({
    className: 'blue-dot-marker',
    html: `<div style="width: 16px; height: 16px; background-color: #3b82f6; border-radius: 50%; border: 3px solid white; box-shadow: 0 0 10px rgba(59,130,246,0.6);"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8]
  });

  // Helper mappings
  const STATUS_CLASSES = {
    "available": "marker-available",
    "limited": "marker-limited",
    "booked": "marker-full"
  };

  // Keep track of all generated spot markers to clear them when searching a new area
  let allMarkers = [];
  
  // Advanced Scaling Globals
  let currentFilters = { maxPrice: 100, type: 'all', availableOnly: false };
  let heatLayerObj = null;
  let isHeatmapActive = false;
  let globalRoutingControl = null;

  // Global navigator function
  window.startNavigation = (destLat, destLng) => {
    if (globalRoutingControl) map.removeControl(globalRoutingControl);
    
    // Draw route using user active origin and selected destination
    globalRoutingControl = L.Routing.control({
      waypoints: [
        L.latLng(userMarkerObj.getLatLng().lat, userMarkerObj.getLatLng().lng),
        L.latLng(destLat, destLng)
      ],
      routeWhileDragging: false,
      addWaypoints: false,
      show: false, // UI hidden, trace visible
      lineOptions: { styles: [{color: '#3b82f6', opacity: 0.8, weight: 6}] }
    }).addTo(map);

    // Close any popups
    map.closePopup();
  };

  const openSidePanelDetail = (id, name, lat, lng, totalSlots, availSlots, price) => {
    const sidePanel = document.getElementById('sidePanel');
    const colorCode = window.mapFilters.getColorCodeByAvailability(availSlots, totalSlots);

    sidePanel.innerHTML = `
      <div style="background: var(--bg); height:100%; display:flex; flex-direction:column;">
        <div style="background: var(--accent); padding: 20px; color: white;">
          <button class="btn-ghost" onclick="document.getElementById('sidePanel').style.right='-400px'" style="background: rgba(255,255,255,0.2); border:none; padding:4px 8px; border-radius:4px; color:white; cursor:pointer; margin-bottom:12px;">Close</button>
          <h2 style="font-weight: 900; margin: 0; font-size:1.4rem;">${name}</h2>
        </div>
        <div style="padding: 20px; flex: 1;">
          <h3 style="font-size:0.9rem; color:var(--text-sec); text-transform:uppercase; font-weight:800; margin-bottom:10px;">Capacity Status</h3>
          <div style="display:flex; align-items:center; gap: 8px; margin-bottom: 20px;">
            <div style="width:14px; height:14px; border-radius:50%; background-color:${colorCode};"></div>
            <span style="font-weight:700; font-size:1.1rem;">${availSlots} <span style="font-weight:400; font-size:0.9rem; color:var(--text-sec);">/ ${totalSlots} available</span></span>
          </div>

          <h3 style="font-size:0.9rem; color:var(--text-sec); text-transform:uppercase; font-weight:800; margin-bottom:10px;">Pricing Pricing</h3>
          <div style="font-weight:800; font-size:1.2rem; color:var(--text); margin-bottom:20px;">₹${price}/hr</div>

          <button onclick="window.location.href='book.html?slotId=${id}'" class="btn btn-primary" style="width:100%; border-radius:8px; padding: 12px; font-size:1.05rem;" ${availSlots === 0 ? 'disabled' : ''}>${availSlots === 0 ? 'Lot Full' : 'Reserve Spot Now'}</button>
          
          <button onclick="window.startNavigation(${lat}, ${lng})" class="btn btn-ghost" style="width:100%; border-radius:8px; padding: 12px; font-size:1.05rem; margin-top: 10px; border: 1px solid var(--border); box-shadow: var(--shadow-sm);">Navigate</button>
        </div>
      </div>
    `;
    sidePanel.style.right = "0"; // Slide in from right edge
  };

  // Function to build a leaflet marker and bind standard popups natively
  const renderParkingMarker = (slot) => {
    const { id, lat, lng, name, status, availableSlots, totalSlots, price } = slot;
    const isNearest = slot.distance === Math.min(...allParkingData.map(s => s.distance));
    
    // Dynamic Scaled Marker Colors
    const colorString = window.mapFilters.getColorCodeByAvailability(availableSlots, totalSlots);
    const customHtml = `<div style="width: 24px; height: 24px; background-color: ${colorString}; border-radius: 50%; border: 3px solid white; box-shadow: 0 4px 8px rgba(0,0,0,0.4); transform: ${isNearest ? 'scale(1.2)' : 'scale(1)'}; transition: transform 0.2s;"></div>`;

    const icon = L.divIcon({
      html: customHtml,
      className: '',
      iconSize: [24, 24],
      iconAnchor: [12, 12]
    });

    const marker = L.marker([lat, lng], { icon }).addTo(map);
    allMarkers.push(marker);

    // Sprint 4: Draw physical 150m geofence radius around the marker
    const geofence = L.circle([lat, lng], {
      color: 'var(--accent)',
      fillColor: 'var(--accent)',
      fillOpacity: 0.05,
      weight: 1,
      radius: 150
    }).addTo(map);
    allMarkers.push(geofence);
    
    // Store exact reference for programmatical triggers
    window.slotLayers[id] = { marker, circle: geofence };

    const isFull = status === "booked";
    const btnText = isFull ? "Lot Full" : "Reserve Spot";
    const btnDisabled = isFull ? "disabled" : "";
    
    let displayStatus = "Available";
    let badgeClassSuffix = "Available";
    if (status === "booked") {
      displayStatus = "Booked";
      badgeClassSuffix = "Full";
    } else if (status === "limited") {
      displayStatus = "Limited";
      badgeClassSuffix = "Limited";
    }

    // Bind Tooltip on hover
    const tooltipHtml = `<div style="text-align:center;"><strong>${name}</strong><br/><span style="color:#666">Slot #${id}</span><br/><strong style="font-size:0.9rem; color: #333;">${displayStatus} (${availableSlots}/${totalSlots})</strong></div>`;
    marker.bindTooltip(tooltipHtml, { direction: 'top', offset: [0, -32], opacity: 0.95 });
    
    const badgeHtml = `<div class="tag-badge badge-${badgeClassSuffix}">${displayStatus}</div>`;
    const walkMins = window.distanceUtils.getWalkingTimeMins(slot.distance || 0.1);

    const popupHtml = `
      <div class="custom-popup" style="padding-bottom: 2px;">
        <h3 style="font-weight: 800; font-size: 1.1rem;">${name}</h3>
        <p style="font-size: 0.85rem; color: var(--text-sec); margin-bottom: 8px;">Public Parking Location</p>
        
        <div class="meta-row">
          <span>
            <svg class="meta-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12h11m0 0L9 9m4 3-4 3"/><path d="M22 12A10 10 0 1 1 12 2"/></svg>
            <span class="route-text">Calculating...</span>
          </span>
          <span>
            <i data-lucide="footprints" style="width: 14px; margin-right: 4px;"></i> ${walkMins} min walk
          </span>
        </div>
        <div class="meta-row">
          <span>
            <svg class="meta-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
            ${availableSlots}/${totalSlots} Slots
          </span>
          <span>
            <svg class="meta-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 18V6"/></svg>
            ₹${price}/hr
          </span>
        </div>
        ${badgeHtml}
        <div style="display: flex; gap: 8px; margin-top: 8px;">
          <button class="btn-reserve" style="flex:1;" ${btnDisabled} data-id="${id}" data-lat="${lat}" data-lng="${lng}">${btnText}</button>
          <button class="btn-navigate" onclick="window.startNavigation(${lat}, ${lng})" style="background:var(--bg); border:1px solid var(--border); border-radius:var(--r-sm); padding:0 12px; cursor:pointer;" title="Navigate"><i data-lucide="navigation" style="width:16px;"></i></button>
        </div>
      </div>
    `;

    marker.bindPopup(popupHtml, {
      minWidth: 260,
      offset: [0, -4],
      autoPanPadding: [50, 50]
    });

    // When the popup opens, dynamically calculate true distance & time from the user's origin
    marker.on('popupopen', function(e) {
      const popupNode = e.popup.getElement();
      if (!popupNode) return;
      
      const routeTextNode = popupNode.querySelector('.route-text');
      if (routeTextNode && routeTextNode.innerText.includes("Calculating")) {
        const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${userLng},${userLat};${lng},${lat}?overview=false`;
        
        fetch(osrmUrl)
          .then(res => res.json())
          .then(data => {
            if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
              const distanceKm = (data.routes[0].distance / 1000).toFixed(1);
              const durationMins = Math.max(1, Math.round(data.routes[0].duration / 60)); // minimum 1 min
              routeTextNode.innerHTML = `<strong>${distanceKm} km</strong> • ${durationMins} min`;
            } else {
              routeTextNode.innerText = "Route unavailable";
            }
          })
          .catch(err => {
            console.error("OSRM Route Error:", err);
            routeTextNode.innerText = "Distance N/A";
          });
      }
    });

    marker.on('click', function(e) {
      map.setView(e.latlng, 15, { animate: true, duration: 0.8 });
      // Launch global side panel
      openSidePanelDetail(id, name, lat, lng, totalSlots, availableSlots, price);
    });
  };

  let allParkingData = [];
  let userMarkerObj = null;
  const notifiedZones = new Set(); // Tracks zones the user has already received alerts for
  window.slotLayers = {}; // Store programmatic Leaflet layers

  const reRenderMap = (lat, lon, isLive = false) => {
    // Clear old map states
    allMarkers.forEach(m => map.removeLayer(m));
    allMarkers = [];
    if (userMarkerObj) map.removeLayer(userMarkerObj);

    // Expand search radius slightly to ensure we capture relevant data but NEVER exceed threshold to save memory
    let maxRadius = 5.0; // Fixed 5km chunking ring bound
    
    // Process Arrays cleanly over Geofence math
    let nearby = allParkingData.map(slot => {
        slot.distance = window.geofenceUtils.calculateDistance(lat, lon, slot.lat, slot.lng);
        return slot;
    }).filter(slot => slot.distance <= maxRadius);

    // Apply Active Filters (UI Menu Checkboxes/Ranges)
    nearby = window.mapFilters.applyActiveFilters(nearby, currentFilters);

    // Filter strictly nearest and limit Top 50 visible points globally to save Chrome memory
    nearby = nearby.sort((a,b) => a.distance - b.distance).slice(0, 50);

    // Render cleanly
    nearby.forEach((slot) => {
      renderParkingMarker({
        id: slot.id,
        lat: slot.lat,
        lng: slot.lng,
        name: slot.name,
        status: slot.status,
        availableSlots: slot.availableSlots || slot.available_slots,
        totalSlots: slot.totalSlots || slot.total_slots,
        price: slot.price || 30,
        distance: slot.distance
      });
    });

    // Handle Heatmap Overlay Density Trace
    if (heatLayerObj) map.removeLayer(heatLayerObj);
    if (isHeatmapActive) {
      const heatData = nearby.map(s => [s.lat, s.lng, (s.totalSlots || s.total_slots) - (s.availableSlots || s.available_slots)]);
      heatLayerObj = L.heatLayer(heatData, { radius: 35, blur: 15, maxZoom: 16 }).addTo(map);
    }

    // Construct dynamically the standard Car pin purely for all states including GPS
    const activeIcon = userIcon;
    userMarkerObj = L.marker([lat, lon], { icon: activeIcon, zIndexOffset: 1000 }).addTo(map);
    map.flyTo([lat, lon], 14, { animate: true, duration: 1.5 });
    lucide.createIcons();
  };

  // Fetch from JSON API
  fetch('/api/slots')
    .then(response => response.json())
    .then(data => {
      allParkingData = data;
      // Load standard default map without firing invasive browser location permission loops
      reRenderMap(userLat, userLng, false);
    })
    .catch(err => console.error('Error fetching parking data:', err));

  // Global Routing State
  let routingControl = null;

  document.addEventListener('click', function(e) {
    if (e.target && e.target.classList.contains('btn-reserve') && !e.target.disabled) {
      const slotId = e.target.getAttribute('data-id');
      window.location.href = `book.html?slotId=${slotId}`;
    }
  });

  // ════════ LOCATION SEARCH LOGIC & LIVE GEO ════════
  const searchInput = document.getElementById('searchDestination');
  const searchBtn = document.querySelector('.search-btn');
  const currentLocationBtn = document.querySelector('.current-location-btn');
  let searchMarker = null;

  if (currentLocationBtn) {
    let watchId = null;

    currentLocationBtn.addEventListener('click', () => {
      if ("geolocation" in navigator) {
        document.getElementById('searchOrigin').value = "Locating...";
        
        // Start live continuous tracking
        watchId = navigator.geolocation.watchPosition(
          (position) => { 
            const uLat = position.coords.latitude;
            const uLng = position.coords.longitude;
            document.getElementById('searchOrigin').value = "Live GPS Tracking Active";
            reRenderMap(uLat, uLng, true); 

            // Sprint 4: Geofence Utils & Bounds Checking Loop
            const sortedZones = window.geofenceUtils.sortZonesByDistance(allParkingData, uLat, uLng);
            
            sortedZones.forEach(slot => {
              const distanceKm = slot.distanceKm;

              // Visually update distance node inside popup if DOM is active
              const dNode = document.getElementById(`dist-ui-${slot.id}`);
              if (dNode) dNode.innerText = (distanceKm * 1000).toFixed(0);
              
              if (distanceKm <= 0.150 && !notifiedZones.has(slot.id)) {
                // Event: ZONE ENTERED
                notifiedZones.add(slot.id);
                triggerSmartParkingAlert(slot, distanceKm);
                
                // Advanced UX Programmatic Triggers
                if (window.slotLayers[slot.id]) {
                  window.geofenceUtils.updateZoneStyle(window.slotLayers[slot.id].circle, true);
                  
                  // Auto Zoom & Pop Marker if they are physically extremely near 
                  map.flyTo([slot.lat, slot.lng], 17, { animate: true, duration: 1.2 });
                  window.slotLayers[slot.id].marker.openPopup();
                }

              } else if (distanceKm > 0.165 && notifiedZones.has(slot.id)) {
                // Event: ZONE EXITED (Using 165m Hysteresis threshold to stop bouncing alerts)
                notifiedZones.delete(slot.id);
                
                if (window.slotLayers[slot.id]) {
                  window.geofenceUtils.updateZoneStyle(window.slotLayers[slot.id].circle, false);
                }
              }
            });
          },
          (err) => { 
            document.getElementById('searchOrigin').value = "";
            alert("Location access denied or unavailable. Using default origin."); 
            reRenderMap(userLat, userLng, false); 
          },
          { enableHighAccuracy: true, maximumAge: 10000 }
        );
      } else {
        alert("Geolocation not natively supported by this browser.");
      }
    });
  }

  // Inject Smart Parking Alert Overlay into DOM when event is triggered
  function triggerSmartParkingAlert(slot, distance) {
    const overlayHtml = `
      <div id="smartAlertOverlay" style="position: fixed; top: 20px; left: 50%; transform: translateX(-50%); z-index: 9999; width: 90%; max-width: 400px; background: var(--bg); border-radius: var(--r-card); box-shadow: var(--shadow-xl); border: 2px solid var(--accent); overflow: hidden; animation: slideDownAlert 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;">
        <div style="background: var(--accent); color: #fff; padding: 12px 18px; font-weight: 800; display: flex; justify-content: space-between; align-items: center;">
          <span style="display:flex; align-items:center; gap:6px;"><i data-lucide="bell-ring" style="width:16px;"></i> Zone Entry Detected</span>
          <button onclick="document.getElementById('smartAlertOverlay').remove()" style="background:none; border:none; color:#fff; cursor:pointer;"><i data-lucide="x" style="width:18px;"></i></button>
        </div>
        <div style="padding: 16px;">
          <h3 style="margin-bottom: 4px; font-weight: 800; font-size: 1.1rem; color: var(--text);">${slot.name}</h3>
          <p style="color: var(--text-sec); font-size: 0.9rem; margin-bottom: 12px;">You are ${(distance * 1000).toFixed(0)} meters away.</p>
          <div style="display: flex; gap: 10px; margin-bottom: 16px;">
            <div style="background: var(--green-soft); color: var(--green); padding: 4px 8px; border-radius: var(--r-sm); font-size: 0.8rem; font-weight: 700;">${slot.available_slots || slot.availableSlots}/${slot.total_slots || slot.totalSlots} Slots</div>
            <div style="background: #e2e8f0; color: #334155; padding: 4px 8px; border-radius: var(--r-sm); font-size: 0.8rem; font-weight: 700;">₹${slot.price || 30}/hr</div>
          </div>
          <button class="btn btn-primary" style="width: 100%; border-radius: var(--r-sm);" onclick="window.location.href='book.html?slotId=${slot.id}'">Reserve Now</button>
        </div>
      </div>
      <style>@keyframes slideDownAlert { from { transform: translate(-50%, -100%); opacity: 0; } to { transform: translate(-50%, 0); opacity: 1; } }</style>
    `;
    
    // Remove existing if any, then append
    const existing = document.getElementById('smartAlertOverlay');
    if (existing) existing.remove();
    document.body.insertAdjacentHTML('beforeend', overlayHtml);
    lucide.createIcons();

    // Enhancements: Auto Hide After 10s
    setTimeout(() => {
      const el = document.getElementById('smartAlertOverlay');
      if (el) el.remove();
    }, 10000);
  }

  if (searchInput && searchBtn) {
    const executeSearch = () => {
      const query = searchInput.value.trim();
      if (!query) return;

      searchBtn.innerText = "...";
      searchBtn.disabled = true;
      
      const encodedQuery = encodeURIComponent(query);
      const url = `https://nominatim.openstreetmap.org/search?q=${encodedQuery}&format=json&limit=1`;

      fetch(url)
        .then(res => res.json())
        .then(data => {
          searchBtn.innerText = "Search";
          searchBtn.disabled = false;
          if (data && data.length > 0) {
            const loc = data[0];
            const lat = parseFloat(loc.lat);
            const lon = parseFloat(loc.lon);
            // Search origin update in Nominatim
            if (searchMarker) map.removeLayer(searchMarker);
            reRenderMap(lat, lon, false);
          } else {
            alert("No results found via Maps API.");
          }
        })
        .catch(err => {
          searchBtn.innerText = "Search";
          searchBtn.disabled = false;
          console.error(err);
        });
    };

    searchBtn.addEventListener('click', executeSearch);

    // Enter key triggers map searches too
    searchInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') executeSearch();
    });
  }

  // Bind Heatmap Toggle
  const toggleBtn = document.getElementById('toggleHeatmap');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      isHeatmapActive = !isHeatmapActive;
      toggleBtn.style.background = isHeatmapActive ? '#fee2e2' : 'white';
      
      if (userMarkerObj) {
        reRenderMap(userMarkerObj.getLatLng().lat, userMarkerObj.getLatLng().lng, false);
      }
    });
  }

  // Bind Filtering Logic
  const priceInput = document.getElementById('filterPrice');
  const typeInput = document.getElementById('filterType');
  const availInput = document.getElementById('filterAvailable');
  const priceValDisp = document.getElementById('priceVal');

  const updateMapFiltersState = () => {
    if (priceInput) currentFilters.maxPrice = parseInt(priceInput.value, 10);
    if (typeInput) currentFilters.type = typeInput.value;
    if (availInput) currentFilters.availableOnly = availInput.checked;
    
    if (priceValDisp && priceInput) priceValDisp.innerText = priceInput.value;

    if (userMarkerObj) {
      reRenderMap(userMarkerObj.getLatLng().lat, userMarkerObj.getLatLng().lng, false);
    }
  };

  if (priceInput) priceInput.addEventListener('input', updateMapFiltersState);
  if (typeInput) typeInput.addEventListener('change', updateMapFiltersState);
  if (availInput) availInput.addEventListener('change', updateMapFiltersState);

})();
