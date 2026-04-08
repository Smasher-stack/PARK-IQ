// ─── QR Code Generation Service ──────────────────────────────────────────────
// Generates a base64-encoded PNG QR code string from booking data.

const QRCode = require('qrcode');

async function generateQR(bookingData) {
  const payload = [
    `Booking ID: ${bookingData.booking_id}`,
    `Parking: ${bookingData.parking_name}`,
    `In Time: ${bookingData.start_time}`,
    `Valid Till: ${bookingData.end_time}`,
  ].join('\n');

  // Returns a data URI string like "data:image/png;base64,..."
  const dataUri = await QRCode.toDataURL(payload, {
    width: 400,
    margin: 2,
    color: { dark: '#000000', light: '#ffffff' },
    errorCorrectionLevel: 'H',
  });

  // Strip the prefix so we return raw base64 (frontend already prepends it)
  const base64 = dataUri.replace(/^data:image\/png;base64,/, '');
  return base64;
}

module.exports = { generateQR };
