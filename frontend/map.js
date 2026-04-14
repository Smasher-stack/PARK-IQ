(function () {
  "use strict";
  
  // Init floating icons
  lucide.createIcons();

  // ════════ MAP INITIALIZATION — IMPROVEMENT 9 (Smooth movement) ════════
  const map = L.map('map', {
    zoomControl: false,
    zoomAnimation: true,
    markerZoomAnimation: true,
    fadeAnimation: true
  }).setView([12.9516, 80.1462], 14);

  // CartoDB Positron for clean, minimal basemap
  const lightMap = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap contributors'
  });
  const satelliteMap = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 19,
    attribution: '© Esri'
  });

  lightMap.addTo(map);

  // Satellite state — toggled via our custom button
  let isSatelliteActive = false;

  // ════════ MARKER CLUSTER — Clean, No Count Bubbles ════════
  const markerCluster = L.markerClusterGroup({
    iconCreateFunction: function(cluster) {
      const count = cluster.getChildCount();
      let size = 24;
      if (count > 20) size = 30;
      else if (count > 10) size = 27;
      return L.divIcon({
        html: `<div class="cluster-dot"></div>`,
        className: 'marker-cluster-minimal',
        iconSize: L.point(size, size)
      });
    },
    maxClusterRadius: 40,
    spiderfyOnMaxZoom: true,
    showCoverageOnHover: false,
    zoomToBoundsOnClick: true,
    animateAddingMarkers: true
  });
  map.addLayer(markerCluster);

  // Default user location (Chromepet Railway Station area)
  const userLat = 12.9516;
  const userLng = 80.1462;
  
  const carSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21 8-2 2-1.5-3.7A2 2 0 0 0 15.64 5H8.4a2 2 0 0 0-1.9 1.3L5 10 3 8"/><path d="M1 14h22"/><path d="M9 15h6"/><path d="M3 10h18v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><circle cx="7" cy="15" r="2"/><circle cx="17" cy="15" r="2"/></svg>`;

  const userIcon = L.divIcon({
    className: 'user-marker',
    html: carSvg,
    iconSize: [38, 38],
    iconAnchor: [19, 19]
  });

  // Helper: get raw color hex from availability ratio
  const getMarkerColor = (available, total) => {
    if (total === 0) return '#e57373';
    const ratio = available / total;
    if (ratio > 0.6) return '#66bb6a';   // soft green
    if (ratio >= 0.3) return '#ffb74d';  // amber
    return '#e57373';                     // muted red
  };

  // STATUS_CLASSES helper
  const STATUS_CLASSES = {
    "available": "marker-available",
    "limited": "marker-limited",
    "booked": "marker-full"
  };

  // State
  let allMarkers = [];
  let currentFilters = { maxPrice: 100, type: 'all', availableOnly: false };
  let heatLayerObj = null;
  let isHeatmapActive = false;
  let globalRoutingControl = null;
  let allParkingData = [];
  let userMarkerObj = null;
  const notifiedZones = new Set();
  window.slotLayers = {};

  // ════════ CUSTOM ROUTE RENDERING — Google Maps Level UX ════════
  let activeRouteLayer = null;
  let activeRouteOutline = null;
  let routeStartMarker = null;
  let routeEndMarker = null;
  let routeAnimationFrame = null;

  // Custom SVG start marker (blue pulsing dot)
  const startMarkerIcon = L.divIcon({
    className: '',
    html: `<div style="position:relative; width:20px; height:20px;">
      <div style="position:absolute; inset:0; background:#2563eb; border-radius:50%; border:3px solid #fff; box-shadow:0 1px 6px rgba(0,0,0,.35);"></div>
      <div style="position:absolute; inset:-6px; border:2px solid rgba(37,99,235,0.3); border-radius:50; animation: routePulse 2s infinite;"></div>
    </div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10]
  });

  // Custom SVG destination pin
  const endMarkerIcon = L.divIcon({
    className: '',
    html: `<div style="position:relative; width:28px; height:36px;">
      <svg width="28" height="36" viewBox="0 0 28 36" fill="none">
        <path d="M14 0C6.27 0 0 6.27 0 14c0 10.5 14 22 14 22s14-11.5 14-22C28 6.27 21.73 0 14 0z" fill="#dc2626"/>
        <circle cx="14" cy="13" r="6" fill="white"/>
        <circle cx="14" cy="13" r="3" fill="#dc2626"/>
      </svg>
    </div>`,
    iconSize: [28, 36],
    iconAnchor: [14, 36]
  });

  // Remove existing route layers cleanly
  function clearRouteDisplay() {
    if (activeRouteLayer) { map.removeLayer(activeRouteLayer); activeRouteLayer = null; }
    if (activeRouteOutline) { map.removeLayer(activeRouteOutline); activeRouteOutline = null; }
    if (routeStartMarker) { map.removeLayer(routeStartMarker); routeStartMarker = null; }
    if (routeEndMarker) { map.removeLayer(routeEndMarker); routeEndMarker = null; }
    if (routeAnimationFrame) { cancelAnimationFrame(routeAnimationFrame); routeAnimationFrame = null; }
    const panel = document.getElementById('routeInfoBar');
    if (panel) panel.innerHTML = '';
  }

  // Animate a polyline being drawn progressively
  function animateRouteDrawing(coords, callback) {
    const totalPoints = coords.length;
    let currentIndex = 2;
    const batchSize = Math.max(2, Math.floor(totalPoints / 40)); // Draw in ~40 frames

    // Outline (shadow)
    activeRouteOutline = L.polyline(coords.slice(0, 2), {
      color: '#1e3a5f',
      weight: 10,
      opacity: 0.25,
      lineCap: 'round',
      lineJoin: 'round',
      interactive: false
    }).addTo(map);

    // Main route line
    activeRouteLayer = L.polyline(coords.slice(0, 2), {
      color: '#2563eb',
      weight: 6,
      opacity: 0.9,
      lineCap: 'round',
      lineJoin: 'round',
      interactive: false
    }).addTo(map);

    function drawNextSegment() {
      if (currentIndex >= totalPoints) {
        if (callback) callback();
        return;
      }
      const end = Math.min(currentIndex + batchSize, totalPoints);
      const newSlice = coords.slice(currentIndex, end);
      newSlice.forEach(pt => {
        activeRouteLayer.addLatLng(pt);
        activeRouteOutline.addLatLng(pt);
      });
      currentIndex = end;
      routeAnimationFrame = requestAnimationFrame(drawNextSegment);
    }
    routeAnimationFrame = requestAnimationFrame(drawNextSegment);
  }

  window.startNavigation = async (destLat, destLng) => {
    // 1. Clear any previous route
    clearRouteDisplay();
    if (globalRoutingControl) { map.removeControl(globalRoutingControl); globalRoutingControl = null; }

    const origin = userMarkerObj ? userMarkerObj.getLatLng() : { lat: userLat, lng: userLng };
    map.closePopup();

    // 2. Show loading state
    const panel = document.getElementById('routeInfoBar');
    panel.innerHTML = `
      <div class="route-info-bar">
        <div class="route-stat">
          <div class="route-stat-value" style="font-size:0.85rem; color:#71717a;">Calculating route...</div>
        </div>
      </div>`;

    try {
      // 3. Call our backend route API (keeps ORS key secure)
      const response = await fetch('/api/parking/route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          start: { lat: origin.lat, lng: origin.lng },
          end: { lat: destLat, lng: destLng }
        })
      });

      const data = await response.json();

      if (!data.success || !data.geometry) {
        panel.innerHTML = `<div class="route-info-bar"><div class="route-stat"><div class="route-stat-value" style="color:#ef4444;">Route not found</div></div></div>`;
        return;
      }

      // 4. Convert GeoJSON [lng,lat] to Leaflet [lat,lng]
      const coords = data.geometry.coordinates.map(c => [c[1], c[0]]);

      // 5. Place start and end markers at SNAPPED positions (road-aligned)
      const startPos = data.snappedStart || { lat: origin.lat, lng: origin.lng };
      const endPos = data.snappedEnd || { lat: destLat, lng: destLng };
      routeStartMarker = L.marker([startPos.lat, startPos.lng], { icon: startMarkerIcon, zIndexOffset: 2000 }).addTo(map);
      routeEndMarker = L.marker([endPos.lat, endPos.lng], { icon: endMarkerIcon, zIndexOffset: 2000 }).addTo(map);
      
      // Bind Best Route Label to end marker and open it
      routeEndMarker.bindTooltip('<div class="best-route-label">Best Route ⭐</div>', { permanent: true, direction: 'top', className: 'transparent-tooltip', offset: [0, -20] }).openTooltip();

      // 6. Fit map bounds to route with padding
      const routeBounds = L.latLngBounds(coords);
      map.fitBounds(routeBounds, { padding: [60, 60], animate: true, duration: 1.0 });

      // 7. Animate the route drawing
      animateRouteDrawing(coords, () => {
        // Animation complete — show info panel
        showRouteInfoBar(data.distance, data.duration);
      });

    } catch (err) {
      console.error('Navigation error:', err);
      panel.innerHTML = `<div class="route-info-bar"><div class="route-stat"><div class="route-stat-value" style="color:#ef4444;">Connection error</div></div></div>`;
    }
  };

  // Show route info bar at bottom
  function showRouteInfoBar(distKm, timeMins) {
    const barHtml = `
      <div class="route-info-bar">
        <div class="route-stat">
          <div class="route-stat-value">${distKm} km</div>
          <div class="route-stat-label">Distance</div>
        </div>
        <div class="route-divider"></div>
        <div class="route-stat">
          <div class="route-stat-value">${timeMins} min</div>
          <div class="route-stat-label">Travel Time</div>
        </div>
        <button class="route-close-btn" onclick="window.clearRoute()" title="Close route">
          <i data-lucide="x"></i>
        </button>
      </div>
    `;
    document.getElementById('routeInfoBar').innerHTML = barHtml;
    lucide.createIcons();
  }

  // Clear route
  window.clearRoute = () => {
    clearRouteDisplay();
    if (globalRoutingControl) {
      map.removeControl(globalRoutingControl);
      globalRoutingControl = null;
    }
  };

  // ════════ SIDE PANEL DETAIL ════════
  const openSidePanelDetail = (id, name, lat, lng, totalSlots, availSlots, price) => {
    const sidePanel = document.getElementById('sidePanel');
    const color = getMarkerColor(availSlots, totalSlots);

    sidePanel.innerHTML = `
      <div style="background: #ffffff; height:100%; display:flex; flex-direction:column;">
        <div style="background: #1a1a1a; padding: 20px; color: white;">
          <button onclick="document.getElementById('sidePanel').style.right='-400px'" style="background: rgba(255,255,255,0.12); border:1px solid rgba(255,255,255,0.15); padding:6px 12px; border-radius:8px; color:white; cursor:pointer; margin-bottom:14px; font-size: 0.8rem; font-weight: 700; transition: background 0.2s; font-family: inherit;">✕ Close</button>
          <h2 style="font-weight: 800; margin: 0; font-size:1.3rem;">${name}</h2>
        </div>
        <div style="padding: 20px; flex: 1; display:flex; flex-direction:column; gap: 20px;">
          <div>
            <h3 style="font-size:0.75rem; color:#94a3b8; text-transform:uppercase; font-weight:800; letter-spacing:0.04em; margin-bottom:6px;">Capacity</h3>
            <div style="display:flex; align-items:center; gap: 8px;">
              <div style="width:10px; height:10px; border-radius:50%; background-color:${color};"></div>
              <span style="font-weight:800; font-size:1.1rem; color:#111;">${availSlots} <span style="font-weight:500; font-size:0.9rem; color:#71717a;">/ ${totalSlots} available</span></span>
            </div>
          </div>

          <div>
            <h3 style="font-size:0.75rem; color:#94a3b8; text-transform:uppercase; font-weight:800; letter-spacing:0.04em; margin-bottom:6px;">Rate</h3>
            <div style="font-weight:800; font-size:1.2rem; color:#111;">₹${price}<span style="font-size:0.85rem; color:#71717a; font-weight:600;">/hr</span></div>
          </div>

          <div style="margin-top: auto; display:flex; flex-direction:column; gap: 10px;">
            <button onclick="window.bookSlot(${id})" style="width:100%; border-radius:10px; padding: 13px; font-size:0.95rem; font-weight:800; background:#1a1a1a; color:#fff; border:none; cursor:pointer; transition:all 0.2s; font-family:inherit;" onmouseover="this.style.background='#333'" onmouseout="this.style.background='#1a1a1a'" ${availSlots === 0 ? 'disabled' : ''}>${availSlots === 0 ? 'Lot Full' : 'Reserve Spot'}</button>
            <button onclick="window.startNavigation(${lat}, ${lng})" style="width:100%; border-radius:10px; padding: 13px; font-size:0.95rem; font-weight:700; background:#f4f4f5; color:#1a1a1a; border:none; cursor:pointer; transition:all 0.2s; font-family:inherit; display:flex; align-items:center; justify-content:center; gap:6px;" onmouseover="this.style.background='#e4e4e7'" onmouseout="this.style.background='#f4f4f5'">Navigate</button>
          </div>
        </div>
      </div>
    `;
    sidePanel.style.right = "0";
  };

  // ════════ MARKER RENDERING — IMPROVEMENTS 1, 3, 4 ════════
  const renderParkingMarker = (slot) => {
    // Map intelligence service parameters
    const { id, lat, lng, name, status, availableSlots, totalSlots, price, isBestMatch, isRecommended, etaText } = slot;
    const isSpecialMatch = isBestMatch || isRecommended;
    
    const color = getMarkerColor(availableSlots, totalSlots);

    // IMPROVEMENT 1 — Flat dot markers with subtle borders
    let customHtml, iconSize, iconAnchor;

    if (isSpecialMatch) {
      // IMPROVEMENT 3 — Slightly larger with subtle highlight
      customHtml = `
        <div class="recommended-marker">
          <div class="parking-dot" style="width:26px; height:26px; background-color:${color};"></div>
          <div class="rec-ring"></div>
          <div class="rec-badge">
            <svg width="8" height="8" viewBox="0 0 24 24" fill="white" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
          </div>
        </div>
      `;
      iconSize = [42, 42];
      iconAnchor = [21, 21];
    } else {
      customHtml = `<div class="parking-dot" style="width:20px; height:20px; background-color:${color};"></div>`;
      iconSize = [24, 24];
      iconAnchor = [12, 12];
    }

    const icon = L.divIcon({
      html: customHtml,
      className: '',
      iconSize: L.point(iconSize[0], iconSize[1]),
      iconAnchor: L.point(iconAnchor[0], iconAnchor[1])
    });

    const marker = L.marker([lat, lng], { icon });
    markerCluster.addLayer(marker);

    // 150m geofence radius
    const geofence = L.circle([lat, lng], {
      color: 'rgba(59,130,246,0.15)',
      fillColor: 'rgba(59,130,246,0.05)',
      fillOpacity: 0.05,
      weight: 1,
      radius: 150
    }).addTo(map);
    allMarkers.push(geofence);
    
    window.slotLayers[id] = { marker, circle: geofence };

    const isFull = status === "booked";
    let displayStatus = "Available";
    let badgeClassSuffix = "Available";
    if (status === "booked") { displayStatus = "Full"; badgeClassSuffix = "Full"; }
    else if (status === "limited") { displayStatus = "Limited"; badgeClassSuffix = "Limited"; }

    // Tooltip on hover
    marker.bindTooltip(`<div style="text-align:center;"><strong>${name}</strong><br/><span style="color:#71717a">${displayStatus} · ${availableSlots}/${totalSlots}</span></div>`, {
      direction: 'top', offset: [0, -16], opacity: 0.95
    });

    // ════════ POPUP CARD — IMPROVEMENT 4 ════════
    let labelBadge = '';
    if (slot.label) {
      labelBadge = `<span style="font-size: 0.7rem; font-weight: 800; background: #f3e8ff; color: #9333ea; padding: 3px 8px; border-radius: 6px; vertical-align: middle; margin-left: 6px; display: inline-block;">⭐ ${slot.label}</span>`;
    }

    const popupHtml = `
      <div class="popup-card">
        <div class="popup-name" style="display: flex; justify-content: space-between; align-items: center;">
          <span>${name}</span>
          ${labelBadge}
        </div>
        
        <div class="popup-info-row">
          <span class="popup-info-label"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg> Price</span>
          <span class="popup-info-value">₹${price}/hr</span>
        </div>
        
        <div class="popup-info-row">
          <span class="popup-info-label"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="3" width="15" height="13" rx="2"/><path d="m16 8 4-2v13l-4-2z"/></svg> Slots</span>
          <span class="popup-info-value">${availableSlots} <span style="font-weight:500; color:#a1a1aa;">/ ${totalSlots}</span></span>
        </div>
        
        <div class="popup-info-row">
          <span class="popup-info-label"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg> ETA</span>
          <span class="popup-info-value route-text" style="color: #3b82f6; font-size: 0.82rem;">${etaText || 'Calculating'}</span>
        </div>
        
        <div class="popup-actions">
          <button class="popup-btn popup-btn-primary" onclick="window.bookSlot(${id})" ${isFull ? 'disabled' : ''}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2z"/><path d="m9 12 2 2 4-4"/></svg>
            ${isFull ? 'Full' : 'Reserve'}
          </button>
          <button class="popup-btn popup-btn-secondary" onclick="window.startNavigation(${lat}, ${lng})">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>
            Navigate
          </button>
        </div>
      </div>
    `;

    marker.bindPopup(popupHtml, {
      minWidth: 260,
      maxWidth: 300,
      offset: [0, -4],
      autoPanPadding: [50, 50]
    });

    // Dynamically calculate distance when popup opens
    marker.on('popupopen', function(e) {
      const popupNode = e.popup.getElement();
      if (!popupNode) return;
      
      const routeTextNode = popupNode.querySelector('.route-text');
      if (routeTextNode && routeTextNode.innerText.includes("Calculating")) {
        const originLL = userMarkerObj ? userMarkerObj.getLatLng() : { lat: userLat, lng: userLng };
        const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${originLL.lng},${originLL.lat};${lng},${lat}?overview=false`;
        
        fetch(osrmUrl)
          .then(res => res.json())
          .then(data => {
            if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
              const distanceKm = (data.routes[0].distance / 1000).toFixed(1);
              const durationMins = Math.max(1, Math.round(data.routes[0].duration / 60));
              routeTextNode.innerHTML = `<strong>${distanceKm} km</strong> · ${durationMins} min`;
            } else {
              routeTextNode.innerText = "Unavailable";
            }
          })
          .catch(() => {
            routeTextNode.innerText = "N/A";
          });
      }

      // Refresh lucide icons in popup
      setTimeout(() => lucide.createIcons(), 50);
    });

    // IMPROVEMENT 9 — Smooth fly on marker click
    marker.on('click', function(e) {
      map.flyTo(e.latlng, 16, { animate: true, duration: 1.0 });
      openSidePanelDetail(id, name, lat, lng, totalSlots, availableSlots, price);
    });
  };

  // ════════ RE-RENDER MAP ════════
  const reRenderMap = async (lat, lon, isLive = false) => {
    markerCluster.clearLayers();
    allMarkers.forEach(m => map.removeLayer(m));
    allMarkers = [];
    if (userMarkerObj) map.removeLayer(userMarkerObj);

    const prefSelect = document.getElementById('smartPreference');
    const preference = prefSelect ? prefSelect.value : 'smart';

    try {
      const response = await fetch(`/api/parking/nearby?lat=${lat}&lng=${lon}&preference=${preference}&limit=50`);
      let nearby = await response.json();

      if (!Array.isArray(nearby)) {
          nearby = [];
      }

      nearby = window.mapFilters.applyActiveFilters(nearby, currentFilters);

      // Render markers
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
          distance: slot.distance,
          etaText: slot.etaText,
          isRecommended: slot.isBestMatch,
          isBestMatch: slot.isBestMatch,
          label: slot.label
        });
      });

      // ════════ HEATMAP — IMPROVEMENT 6 ════════
      if (heatLayerObj) map.removeLayer(heatLayerObj);
      if (isHeatmapActive) {
        const heatData = nearby.map(s => {
          const total = s.totalSlots || s.total_slots || 1;
          const avail = s.availableSlots || s.available_slots || 0;
          const bookings = s.bookings || (total - avail);
          const rawDemand = (bookings * 0.6) + ((total - avail) * 0.4);
          const normalizedScore = Math.max(0, Math.min(1, rawDemand / total));
          return [s.lat, s.lng, normalizedScore];
        });
        heatLayerObj = L.heatLayer(heatData, { 
          radius: 30, 
          blur: 25, 
          maxZoom: 16,
          gradient: {
            0.0: '#3b82f6',
            0.25: '#06b6d4',
            0.5: '#eab308',
            0.75: '#f97316',
            1.0: '#ef4444'
          }
        }).addTo(map);
        
        if (heatLayerObj._canvas) { heatLayerObj._canvas.style.opacity = '0.6'; }
      }

      // User marker
      userMarkerObj = L.marker([lat, lon], { icon: userIcon, zIndexOffset: 1000 }).addTo(map);
      
      // IMPROVEMENT 9 — Smooth fly animation
      map.flyTo([lat, lon], 14, { animate: true, duration: 1.2 });
      setTimeout(() => lucide.createIcons(), 50);
    } catch(err) {
        console.error("Failed to fetch smart nearby parking", err);
    }
  };

  // ════════ FETCH DATA ════════
  fetch('/api/slots')
    .then(response => response.json())
    .then(data => {
      allParkingData = data;

      // ════════ STATS BAR ════════
      const total       = data.length;
      const publicCount = data.filter(s => s.type === 'public').length;
      const resCount    = data.filter(s => s.type === 'residential').length;
      const statTotal   = document.getElementById('statTotal');
      const statPublic  = document.getElementById('statPublic');
      const statRes     = document.getElementById('statResidential');
      if (statTotal)  statTotal.textContent  = total;
      if (statPublic) statPublic.textContent  = publicCount;
      if (statRes)    statRes.textContent     = resCount;

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

  // ════════ FLOATING PANEL — IMPROVEMENT 2 ════════
  const toggleFindBtn = document.getElementById('toggleFindPanel');
  const findPanel = document.getElementById('findParkingPanel');
  const collapsePanelBtn = document.getElementById('collapsePanelBtn');

  if (toggleFindBtn && findPanel) {
    toggleFindBtn.addEventListener('click', () => {
      findPanel.classList.add('expanded');
      toggleFindBtn.style.display = 'none';
    });
    findPanel.classList.add('expanded'); 
  }

  if (collapsePanelBtn && findPanel) {
    collapsePanelBtn.addEventListener('click', () => {
      findPanel.classList.remove('expanded');
      if (toggleFindBtn) toggleFindBtn.style.display = 'flex';
    });
  }

  // Auto-collapse panel on map interaction (drag/zoom) — IMPROVEMENT 2
  map.on('movestart', () => {
    if (findPanel && findPanel.classList.contains('expanded')) {
      // Only collapse if user is actively interacting with map (not programmatic)
      // We check if mouse is down or touch is active
    }
  });

  // ════════ SEARCH & GPS — IMPROVEMENTS 2, 9 ════════
  const searchInput = document.getElementById('searchDestination');
  const searchBtn = document.getElementById('executeSearchMapBtn');
  const currentLocationBtn = document.querySelector('.current-location-btn');
  const gpsLocateBtn = document.getElementById('gpsLocateBtn');
  let searchMarker = null;

  // GPS Locate (top-right) — IMPROVEMENT 8
  const doGpsLocate = () => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const uLat = position.coords.latitude;
          const uLng = position.coords.longitude;
          document.getElementById('searchOrigin').value = "GPS Location";
          reRenderMap(uLat, uLng, true);
        },
        () => {
          alert("Location access denied. Using default.");
          reRenderMap(userLat, userLng, false);
        },
        { enableHighAccuracy: true, maximumAge: 10000 }
      );
    }
  };

  if (gpsLocateBtn) {
    gpsLocateBtn.addEventListener('click', doGpsLocate);
  }

  // Origin auto-detect button
  if (currentLocationBtn) {
    let watchId = null;

    currentLocationBtn.addEventListener('click', () => {
      if ("geolocation" in navigator) {
        document.getElementById('searchOrigin').value = "Locating...";
        
        watchId = navigator.geolocation.watchPosition(
          (position) => { 
            const uLat = position.coords.latitude;
            const uLng = position.coords.longitude;
            document.getElementById('searchOrigin').value = "Live GPS Active";
            reRenderMap(uLat, uLng, true); 

            // Geofence checking
            const sortedZones = window.geofenceUtils.sortZonesByDistance(allParkingData, uLat, uLng);
            
            sortedZones.forEach(slot => {
              const distanceKm = slot.distanceKm;

              const dNode = document.getElementById(`dist-ui-${slot.id}`);
              if (dNode) dNode.innerText = (distanceKm * 1000).toFixed(0);
              
              if (distanceKm <= 0.150 && !notifiedZones.has(slot.id)) {
                notifiedZones.add(slot.id);
                triggerSmartParkingAlert(slot, distanceKm);
                
                if (window.slotLayers[slot.id]) {
                  window.geofenceUtils.updateZoneStyle(window.slotLayers[slot.id].circle, true);
                  map.flyTo([slot.lat, slot.lng], 17, { animate: true, duration: 1.0 });
                  window.slotLayers[slot.id].marker.openPopup();
                }

              } else if (distanceKm > 0.165 && notifiedZones.has(slot.id)) {
                notifiedZones.delete(slot.id);
                if (window.slotLayers[slot.id]) {
                  window.geofenceUtils.updateZoneStyle(window.slotLayers[slot.id].circle, false);
                }
              }
            });
          },
          (err) => { 
            document.getElementById('searchOrigin').value = "";
            alert("Location access denied or unavailable."); 
            reRenderMap(userLat, userLng, false); 
          },
          { enableHighAccuracy: true, maximumAge: 10000 }
        );
      } else {
        alert("Geolocation not supported.");
      }
    });
  }

  // Smart Parking Alert
  function triggerSmartParkingAlert(slot, distance) {
    const overlayHtml = `
      <div id="smartAlertOverlay" style="position: fixed; top: 20px; left: 50%; transform: translateX(-50%); z-index: 9999; width: 90%; max-width: 380px; background: #fff; border-radius: 16px; box-shadow: 0 12px 40px rgba(0,0,0,0.15); border: 1px solid rgba(0,0,0,0.06); overflow: hidden; animation: slideDownAlert 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;">
        <div style="background: #1a1a1a; color: #fff; padding: 12px 16px; font-weight: 700; font-size: 0.85rem; display: flex; justify-content: space-between; align-items: center;">
          <span style="display:flex; align-items:center; gap:6px;"><i data-lucide="bell-ring" style="width:15px;"></i> Parking Zone Detected</span>
          <button onclick="document.getElementById('smartAlertOverlay').remove()" style="background:none; border:none; color:#fff; cursor:pointer; padding:2px;"><i data-lucide="x" style="width:16px;"></i></button>
        </div>
        <div style="padding: 14px 16px;">
          <h3 style="margin-bottom: 4px; font-weight: 800; font-size: 1.05rem; color: #111;">${slot.name}</h3>
          <p style="color: #71717a; font-size: 0.85rem; margin-bottom: 10px;">${(distance * 1000).toFixed(0)}m away</p>
          <div style="display: flex; gap: 8px; margin-bottom: 14px;">
            <div style="background: #dcfce7; color: #166534; padding: 4px 10px; border-radius: 99px; font-size: 0.75rem; font-weight: 700;">${slot.available_slots || slot.availableSlots}/${slot.total_slots || slot.totalSlots} Slots</div>
            <div style="background: #f4f4f5; color: #333; padding: 4px 10px; border-radius: 99px; font-size: 0.75rem; font-weight: 700;">₹${slot.price || 30}/hr</div>
          </div>
          <button style="width: 100%; background: #1a1a1a; color: #fff; border: none; border-radius: 10px; padding: 11px; font-weight: 700; font-size: 0.9rem; cursor: pointer; font-family: inherit;" onclick="window.location.href='book.html?slotId=${slot.id}'">Reserve Now</button>
        </div>
      </div>
      <style>@keyframes slideDownAlert { from { transform: translate(-50%, -100%); opacity: 0; } to { transform: translate(-50%, 0); opacity: 1; } }</style>
    `;
    
    const existing = document.getElementById('smartAlertOverlay');
    if (existing) existing.remove();
    document.body.insertAdjacentHTML('beforeend', overlayHtml);
    lucide.createIcons();

    setTimeout(() => {
      const el = document.getElementById('smartAlertOverlay');
      if (el) el.remove();
    }, 10000);
  }

  // Search execution
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
            if (searchMarker) map.removeLayer(searchMarker);
            reRenderMap(lat, lon, false);

            // Collapse panel after successful search — IMPROVEMENT 2
            if (findPanel) {
              findPanel.classList.remove('expanded');
              if (toggleFindBtn) toggleFindBtn.style.display = 'flex';
            }
          } else {
            alert("No results found.");
          }
        })
        .catch(err => {
          searchBtn.innerText = "Search";
          searchBtn.disabled = false;
          console.error(err);
        });
    };

    searchBtn.addEventListener('click', executeSearch);
    searchInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') executeSearch();
    });
  }

  // ════════ SATELLITE TOGGLE ════════
  const satelliteToggleBtn = document.getElementById('satelliteToggleBtn');
  if (satelliteToggleBtn) {
    satelliteToggleBtn.addEventListener('click', () => {
      isSatelliteActive = !isSatelliteActive;
      if (isSatelliteActive) {
        map.removeLayer(lightMap);
        satelliteMap.addTo(map);
        satelliteToggleBtn.classList.add('active');
        satelliteToggleBtn.innerHTML = '<i data-lucide="map" style="width:15px;"></i> Streets';
      } else {
        map.removeLayer(satelliteMap);
        lightMap.addTo(map);
        satelliteToggleBtn.classList.remove('active');
        satelliteToggleBtn.innerHTML = '<i data-lucide="satellite" style="width:15px;"></i> Satellite';
      }
      lucide.createIcons();
    });
  }

  // ════════ FILTER PANEL TOGGLE ════════
  const filterPanel       = document.getElementById('filterPanel');
  const toggleFilterBtn   = document.getElementById('toggleFilterPanel');
  const closeFilterBtn    = document.getElementById('closeFilterPanel');

  if (toggleFilterBtn && filterPanel) {
    toggleFilterBtn.addEventListener('click', () => {
      const isVisible = filterPanel.style.display !== 'none';
      filterPanel.style.display = isVisible ? 'none' : 'block';
      toggleFilterBtn.classList.toggle('active', !isVisible);
      lucide.createIcons();
    });
  }
  if (closeFilterBtn && filterPanel) {
    closeFilterBtn.addEventListener('click', () => {
      filterPanel.style.display = 'none';
      if (toggleFilterBtn) toggleFilterBtn.classList.remove('active');
    });
  }

  // ════════ INTELLIGENCE PREFERENCE OBSERVER ════════
  const prefSelect = document.getElementById('smartPreference');
  if (prefSelect) {
      prefSelect.addEventListener('change', () => {
          const uLat = userMarkerObj ? userMarkerObj.getLatLng().lat : userLat;
          const uLng = userMarkerObj ? userMarkerObj.getLatLng().lng : userLng;
          reRenderMap(uLat, uLng, false);
      });
  }

  // ════════ HEATMAP TOGGLE — IMPROVEMENT 7 ════════
  const toggleBtn = document.getElementById('toggleHeatmap');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      isHeatmapActive = !isHeatmapActive;
      toggleBtn.classList.toggle('active', isHeatmapActive);
      
      if (userMarkerObj) {
        reRenderMap(userMarkerObj.getLatLng().lat, userMarkerObj.getLatLng().lng, false);
      }
    });
  }

  // ════════ FILTER BINDINGS ════════
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

  // ════════ TOAST SYSTEM ════════
  window.showToast = function(title, message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let iconName = 'info';
    if (type === 'success') iconName = 'check-circle';
    if (type === 'error') iconName = 'alert-circle';

    toast.innerHTML = `
      <div class="toast-icon"><i data-lucide="${iconName}"></i></div>
      <div class="toast-content">
        <div class="toast-title">${title}</div>
        ${message ? `<div class="toast-msg">${message}</div>` : ''}
      </div>
    `;

    container.appendChild(toast);
    lucide.createIcons();

    // Trigger animation
    requestAnimationFrame(() => {
      toast.classList.add('toast-show');
    });

    // Auto remove
    setTimeout(() => {
      toast.classList.remove('toast-show');
      setTimeout(() => container.removeChild(toast), 300); // Wait for transition
    }, 3000);
  };

  // ════════ QR MODAL LOGIC ════════
  window.closeQrModal = function() {
    document.getElementById('qrModal').style.display = 'none';
  };

  // ════════ BOOKING LOGIC ════════
  window.bookSlot = async function (slotId) {
    const token = localStorage.getItem('token');
    const userStr = localStorage.getItem('user');

    if (!token || !userStr) {
      showToast("Authentication Required", "Please log in to reserve a parking spot.", "error");
      setTimeout(() => window.location.href = 'login.html', 1500);
      return;
    }

    let user;
    try {
      user = JSON.parse(userStr);
    } catch (e) {
      showToast("Session Expired", "Please log in again.", "error");
      setTimeout(() => window.location.href = 'login.html', 1500);
      return;
    }

    // Identify target slot coordinates for auto-routing
    const targetSlot = allParkingData.find(s => s.id === slotId);

    try {
      // Direct user to the new checkout sequence
      window.location.href = `payment.html?parkingId=${slotId}`;
    } catch (err) {
      console.error('Booking redirect error:', err);
      showToast("Routing Failed", err.message || "An error occurred.", "error");
    }
  };

  // ════════ AUTO-NAVIGATION ON LOAD ════════
  window.addEventListener('load', () => {
    const params = new URLSearchParams(window.location.search);
    const navLat = parseFloat(params.get('navLat'));
    const navLng = parseFloat(params.get('navLng'));
    
    // Clean URL silently
    if (navLat && navLng) {
      const cleanUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
      window.history.replaceState({path: cleanUrl}, '', cleanUrl);

      // We need to wait slightly for user location bounds to establish
      setTimeout(() => {
        window.startNavigation(navLat, navLng);
      }, 500); 
    }
  });

})();
