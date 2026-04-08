(function() {
    "use strict";
    lucide.createIcons();

    const urlParams = new URLSearchParams(window.location.search);
    const slotIdParam = urlParams.get('slotId');

    const loadingState = document.getElementById('loadingState');
    const contentState = document.getElementById('contentState');
    const errorState = document.getElementById('errorState');
    const errorMsg = document.getElementById('errorMsg');
    const successState = document.getElementById('successState');
    const qrCodeImg = document.getElementById('qrCodeImg');
    
    const slotNameEl = document.getElementById('slotName');
    const slotCoordsEl = document.getElementById('slotCoords');
    const slotIdDisplay = document.getElementById('slotIdDisplay');
    const slotStatusEl = document.getElementById('slotStatus');
    const slotStatusText = document.getElementById('slotStatusText');
    const slotAvailability = document.getElementById('slotAvailability');
    const confirmBtn = document.getElementById('confirmBtn');

    if (!slotIdParam) {
        showError("Invalid booking request. Missing Slot ID.");
        return;
    }

    const slotId = parseInt(slotIdParam, 10);

    // Fetch slot data
    fetch('/api/slots')
        .then(res => {
            if (!res.ok) throw new Error("Failed to connect to backend");
            return res.json();
        })
        .then(data => {
            const slot = data.find(s => s.id === slotId);
            if (!slot) {
                showError("Slot not found or no longer exists.");
                return;
            }
            renderSlot(slot);
        })
        .catch(err => {
            console.error(err);
            showError("Could not load slot data. Please try again.");
        });

    function showError(msg) {
        loadingState.style.display = 'none';
        contentState.style.display = 'none';
        errorState.style.display = 'block';
        confirmBtn.style.display = 'none';
        errorMsg.innerText = msg;
    }

    function renderSlot(slot) {
        loadingState.style.display = 'none';
        contentState.style.display = 'block';

        slotNameEl.innerText = slot.name || `Parking Zone ${slot.id}`;
        slotCoordsEl.innerText = `${slot.lat.toFixed(4)}, ${slot.lng.toFixed(4)}`;
        slotIdDisplay.innerText = `#${slot.id}`;
        
        slotAvailability.innerText = `${slot.availableSlots} / ${slot.totalSlots} slots open`;

        if (slot.status === 'booked') {
            slotStatusEl.className = 'status-badge booked';
            slotStatusEl.innerHTML = '<i data-lucide="x-circle" style="width:14px;height:14px;"></i> <span>Booked</span>';
            confirmBtn.innerText = 'Slot Unavailable';
            confirmBtn.disabled = true;
        } else if (slot.status === 'limited') {
            slotStatusEl.className = 'status-badge limited';
            slotStatusEl.innerHTML = '<span class="status-dot" style="background:#854d0e;"></span> <span>Limited</span>';
            confirmBtn.innerText = 'Confirm Booking';
            confirmBtn.disabled = false;
        } else {
            slotStatusEl.className = 'status-badge';
            slotStatusEl.innerHTML = '<span class="status-dot"></span> <span>Available</span>';
            confirmBtn.innerText = 'Confirm Booking';
            confirmBtn.disabled = false;
        }
        
        lucide.createIcons();
    }

    confirmBtn.addEventListener('click', () => {
        confirmBtn.disabled = true;
        confirmBtn.innerText = 'Processing...';

        const token = localStorage.getItem('token');

        fetch('/api/book', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': token ? `Bearer ${token}` : ''
            },
            body: JSON.stringify({ id: slotId })
        })
        .then(res => res.json().then(data => ({ status: res.status, body: data })))
        .then(result => {
            if (result.status === 401 || result.status === 403) {
                alert("You must be logged in to reserve a parking spot.");
                window.location.href = `login.html?redirect=book.html?slotId=${slotId}`;
                return;
            }

            if (result.status === 200 && result.body.success) {
                // Hide main content block and confirm button
                contentState.style.display = 'none';
                document.querySelector('.bottom-action').style.display = 'none';
                document.querySelector('.booking-header').style.display = 'none';
                
                const bParams = result.body.booking;
                const qrDataUri = `data:image/png;base64,${result.body.qr}`;
                if (bParams) {
                    document.getElementById('tkBookingId').innerText = bParams.booking_id;
                    document.getElementById('tkParkingName').innerText = bParams.parking_name;
                    document.getElementById('tkInTime').innerText = bParams.in_time;
                    document.getElementById('tkValidTill').innerText = bParams.valid_till;

                    // Generate downloadable ticket using HTML5 Canvas
                    const canvas = document.createElement('canvas');
                    canvas.width = 600;
                    canvas.height = 750;
                    const ctx = canvas.getContext('2d');
                    
                    // Box background
                    ctx.fillStyle = '#ffffff';
                    ctx.fillRect(0, 0, 600, 750);
                    
                    // Draw Header
                    ctx.fillStyle = '#1a1a1a';
                    ctx.font = 'bold 32px "Nunito Sans", sans-serif';
                    ctx.fillText(bParams.parking_name, 40, 60);
                    
                    // Draw Line boundary
                    ctx.strokeStyle = '#e8e8e8';
                    ctx.beginPath();
                    ctx.moveTo(40, 90);
                    ctx.lineTo(560, 90);
                    ctx.stroke();
                    
                    // Draw Attributes
                    const drawRow = (y, label, val, valColor) => {
                        ctx.textAlign = 'left';
                        ctx.fillStyle = '#666666';
                        ctx.font = '24px "Nunito Sans", sans-serif';
                        ctx.fillText(label, 40, y);
                        
                        ctx.fillStyle = valColor || '#1a1a1a';
                        ctx.textAlign = 'right';
                        ctx.font = 'bold 24px "Nunito Sans", sans-serif';
                        ctx.fillText(val, 560, y);
                    };

                    drawRow(150, 'Booking ID:', bParams.booking_id);
                    drawRow(210, 'Access valid from:', bParams.in_time);
                    drawRow(270, 'Valid until:', bParams.valid_till, '#ef4444');
                    
                    // Load and attach QR Image
                    const img = new Image();
                    img.onload = () => {
                        ctx.drawImage(img, 150, 350, 300, 300);
                        document.getElementById('downloadQrBtn').href = canvas.toDataURL('image/png');
                    };
                    img.src = qrDataUri;
                } else {
                    document.getElementById('downloadQrBtn').href = qrDataUri;
                }
                
                qrCodeImg.src = qrDataUri;
                successState.style.display = 'block';
                lucide.createIcons();
            } else {
                throw new Error(result.body.error || "Booking failed");
            }
        })
        .catch(err => {
            console.error(err);
            alert(`Error: ${err.message}`);
            confirmBtn.disabled = false;
            confirmBtn.innerText = 'Confirm Booking';
        });
    });

})();
