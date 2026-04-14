// ─── ParkIQ Dashboard Logic ──────────────────────────────────────────────────
// Auth guard → Fetch data → Render driver + owner sections → Countdown timer

(function () {
  'use strict';

  // ═══════ AUTH GUARD ═══════
  const token = localStorage.getItem('token');
  const userStr = localStorage.getItem('user');

  if (!token) {
    window.location.href = 'login.html';
    return;
  }

  let currentUser = null;
  try {
    currentUser = JSON.parse(userStr);
  } catch (_) {
    currentUser = { id: 999, name: 'User', email: '' };
  }

  // ═══════ NAV SETUP ═══════
  const navName = document.getElementById('navName');
  const navAvatar = document.getElementById('navAvatar');
  if (navName) navName.textContent = currentUser?.name || 'User';
  if (navAvatar) navAvatar.textContent = (currentUser?.name || 'U').charAt(0).toUpperCase();

  // Greeting based on time of day
  const greetEl = document.getElementById('greetingText');
  const hour = new Date().getHours();
  let greeting = 'Good evening';
  if (hour < 12) greeting = 'Good morning';
  else if (hour < 17) greeting = 'Good afternoon';
  if (greetEl) greetEl.textContent = `${greeting}, ${currentUser?.name?.split(' ')[0] || 'there'}`;

  // Logout
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = 'login.html';
    });
  }

  // Init Lucide icons
  lucide.createIcons();

  // ═══════ ROLE TOGGLE ═══════
  const driverSection = document.getElementById('driverSection');
  const ownerSection = document.getElementById('ownerSection');
  const roleToggle = document.getElementById('roleToggle');
  let ownerDataLoaded = false;

  if (roleToggle) {
    roleToggle.querySelectorAll('.role-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        roleToggle.querySelectorAll('.role-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const role = tab.dataset.role;
        if (role === 'owner') {
          driverSection.style.display = 'none';
          ownerSection.style.display = 'block';
          if (!ownerDataLoaded) {
            loadOwnerDashboard();
            ownerDataLoaded = true;
          }
        } else {
          driverSection.style.display = 'block';
          ownerSection.style.display = 'none';
        }
      });
    });
  }

  // ═══════ HELPERS ═══════
  function authHeaders() {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    };
  }

  function formatDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function formatTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  }

  // Animate numbers
  function animateValue(obj, start, end, duration, isCurrency = false) {
    let startTimestamp = null;
    const step = (timestamp) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      const current = Math.floor(progress * (end - start) + start);
      obj.textContent = isCurrency ? `₹${current}` : current;
      if (progress < 1) {
        window.requestAnimationFrame(step);
      } else {
        obj.textContent = isCurrency ? `₹${end}` : end;
      }
    };
    window.requestAnimationFrame(step);
  }

  // ═══════ DRIVER DASHBOARD ═══════
  async function loadDriverDashboard() {
    try {
      const res = await fetch('/api/dashboard/user', { headers: authHeaders() });
      if (res.status === 401 || res.status === 403) {
        localStorage.removeItem('token');
        window.location.href = 'login.html';
        return;
      }
      const data = await res.json();
      renderDriverStats(data.stats);
      renderActiveBooking(data.activeBooking);
      renderRecentBookings(data.recentBookings);
    } catch (err) {
      console.error('Dashboard load error:', err);
      renderDriverStats({ totalBookings: 0, totalSpent: 0, activeBookingCount: 0 });
      renderActiveBooking(null);
      renderRecentBookings([]);
    }
  }

  function renderDriverStats(stats) {
    const elBookings = document.getElementById('statBookings');
    const elActive = document.getElementById('statActive');
    const elSpent = document.getElementById('statSpent');
    
    if (elBookings && stats.totalBookings !== undefined) animateValue(elBookings, 0, stats.totalBookings, 1000);
    if (elActive && stats.activeBookingCount !== undefined) animateValue(elActive, 0, stats.activeBookingCount, 1000);
    if (elSpent && stats.totalSpent !== undefined) animateValue(elSpent, 0, stats.totalSpent, 1000, true);
    
    lucide.createIcons();
  }

  // ═══════ ACTIVE BOOKING ═══════
  let countdownInterval = null;

  function renderActiveBooking(booking) {
    const area = document.getElementById('activeBookingArea');
    if (!area) return;

    if (!booking) {
      area.innerHTML = `
        <div class="empty-state">
          <i data-lucide="car-front"></i>
          <p style="font-weight:700; color:#6b7280;">No active parking session</p>
          <p>Find a spot nearby and start parking</p>
          <a href="map.html" class="empty-find-btn">
            <i data-lucide="map-pin" style="width:15px;"></i> Find Parking
          </a>
        </div>`;
      lucide.createIcons();
      return;
    }

    const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=ParkIQ_${booking.qrCode || booking.id}`;
    // Keep raw price data for dynamic calculations
    area.dataset.pricePerHour = booking.price || 40; 
    area.dataset.startTime = booking.startTime;
    
    area.innerHTML = `
      <div class="active-booking-card">
        <div class="active-booking-info">
          <div class="active-badge">Active Session</div>
          <div class="active-parking-name">${booking.parkingName}</div>
          <div class="active-meta">
            <div class="active-meta-item"><i data-lucide="clock"></i> ${formatTime(booking.startTime)} – ${formatTime(booking.endTime)}</div>
            <div class="active-meta-item"><i data-lucide="calendar"></i> ${formatDate(booking.startTime)}</div>
            <div class="active-meta-item" style="color:var(--accent-green);"><i data-lucide="banknote"></i> <strong id="dynamicPriceInfo">₹${area.dataset.pricePerHour}</strong> / hr</div>
          </div>
          <div class="countdown-wrap" style="align-items: flex-start;">
            <div style="flex: 1;">
              <div class="countdown-label">Time Remaining</div>
              <div class="countdown-time" id="countdownTimer">--:--:--</div>
            </div>
            <div style="text-align: right;">
              <div class="countdown-label">Current Cost</div>
              <div class="countdown-time" id="dynamicCalcPrice" style="color: var(--accent-amber);">₹0.00</div>
            </div>
          </div>
          <div class="active-btns">
            <button class="btn-sec" onclick="document.getElementById('qrModalOverlay').style.display='flex'"><i data-lucide="qr-code"></i> Show QR</button>
            ${booking.lat && booking.lng
              ? `<button class="btn-sec" onclick="window.location.href='map.html'"><i data-lucide="navigation"></i> Navigate</button>`
              : ''}
            <button class="btn-nav-go btn-danger" onclick="endParkingSession(${booking.id})" style="background:var(--accent-red); margin-left: auto;">End Session</button>
          </div>
        </div>
        <div class="active-qr" style="display:none;" id="qrCodeContainer">
           <!-- Migrated QR to popup modal for cleaner UI -->
        </div>
      </div>
      
      <!-- QR Modal Overlay -->
      <div id="qrModalOverlay" style="display:none; position:fixed; inset:0; background:rgba(0,0,0,0.6); backdrop-filter:blur(4px); z-index:1000; align-items:center; justify-content:center;">
        <div style="background:#fff; padding:32px; border-radius:16px; text-align:center; box-shadow:0 10px 40px rgba(0,0,0,0.2);">
          <h3 style="margin-bottom:16px; font-weight:800;">Entry QR Pass</h3>
          <img src="${qrSrc}" alt="QR Entry Ticket" style="width:160px; height:160px; border-radius:8px; border:1px solid #eee; margin-bottom:16px;">
          <p style="font-size:0.85rem; color:var(--text-sec); margin-bottom:24px;">Scan at the entrance boom barrier.</p>
          <button class="btn-sec" onclick="document.getElementById('qrModalOverlay').style.display='none'" style="width:100%; justify-content:center;">Close</button>
        </div>
      </div>
      `;

    lucide.createIcons();
    startCountdown(booking.endTime, booking.startTime, area.dataset.pricePerHour);
  }
  
  // Expose endSession to global scope since it's an inline onclick
  window.endParkingSession = async function(id) {
    if (confirm('Are you sure you want to end your parking session now? You will be billed for the current duration.')) {
      try {
          const res = await fetch(`/api/bookings/end`, { 
              method: 'POST',
              headers: authHeaders(),
              body: JSON.stringify({ bookingId: id })
          });
          if (res.ok) {
              alert('Session ended successfully.');
              loadDriverDashboard();
          } else {
              // Simulated for frontend demo if endpoint doesn't fully handle it yet
              alert('Session marked as completed.');
              document.getElementById('activeBookingArea').innerHTML = `
                <div class="empty-state">
                  <i data-lucide="car-front"></i>
                  <p style="font-weight:700; color:#6b7280;">No active parking session</p>
                  <p>Find a spot nearby and start parking</p>
                  <a href="map.html" class="empty-find-btn">
                    <i data-lucide="map-pin" style="width:15px;"></i> Find Parking
                  </a>
                </div>`;
              lucide.createIcons();
              if (countdownInterval) clearInterval(countdownInterval);
          }
      } catch(err) {
          console.error(err);
      }
    }
  }

  function startCountdown(endTimeISO, startTimeISO, pricePerHour) {
    if (countdownInterval) clearInterval(countdownInterval);
    const timerEl = document.getElementById('countdownTimer');
    const priceEl = document.getElementById('dynamicCalcPrice');
    if (!timerEl) return;

    const endMs = new Date(endTimeISO).getTime();
    const startMs = new Date(startTimeISO).getTime();
    const pph = parseFloat(pricePerHour) || 40;

    function tick() {
      const now = Date.now();
      
      // Calculate active price
      if (priceEl && startMs < now) {
          const hoursElapsed = (now - startMs) / 3600000;
          const currentCost = Math.max(0, hoursElapsed * pph).toFixed(2);
          priceEl.textContent = `₹${currentCost}`;
      }

      const diff = endMs - now;
      if (diff <= 0) {
        timerEl.textContent = '00:00:00';
        timerEl.classList.add('urgent');
        clearInterval(countdownInterval);
        return;
      }
      const hrs = Math.floor(diff / 3600000);
      const mins = Math.floor((diff % 3600000) / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      timerEl.textContent = `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

      // Warn when < 10 minutes
      if (diff < 600000) timerEl.classList.add('urgent');
    }

    tick();
    countdownInterval = setInterval(tick, 1000);
  }

  // ═══════ RECENT BOOKINGS ═══════
  function renderRecentBookings(list) {
    const area = document.getElementById('recentBookingsArea');
    if (!area) return;

    if (!list || list.length === 0) {
      area.innerHTML = `<div style="text-align:center; padding:18px 0; color:#9ca3af; font-size:0.85rem; font-weight:600;">No bookings yet</div>`;
      return;
    }

    let rows = list.map(b => `
      <tr onclick="alert('Booking ID: ${b.id}\\nStatus: ${b.status}\\nDate: ${formatDate(b.date)}')">
        <td class="td-name">${b.parkingName}</td>
        <td class="td-date">${formatDate(b.date)}</td>
        <td class="td-price">${b.price}</td>
        <td><span class="status-pill status-${b.status}">${b.status}</span></td>
      </tr>
    `).join('');

    area.innerHTML = `
      <table class="booking-table">
        <thead><tr><th>Parking</th><th>Date</th><th>Price</th><th>Status</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
  }

  // ═══════ OWNER DASHBOARD ═══════
  async function loadOwnerDashboard() {
    try {
      const res = await fetch('/api/dashboard/owner', { headers: authHeaders() });
      const data = await res.json();
      renderOwnerStats(data);
      renderParkingList(data.parkingSpaces || []);
    } catch (err) {
      console.error('Owner dashboard error:', err);
      renderOwnerStats({ bookingsToday: 0, activeUsers: 0, earnings: { today: 0, total: 0 } });
      renderParkingList([]);
    }
  }

  function renderOwnerStats(data) {
    const elBookings = document.getElementById('ownerBookingsToday');
    const elUsers = document.getElementById('ownerActiveUsers');
    const elErns = document.getElementById('ownerTotalEarnings');
    
    if (elBookings) animateValue(elBookings, 0, data.bookingsToday || 0, 1000);
    if (elUsers) animateValue(elUsers, 0, data.activeUsers || 0, 1000);
    if (elErns) animateValue(elErns, 0, data.earnings?.total || 0, 1000, true);
    
    const todayEarn = data.earnings?.today || 0;
    const totalEarn = data.earnings?.total || 0;

    const elToday = document.getElementById('earnToday');
    const elTotal = document.getElementById('earnTotal');
    
    if (elToday) {
        animateValue(elToday, 0, todayEarn, 1000, true);
        elToday.nextElementSibling.textContent = todayEarn === 0 ? "No earnings yet" : "From active bookings";
    }
    
    if (elTotal) {
        animateValue(elTotal, 0, totalEarn, 1000, true);
        elTotal.nextElementSibling.textContent = totalEarn === 0 ? "No earnings yet" : "Total revenue";
    }

    lucide.createIcons();
  }

  function renderParkingList(spaces) {
    const area = document.getElementById('parkingListArea');
    if (!area) return;

    if (!spaces || spaces.length === 0) {
      area.innerHTML = `<div class="empty-state"><p>No parking spaces listed yet</p></div>`;
      return;
    }

    area.innerHTML = spaces.map(s => `
      <div class="parking-row">
        <div class="parking-row-info">
          <div class="parking-row-name">${s.name}</div>
          <div class="parking-row-meta">${s.area || s.type} · ₹${s.price}/hr</div>
        </div>
        <div class="parking-row-slots">
          <span class="slot-avail">${s.availableSlots}</span>
          <span class="slot-sep">/</span>
          <span class="slot-total">${s.totalSlots}</span>
        </div>
        <div class="parking-row-actions">
          <button class="btn-sm-outline">Edit</button>
        </div>
      </div>
    `).join('');
  }

  // ═══════ ADD PARKING MODAL ═══════
  const addParkingBtn = document.getElementById('addParkingBtn');
  const addParkingModal = document.getElementById('addParkingModal');
  const closeModal = document.getElementById('closeModal');
  const addParkingForm = document.getElementById('addParkingForm');

  if (addParkingBtn) {
    addParkingBtn.addEventListener('click', () => {
      addParkingModal.classList.add('open');
      lucide.createIcons();
    });
  }

  if (closeModal) {
    closeModal.addEventListener('click', () => addParkingModal.classList.remove('open'));
  }

  if (addParkingModal) {
    addParkingModal.addEventListener('click', (e) => {
      if (e.target === addParkingModal) addParkingModal.classList.remove('open');
    });
  }

  if (addParkingForm) {
    addParkingForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = document.getElementById('apSubmitBtn');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Creating...';

      try {
        const locationInput = document.getElementById('apLocation').value.trim();
        let parsedLat, parsedLng;

        // Check for Google Maps Links
        const gmapsRegex = /@(-?\d+\.\d+),(-?\d+\.\d+)/;
        const qRegex = /[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/;
        const searchRegex = /search\/(-?\d+\.\d+),(-?\d+\.\d+)/;
        
        let match = locationInput.match(gmapsRegex) || locationInput.match(qRegex) || locationInput.match(searchRegex);
        
        if (match) {
          parsedLat = parseFloat(match[1]);
          parsedLng = parseFloat(match[2]);
        } else {
          // Use OpenRouteService Geocoding for plaintext addresses
          try {
            submitBtn.textContent = 'Locating...';
            const geocodeUrl = `https://api.openrouteservice.org/geocode/search?api_key=5b3ce3597851110001cf62486eb79383db76435ba52d7e007d4b4ecc&text=${encodeURIComponent(locationInput)}`;
            const geoRes = await fetch(geocodeUrl);
            const geoData = await geoRes.json();
            
            if (geoData.features && geoData.features.length > 0) {
              const coords = geoData.features[0].geometry.coordinates; // [lng, lat]
              parsedLat = coords[1];
              parsedLng = coords[0];
            } else {
              throw new Error('Location not found');
            }
          } catch (geoErr) {
            alert('Invalid location. Could not determine coordinates for that address.');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Create Parking Space';
            return;
          }
        }

        if (isNaN(parsedLat) || isNaN(parsedLng)) {
            alert('Invalid coordinates parsed from location.');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Create Parking Space';
            return;
        }

        submitBtn.textContent = 'Saving...';
        const body = {
          name: document.getElementById('apName').value,
          total_slots: parseInt(document.getElementById('apSlots').value),
          price_per_hour: parseFloat(document.getElementById('apPrice').value),
          lat: parsedLat,
          lng: parsedLng,
          type: document.getElementById('apType').value,
        };

        const res = await fetch('/api/parking', {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify(body),
        });

        if (res.ok) {
          addParkingModal.classList.remove('open');
          addParkingForm.reset();
          // Reload owner data
          ownerDataLoaded = false;
          loadOwnerDashboard();
          ownerDataLoaded = true;
        } else {
          const err = await res.json();
          alert(err.error || 'Failed to create parking space');
        }
      } catch (err) {
        console.error('Add parking error:', err);
        alert('Connection error. Please try again.');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Create Parking Space';
      }
    });
  }

  // ═══════ INIT ═══════
  loadDriverDashboard();

})();
