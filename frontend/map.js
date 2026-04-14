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

  // ════════ MARKER CLUSTER — Disabled for Clarity (Requirement 7) ════════
  const markerCluster = L.featureGroup();
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
  let lastBestSlot = null; // Track for Smart Assistant re-trigger
  let lastNearbyData = []; // Cache for filter recalculation
  const notifiedZones = new Set();
  window.slotLayers = {};

  // ════════ ACTIVE SESSION STATE ════════
  let isActiveSession = false;
  let currentSessionData = null;
  let arrivalTriggered = false;

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

  window.startNavigation = async (destLat, destLng, forceStartLat = null, forceStartLng = null) => {
    // 1. Clear any previous route
    clearRouteDisplay();
    if (globalRoutingControl) { map.removeControl(globalRoutingControl); globalRoutingControl = null; }

    let originLat = forceStartLat;
    let originLng = forceStartLng;
    if (!originLat || !originLng) {
        const originObj = userMarkerObj ? userMarkerObj.getLatLng() : { lat: userLat, lng: userLng };
        originLat = originObj.lat;
        originLng = originObj.lng;
    }
    const origin = { lat: originLat, lng: originLng };
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

      // 6. Fit map bounds to route with padding
      const routeBounds = L.latLngBounds(coords);
      map.fitBounds(routeBounds, { padding: [60, 60], animate: true, duration: 1.0 });

      // 7. Animate the route drawing
      animateRouteDrawing(coords, () => {
        // Bind Best Route Label to the polyline path at its center
        if (activeRouteLayer) {
           const midPoint = coords[Math.floor(coords.length / 2)];
           L.tooltip({ permanent: true, direction: 'center', className: 'best-route-tooltip' })
            .setLatLng(midPoint)
            .setContent('<div class="best-route-label">🚀 Best Route</div>')
            .addTo(map);
        }
        
        // Removed showRouteInfoBar call to keep UI clean and use Decision Card
      });

    } catch (err) {
      console.error('Navigation error:', err);
      panel.innerHTML = `<div class="route-info-bar"><div class="route-stat"><div class="route-stat-value" style="color:#ef4444;">Connection error</div></div></div>`;
    }
  };

  // Helper: Removed showRouteInfoBar completely (Requirement 1)
  function showRouteInfoBar(distKm, timeMins) {
    // Intentionally left blank - all metadata exists in Decision Card or Active Session Panel.
    if (isActiveSession) {
      document.getElementById('sessionEta').innerText = `${timeMins} min`;
      document.getElementById('sessionDist').innerText = `${distKm} km`;
    }
  }

  // Clear route — re-show decision card if available
  window.clearRoute = () => {
    clearRouteDisplay();
    // Also remove tooltips matching best-route-tooltip class
    document.querySelectorAll('.leaflet-tooltip.best-route-tooltip').forEach(el => el.remove());

    if (globalRoutingControl) {
      map.removeControl(globalRoutingControl);
      globalRoutingControl = null;
    }
    // Re-show decision card
    if (lastBestSlot) {
      showDecisionCard(lastBestSlot);
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
    let opacityValue = 1;

    // Requirement 5 & 6: Reduce marker sizing + Fade non-selected
    if (isSpecialMatch) {
      opacityValue = 1; 
      // Marker slightly scaled down compared to previous iteration for clutter reduction
      customHtml = `
        <div class="recommended-marker" style="z-index: 1000 !important; position: relative;">
          <div class="parking-dot" style="width:30px; height:30px; background-color:${color}; display:flex; align-items:center; justify-content:center; box-shadow: 0 0 16px 4px ${color};">
            <span style="font-size: 15px; line-height: 1; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));">⭐</span>
          </div>
          <div class="rec-ring" style="width: 44px; height: 44px; border-color: ${color}; top: -7px; left: -7px;"></div>
        </div>
      `;
      iconSize = [44, 44];
      iconAnchor = [22, 22];
    } else {
      opacityValue = 0.5; // Always fade non-best matches to reduce clutter
      customHtml = `<div class="parking-dot" style="width:16px; height:16px; background-color:${color}; opacity:${opacityValue}; border-width: 1px;"></div>`;
      iconSize = [18, 18];
      iconAnchor = [9, 9];
    }

    const icon = L.divIcon({
      html: customHtml,
      className: '',
      iconSize: L.point(iconSize[0], iconSize[1]),
      iconAnchor: L.point(iconAnchor[0], iconAnchor[1])
    });

    // Jitter coordination for overlapping markers (Requirement 4)
    // Add a tiny random offset if markers share exact lat/lng
    const jitter = 0.00005; 
    const finalLat = lat + (Math.random() - 0.5) * jitter;
    const finalLng = lng + (Math.random() - 0.5) * jitter;

    const marker = L.marker([finalLat, finalLng], { icon, zIndexOffset: isSpecialMatch ? 1000 : 0 });
    markerCluster.addLayer(marker);
    allMarkers.push(marker); // Ensure it's tracked for cleanup (Requirement 1 & 2)

    // Geofence circles removed for visual clarity (Requirement 7)
    window.slotLayers[id] = { marker };

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

  // ════════ DECISION CARD — Floating Best Parking Recommendation ════════
  const showDecisionCard = (bestSlot) => {
    lastBestSlot = bestSlot;
    let card = document.getElementById('decisionCard');
    if (!card) {
      card = document.createElement('div');
      card.id = 'decisionCard';
      document.querySelector('.map-ui-layer').appendChild(card);
    }

    const available = bestSlot.availableSlots || bestSlot.available_slots || 0;
    const totalSlots = bestSlot.totalSlots || bestSlot.total_slots || 1;
    const priceVal = bestSlot.price || 30;
    const eta = bestSlot.etaText || 'N/A';
    const labelText = bestSlot.label || 'Best Option (Smart)';
    const reasonText = bestSlot.reason || 'Recommended based on traffic and availability';
    const color = getMarkerColor(available, totalSlots);

    card.className = 'decision-card glass-panel';
    card.innerHTML = `
      <div class="dc-header">
        <div class="dc-badge">⭐ ${labelText}</div>
        <button class="dc-close" onclick="document.getElementById('decisionCard').classList.add('dc-hidden')" title="Dismiss">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="dc-name-wrap" style="padding: 10px 18px 0;">
        <div class="dc-name" style="padding:0; margin-bottom: 2px;">${bestSlot.name}</div>
        <div class="dc-reason" style="font-size: 0.72rem; color: #52525b; font-weight: 600; display:flex; align-items:center; gap: 4px;">
           <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2.5"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>
           ${reasonText}
        </div>
      </div>
      <div class="dc-stats" style="padding: 12px 18px;">
        <div class="dc-stat">
          <div class="dc-stat-value" style="color:#3b82f6;">${eta}</div>
          <div class="dc-stat-label">ETA</div>
        </div>
        <div class="dc-stat-divider"></div>
        <div class="dc-stat">
          <div class="dc-stat-value">₹${priceVal}<span style="font-size:0.7rem;color:#a1a1aa;">/hr</span></div>
          <div class="dc-stat-label">Price</div>
        </div>
        <div class="dc-stat-divider"></div>
        <div class="dc-stat">
          <div class="dc-stat-value" style="display:flex;align-items:center;gap:4px;">
            <span style="width:8px;height:8px;border-radius:50%;background:${color};display:inline-block;"></span>
            ${available}<span style="font-size:0.7rem;color:#a1a1aa;">/${totalSlots}</span>
          </div>
          <div class="dc-stat-label">Slots</div>
        </div>
      </div>
      
      <!-- CONFIDENCE INDICATOR -->
      <div class="dc-confidence" style="text-align:center; padding: 0 18px 10px; font-size: 0.65rem; color: #71717a; font-weight: 700; letter-spacing: 0.02em;">
         <i data-lucide="shield-check" style="width:10px; height:10px; vertical-align:text-bottom; color:#22c55e;"></i> Recommended based on live traffic & availability
      </div>

      <!-- DOMINANT CTA -->
      <div class="dc-actions" style="padding: 0 18px 16px; display:flex; gap: 8px;">
        <button class="dc-btn dc-btn-nav" id="dcNavigateBtn" style="flex:0.25; background:#f4f4f5; color:#1a1a1a;" title="Navigate Area">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>
        </button>
        <button class="dc-btn dc-btn-reserve" id="dcReserveBtn" style="flex:1; background: linear-gradient(135deg, #1a1a1a, #000); color: #fff; font-size: 0.95rem; justify-content: center; transform: none;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2z"/><path d="m9 12 2 2 4-4"/></svg>
          Reserve Spot
        </button>
      </div>
    `;

    card.classList.remove('dc-hidden');
    
    // Slight rendering delay for lucide
    setTimeout(() => lucide.createIcons({root: card}), 10);

    // Wire navigate button
    document.getElementById('dcNavigateBtn').onclick = (e) => {
      e.stopPropagation();
      const uPos = userMarkerObj ? userMarkerObj.getLatLng() : { lat: userLat, lng: userLng };
      map.flyTo([bestSlot.lat, bestSlot.lng], 16, { animate: true, duration: 1.0 });
      window.startNavigation(bestSlot.lat, bestSlot.lng, uPos.lat, uPos.lng);
      openSidePanelDetail(bestSlot.id, bestSlot.name, bestSlot.lat, bestSlot.lng, totalSlots, available, priceVal);
    };

    // Wire reserve button
    document.getElementById('dcReserveBtn').onclick = (e) => {
      e.stopPropagation();
      window.bookSlot(bestSlot.id);
    };
  };

  const hideDecisionCard = () => {
    const card = document.getElementById('decisionCard');
    if (card) card.classList.add('dc-hidden');
  };

  // ════════ RE-RENDER MAP ════════
  const reRenderMap = async (lat, lon, isLive = false) => {
    markerCluster.clearLayers();
    allMarkers.forEach(m => map.removeLayer(m));
    allMarkers = [];
    if (userMarkerObj) map.removeLayer(userMarkerObj);

    const prefSelect = document.getElementById('smartPreference');
    const vehicleSelect = document.getElementById('vehicleType');
    const preference = prefSelect.value;
    const vehicle = vehicleSelect ? vehicleSelect.value : 'car';

    try {
      const response = await fetch(`/api/parking/nearby?lat=${lat}&lng=${lon}&preference=${preference}&vehicle=${vehicle}&limit=50`);
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
          label: slot.label,
          reason: slot.reason
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
      
      // Cache for filter recalculation
      lastNearbyData = nearby;

      // Show Decision Card for the Best Match
      const bestSlot = nearby.find(s => s.isBestMatch);
      if (bestSlot) {
        showDecisionCard(bestSlot);
      } else {
        hideDecisionCard();
      }

      // IMPROVEMENT 9 — Smooth fly animation
      map.flyTo([lat, lon], 14, { animate: true, duration: 1.2 });
      setTimeout(() => lucide.createIcons(), 50);

      return nearby;
    } catch(err) {
        console.error("Failed to fetch smart nearby parking", err);
        return [];
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

            // Arrival logic for Active Session (Requirement 5)
            if (isActiveSession && !arrivalTriggered && currentSessionData) {
              const distToTarget = window.geofenceUtils.calculateDistance(uLat, uLng, currentSessionData.lat, currentSessionData.lng);
              if (distToTarget <= 0.050) { // 50 meters
                arrivalTriggered = true;
                const statusPill = document.querySelector('.session-status-pill');
                if (statusPill) {
                  statusPill.innerHTML = '<span class="pulse-dot"></span> Arrived';
                  statusPill.style.color = '#10b981';
                  statusPill.style.background = 'rgba(16, 185, 129, 0.1)';
                }
                
                // Toggle buttons
                document.getElementById('btnShowQR').style.display = 'none';
                document.getElementById('btnArrivedQR').style.display = 'flex';
                
                // Auto-show QR on arrival for convenience
                openQrModal();
              }
            }

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
                  map.flyTo([slot.lat, slot.lng], 17, { animate: true, duration: 1.0 });
                  window.slotLayers[slot.id].marker.openPopup();
                }

              } else if (distanceKm > 0.165 && notifiedZones.has(slot.id)) {
                notifiedZones.delete(slot.id);
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
            
            reRenderMap(lat, lon, false).then(nearby => {
               // Auto Route to Best Parking (Requirement 3)
               if (nearby && nearby.length > 0) {
                  const best = nearby.find(s => s.isBestMatch);
                  if (best) {
                     // Wait for fly animation, then draw route from USER to BEST
                     setTimeout(() => {
                        const uPos = userMarkerObj ? userMarkerObj.getLatLng() : { lat, lng: lon };
                        window.startNavigation(best.lat, best.lng, uPos.lat, uPos.lng);
                     }, 1500);
                  }
               }
            });

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
          clearRouteDisplay(); // Clear old route on preference change
          const uLat = userMarkerObj ? userMarkerObj.getLatLng().lat : userLat;
          const uLng = userMarkerObj ? userMarkerObj.getLatLng().lng : userLng;
          reRenderMap(uLat, uLng, false).then(nearby => {
            // Auto-route to new best after preference change
            if (nearby && nearby.length > 0) {
              const best = nearby.find(s => s.isBestMatch);
              if (best) {
                setTimeout(() => {
                  window.startNavigation(best.lat, best.lng, uLat, uLng);
                }, 1200);
              }
            }
          });
      });
  }

  const vehicleSelect = document.getElementById('vehicleType');
  if (vehicleSelect) {
      vehicleSelect.addEventListener('change', () => {
          clearRouteDisplay();
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

  // ════════ SMART ASSISTANT FAB (Requirement 6) ════════
  // Floating Action Button: one-tap to auto-trigger the full intelligent flow
  window.triggerSmartAssistant = () => {
    const fabButton = document.getElementById('smartAssistantFab');
    if (fabButton) {
       fabButton.innerHTML = '<i class="lucide-loader" style="width:20px; height:20px; animation: spin 1s linear infinite;"></i><style>@keyframes spin { 100% { transform: rotate(360deg); } }</style>';
       lucide.createIcons({root: fabButton});
    }

    const uPos = userMarkerObj ? userMarkerObj.getLatLng() : { lat: userLat, lng: userLng };

    // Clear previous route
    clearRouteDisplay();

    // Re-render at current user position with current preference
    reRenderMap(uPos.lat, uPos.lng, false).then(nearby => {
      // Revert loading icon
      if (fabButton) {
         fabButton.innerHTML = '<i data-lucide="sparkles" style="width:20px; height:20px;"></i>';
         lucide.createIcons({root: fabButton});
      }

      if (nearby && nearby.length > 0) {
        const best = nearby.find(s => s.isBestMatch);
        if (best) {
          // Chain: Zoom → Route → Side Panel
          setTimeout(() => {
            map.flyTo([best.lat, best.lng], 16, { animate: true, duration: 1.0 });
            window.startNavigation(best.lat, best.lng, uPos.lat, uPos.lng);
            // Details are inherently shown now through Decision Card 
          }, 600);
        }
      }

      // Collapse search panel
      if (findPanel) {
        findPanel.classList.remove('expanded');
        if (toggleFindBtn) toggleFindBtn.style.display = 'flex';
      }
    });
  };

  // ════════ ACTIVE SESSION CONTROL (Requirement 1 & 2) ════════
  const activateNavigationSession = () => {
    const qrData = sessionStorage.getItem('pendingQR');
    const slotName = sessionStorage.getItem('pendingSlotName');
    const validTill = sessionStorage.getItem('pendingValidTill');
    const dLat = parseFloat(sessionStorage.getItem('pendingSlotLat'));
    const dLng = parseFloat(sessionStorage.getItem('pendingSlotLng'));

    if (!qrData || !slotName || !dLat || !dLng) return;

    isActiveSession = true;
    currentSessionData = { lat: dLat, lng: dLng, name: slotName };
    arrivalTriggered = false;

    // 1. UI Switch: Hide Search mode, show session mode
    const searchPanel = document.getElementById('findParkingPanel');
    const toggleBtn = document.getElementById('toggleFindPanel');
    const fabButton = document.getElementById('smartAssistantFab');
    const filterBar = document.getElementById('filterBar');
    const sessionPanel = document.getElementById('activeSessionPanel');
    
    if (searchPanel) searchPanel.style.display = 'none';
    if (toggleBtn) toggleBtn.style.display = 'none';
    if (fabButton) fabButton.style.display = 'none';
    if (filterBar) filterBar.style.display = 'none';
    if (sessionPanel) {
      sessionPanel.style.display = 'flex';
      document.getElementById('sessionParkingName').innerText = slotName;
      document.getElementById('sessionPrice').innerText = 'Paid'; // Static for MVP
    }

    // 2. Clear previous states
    clearRouteDisplay();
    const dc = document.getElementById('decisionCard');
    if (dc) dc.classList.add('dc-hidden');

    // 3. Populate QR Modal
    document.getElementById('modalQrImage').src = `data:image/png;base64,${qrData}`;
    document.getElementById('modalSlotName').innerText = slotName;
    if (validTill) {
      const d = new Date(validTill);
      document.getElementById('modalValidTill').innerText = `Valid until ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }

    // 4. Force Start Navigation
    // Give map a moment to init if called on load
    setTimeout(() => {
      window.startNavigation(dLat, dLng, userLat, userLng);
      map.flyTo([dLat, dLng], 15, { animate: true, duration: 1.0 });
    }, 500);

    // 5. Confirmation Toast
    setTimeout(() => {
      // Use existing showToast if defined or fallback to alert
      if (typeof showToast === 'function') {
        showToast("Parking Reserved", "Navigation mode active.", "success");
      }
    }, 1000);
  };

  const openQrModal = () => {
    const overlay = document.getElementById('qrModalOverlay');
    if (overlay) overlay.style.display = 'flex';
  };

  const closeQrModal = () => {
    const overlay = document.getElementById('qrModalOverlay');
    if (overlay) overlay.style.display = 'none';
  };

  const cancelSession = () => {
    if (!confirm("Are you sure you want to cancel your parking session?")) return;
    
    // Clear session storage
    sessionStorage.removeItem('pendingQR');
    sessionStorage.removeItem('pendingSlotName');
    sessionStorage.removeItem('pendingSlotLat');
    sessionStorage.removeItem('pendingSlotLng');
    sessionStorage.removeItem('pendingValidTill');

    // Reset UI
    window.location.href = 'map.html';
  };

  // Wire Session UI Buttons
  const btnShowQR = document.getElementById('btnShowQR');
  const btnArrivedQR = document.getElementById('btnArrivedQR');
  const btnCloseQR = document.getElementById('btnCloseQR');
  const btnCancelSession = document.getElementById('btnCancelSession');
  const btnRecenter = document.getElementById('btnRecenterRoute');

  if (btnShowQR) btnShowQR.onclick = openQrModal;
  if (btnArrivedQR) btnArrivedQR.onclick = openQrModal;
  if (btnCloseQR) btnCloseQR.onclick = closeQrModal;
  if (btnCancelSession) btnCancelSession.onclick = cancelSession;
  if (btnRecenter) {
    btnRecenter.onclick = () => {
      if (currentSessionData) {
        map.flyTo([currentSessionData.lat, currentSessionData.lng], 16, { animate: true });
      }
    };
  }

  // ════════ BOOT DETECTION ════════
  window.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    if (sessionStorage.getItem('pendingQR') || urlParams.get('session') === 'active') {
      activateNavigationSession();
    }
  });

})();
