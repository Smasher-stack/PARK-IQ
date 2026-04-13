(function () {
    'use strict';
  
    lucide.createIcons();
    
    // ════════ VALIDATION ════════
    const qrData = sessionStorage.getItem('pendingQR');
    const slotName = sessionStorage.getItem('pendingSlotName');
    const validTill = sessionStorage.getItem('pendingValidTill');
    const destLat = sessionStorage.getItem('pendingSlotLat');
    const destLng = sessionStorage.getItem('pendingSlotLng');
  
    if (!qrData || !slotName) {
      // Direct access without booking
      window.location.href = 'dashboard.html';
      return;
    }
  
    // ════════ INJECT DATA ════════
    document.getElementById('qrImage').src = `data:image/png;base64,${qrData}`;
    document.getElementById('lblSlotName').textContent = slotName;
  
    if (validTill) {
      const d = new Date(validTill);
      const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      document.getElementById('lblValid').textContent = `Valid until ${timeStr}`;
    }
  
    // ════════ NAVIGATION ACTION ════════
    const navBtn = document.getElementById('navBtn');
    navBtn.addEventListener('click', () => {
      // Clear session so reloading this page doesn't keep showing it
      sessionStorage.removeItem('pendingQR');
      sessionStorage.removeItem('pendingSlotName');
      sessionStorage.removeItem('pendingValidTill');
      sessionStorage.removeItem('pendingSlotLat');
      sessionStorage.removeItem('pendingSlotLng');
  
      // Redirect to map with routing instructions
      if (destLat && destLng) {
        window.location.href = `map.html?navLat=${destLat}&navLng=${destLng}`;
      } else {
        window.location.href = 'map.html';
      }
    });

})();
