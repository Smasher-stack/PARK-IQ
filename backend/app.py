import base64
import qrcode
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from PIL import Image, ImageDraw, ImageFont
from datetime import datetime, timedelta
import json
import io
import os

app = Flask(__name__, static_folder='.', static_url_path='')
CORS(app)

DATA_FILE = 'data.json'

def load_data():
    if not os.path.exists(DATA_FILE):
        return []
    with open(DATA_FILE, 'r') as f:
        return json.load(f)

def save_data(data):
    with open(DATA_FILE, 'w') as f:
        json.dump(data, f, indent=2)
@app.route('/')
def index():
    return send_from_directory(app.static_folder, 'map.html')

@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory(app.static_folder, path)

@app.route('/api/slots', methods=['GET'])
def get_slots():
    return jsonify(load_data())

@app.route('/api/book', methods=['POST'])
def book_slot():
    req_data = request.json

    if not req_data or 'id' not in req_data:
        return jsonify({"error": "Missing id"}), 400

    try:
        slot_id = int(req_data.get('id'))
    except ValueError:
        return jsonify({"error": "Invalid id format"}), 400

    slots = load_data()
    slot = next((s for s in slots if s['id'] == slot_id), None)

    if not slot:
        return jsonify({"error": "Slot not found"}), 404

    if slot['status'] == 'booked':
        return jsonify({"error": "Already booked"}), 400

    # Update slot
    slot['status'] = 'booked'

    if slot.get('availableSlots', 0) > 0:
        slot['availableSlots'] -= 1

    # Generate Booking details
    import time
    booking_id = f"BK{int(time.time())}"
    parking_name = str(slot.get('name', f"Slot {slot['id']}"))
    in_time_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    valid_till_str = (datetime.now() + timedelta(hours=2)).strftime("%Y-%m-%d %H:%M:%S")

    slot['booking'] = {
        "booking_id": booking_id,
        "parking_name": parking_name,
        "in_time": in_time_str,
        "valid_till": valid_till_str
    }
    
    save_data(slots)

    qr_data = f"Booking ID: {booking_id}\nParking: {parking_name}\nIn Time: {in_time_str}\nValid Till: {valid_till_str}"

    qr_obj = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_H,
        box_size=15,
        border=3,
    )
    qr_obj.add_data(qr_data)
    qr_obj.make(fit=True)
    
    qr_img = qr_obj.make_image(fill_color="black", back_color="white")

    buffer = io.BytesIO()
    qr_img.save(buffer, format="PNG")

    qr_b64 = base64.b64encode(buffer.getvalue()).decode('utf-8')

    return jsonify({
        "message": "Booking confirmed",
        "qr": qr_b64,
        "success": True, 
        "slot": slot,
        "booking": slot['booking']
    }), 200


# -------------------------
# Run Server
# -------------------------
if __name__ == '__main__':
    app.run(debug=True, port=5000)