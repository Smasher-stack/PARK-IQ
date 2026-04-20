from flask import Flask, request, jsonify
from dotenv import load_dotenv
import os

from ai_module import (
    generate_synthetic_bookings,
    engineer_features,
    ParkingAvailabilityPredictor,
    ParkingRecommender,
    DemandHeatmapGenerator,
    GeofencingEngine
)

load_dotenv()

app = Flask(__name__)

# -----------------------------------
# HOME ROUTE (Fixes "Not Found")
# -----------------------------------

@app.route("/")
def home():
    return "🚗 ParkIQ AI Server Running Successfully"


print("Initializing AI models...")

df_raw = generate_synthetic_bookings(3000)
df_feat = engineer_features(df_raw)

availability_model = ParkingAvailabilityPredictor()
availability_model.train(df_feat, epochs=50, verbose=False)

recommender = ParkingRecommender()
recommender.train(df_raw, epochs=50, verbose=False)

heatmap_gen = DemandHeatmapGenerator()
heatmap_gen.fit(df_raw)

geo_engine = GeofencingEngine(heatmap_gen)

print("AI models ready.")

# -----------------------------------
# Predict parking availability
# -----------------------------------

@app.route("/api/predict-availability", methods=["POST"])
def predict_availability():

    data = request.json

    result = availability_model.predict(
        current_hour=data["hour"],
        day_of_week=data["day"],
        month=data["month"],
        occupancy_ratio=data["occupancy"],
        traffic_level=data["traffic"],
        capacity=data["capacity"]
    )

    return jsonify({"predicted_available_slots": result})


# -----------------------------------
# Recommend parking
# -----------------------------------

@app.route("/api/recommend-slots", methods=["POST"])
def recommend_slots():

    slots = request.json["slots"]

    ranked = recommender.rank_slots(slots)

    return jsonify({"recommended": ranked})


# -----------------------------------
# Heatmap API
# -----------------------------------

@app.route("/api/heatmap", methods=["GET"])
def heatmap():

    data = heatmap_gen.get_heatmap_data()

    return jsonify({"points": data})


# -----------------------------------
# Geofence Check
# -----------------------------------

@app.route("/api/geofence-check", methods=["POST"])
def geofence():

    data = request.json

    result = geo_engine.check(
        user_lat=data["lat"],
        user_lng=data["lng"]
    )

    return jsonify(result)


if __name__ == "__main__":
    port = int(os.getenv("PORT", 5000))
    app.run(port=port, debug=True)