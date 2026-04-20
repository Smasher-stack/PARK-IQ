from flask import Flask, request, jsonify
from flask_cors import CORS
import requests

app = Flask(__name__)
CORS(app)

AI_SERVER = "http://127.0.0.1:5000"

@app.route("/")
def home():
    return "ParkIQ Chatbot Running"


@app.route("/chat", methods=["POST"])
def chat():

    data = request.get_json()
    message = data["message"].lower()

    if "hello" in message or "hi" in message:
        reply = "👋 Hello! I am ParkIQ AI Assistant."

    elif "parking" in message or "slots" in message:

        payload = {
            "hour":9,
            "day":1,
            "month":4,
            "occupancy":0.6,
            "traffic":"medium",
            "capacity":30
        }

        try:
            r = requests.post(AI_SERVER + "/api/predict-availability", json=payload)
            result = r.json()

            reply = f"🚗 Predicted available slots: {result['predicted_available_slots']}"

        except:
            reply = "⚠️ AI prediction server not running."

    else:
        reply = "I can help with parking availability and recommendations."

    return jsonify({"reply": reply})


if __name__ == "__main__":
    app.run(port=5002, debug=True)