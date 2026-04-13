(function () {
    'use strict';
  
    // ════════ TOAST SYSTEM ════════
    function showToast(title, message, type = 'info') {
      const container = document.getElementById('toastContainer');
      const toast = document.createElement('div');
      toast.className = `toast toast-${type}`;
      
      let iconName = 'info';
      if (type === 'error') iconName = 'alert-circle';
      else if (type === 'success') iconName = 'check-circle';
  
      toast.innerHTML = `
        <i data-lucide="${iconName}"></i>
        <div class="toast-content">
          <div>${title}</div>
          ${message ? `<div style="font-size:0.8rem; font-weight:600; color:var(--text-sec); margin-top:2px;">${message}</div>` : ''}
        </div>
      `;
      container.appendChild(toast);
      lucide.createIcons();
  
      requestAnimationFrame(() => toast.classList.add('show'));
      setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => container.removeChild(toast), 300);
      }, 3000);
    }
  
    lucide.createIcons();
  
    // ════════ AUTH SECURITY ════════
    const token = localStorage.getItem('token');
    const userStr = localStorage.getItem('user');
    
    if (!token || !userStr) {
      window.location.href = 'login.html';
      return;
    }
    
    let user;
    try {
      user = JSON.parse(userStr);
    } catch (_) {
      window.location.href = 'login.html';
      return;
    }
  
    // ════════ ON LOAD: FETCH SLOT DATA ════════
    const urlParams = new URLSearchParams(window.location.search);
    const parkingId = urlParams.get('parkingId');
  
    if (!parkingId) {
      showToast("Error", "No parking space selected.", "error");
      setTimeout(() => window.location.href = 'map.html', 1500);
      return;
    }
  
    async function loadParkingDetails() {
      try {
        const res = await fetch(`/api/parking/${parkingId}`);
        if (!res.ok) throw new Error("Could not fetch slot details.");
        
        const slot = await res.json();
        const pricePerHour = slot.price || 30;
        const total = pricePerHour * 2; // 2 hour duration fixed for MVP
        
        document.getElementById('lblLocation').textContent = slot.name || `Slot #${slot.id}`;
        document.getElementById('lblRate').textContent = `₹${pricePerHour}`;
        document.getElementById('lblTotal').textContent = `₹${total}`;
  
      } catch (err) {
        console.error(err);
        showToast("Network Error", "Unable to load parking info.", "error");
        document.getElementById('payBtn').disabled = true;
      }
    }
  
    loadParkingDetails();
  
    // ════════ PAYMENT & BOOKING LOGIC ════════
    const payBtn = document.getElementById('payBtn');
    
    payBtn.addEventListener('click', async () => {
      // 1. UI Loading State
      payBtn.disabled = true;
      document.getElementById('payText').textContent = 'Processing Payment...';
      document.getElementById('payIcon').style.display = 'none';
      document.getElementById('payLoader').style.display = 'block';
  
      try {
        // 2. Simulate Payment Delay (1 second)
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // 3. Call Backend Booking API
        const response = await fetch('/api/book', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            id: parkingId,
            user_id: user.id
          })
        });
  
        const data = await response.json();
  
        if (!response.ok) {
          throw new Error(data.error || 'Booking execution failed.');
        }
  
        // 4. Success — Transfer Payload to SessionStorage and Redirect
        sessionStorage.setItem('pendingQR', data.qr);
        sessionStorage.setItem('pendingSlotName', data.slot.name);
        sessionStorage.setItem('pendingSlotLat', data.slot.lat);
        sessionStorage.setItem('pendingSlotLng', data.slot.lng);
        sessionStorage.setItem('pendingValidTill', data.booking.valid_till);
  
        showToast("Payment Successful", "Redirecting to your entry pass...", "success");
        
        // Slight delay to read the toast
        setTimeout(() => {
          window.location.href = 'qr.html';
        }, 1200);
  
      } catch (err) {
        console.error(err);
        showToast("Payment Failed", err.message, "error");
        
        // Reset UI
        payBtn.disabled = false;
        document.getElementById('payText').textContent = 'Pay & Reserve';
        document.getElementById('payIcon').style.display = 'block';
        document.getElementById('payLoader').style.display = 'none';
      }
    });
  
  })();
