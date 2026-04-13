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
    document.getElementById('statBookings').textContent = stats.totalBookings || 0;
    document.getElementById('statActive').textContent = stats.activeBookingCount || 0;
    document.getElementById('statSpent').textContent = `₹${stats.totalSpent || 0}`;
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

    area.innerHTML = `
      <div class="active-booking-card">
        <div class="active-booking-info">
          <div class="active-badge">Active Session</div>
          <div class="active-parking-name">${booking.parkingName}</div>
          <div class="active-meta">
            <div class="active-meta-item"><i data-lucide="clock"></i> ${formatTime(booking.startTime)} – ${formatTime(booking.endTime)}</div>
            <div class="active-meta-item"><i data-lucide="calendar"></i> ${formatDate(booking.startTime)}</div>
          </div>
          <div class="countdown-wrap">
            <div>
              <div class="countdown-label">Time Remaining</div>
              <div class="countdown-time" id="countdownTimer">--:--:--</div>
            </div>
          </div>
          <div class="active-btns">
            ${booking.lat && booking.lng
              ? `<button class="btn-nav-go" onclick="window.location.href='map.html'"><i data-lucide="navigation"></i> Navigate</button>`
              : ''}
            <button class="btn-sec" onclick="window.location.href='map.html'"><i data-lucide="map"></i> View on Map</button>
          </div>
        </div>
        <div class="active-qr">
          <img src="${qrSrc}" alt="QR Entry Ticket">
          <p>Entry QR</p>
        </div>
      </div>`;

    lucide.createIcons();
    startCountdown(booking.endTime);
  }

  function startCountdown(endTimeISO) {
    if (countdownInterval) clearInterval(countdownInterval);
    const timerEl = document.getElementById('countdownTimer');
    if (!timerEl) return;

    const endMs = new Date(endTimeISO).getTime();

    function tick() {
      const now = Date.now();
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
      <tr>
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
    document.getElementById('ownerBookingsToday').textContent = data.bookingsToday || 0;
    document.getElementById('ownerActiveUsers').textContent = data.activeUsers || 0;
    document.getElementById('ownerTotalEarnings').textContent = `₹${data.earnings?.total || 0}`;
    document.getElementById('earnToday').textContent = `₹${data.earnings?.today || 0}`;
    document.getElementById('earnTotal').textContent = `₹${data.earnings?.total || 0}`;
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
        const body = {
          name: document.getElementById('apName').value,
          total_slots: parseInt(document.getElementById('apSlots').value),
          price_per_hour: parseFloat(document.getElementById('apPrice').value),
          lat: document.getElementById('apLat').value,
          lng: document.getElementById('apLng').value,
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
