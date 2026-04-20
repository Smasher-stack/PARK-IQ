"""
==============================================================
  ParkIQ — AI Module
  Developer Role: AI Engineer
  Covers:
    1. Synthetic Dataset Generation (what to get from teammates)
    2. Feature Engineering
    3. Neural Network — Predictive Parking Availability (Stage 4)
    4. Neural Network — AI Recommendation Engine (Stage 3)
    5. Demand Heatmap Generator (Stage 9)
    6. Geofencing Zone Detection logic (Stage 2)
    7. API-ready inference functions for backend integration
==============================================================
"""

import numpy as np
import pandas as pd
from sklearn.preprocessing import MinMaxScaler, LabelEncoder
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_absolute_error, accuracy_score
import warnings
warnings.filterwarnings("ignore")

# ─────────────────────────────────────────────────────────────
# SECTION 0: WHAT DATA YOU NEED FROM TEAMMATES
# ─────────────────────────────────────────────────────────────
"""
DATA NEEDED FROM TEAM (Backend / Database team):
─────────────────────────────────────────────────
Table 1: bookings
  - booking_id, user_id, slot_id, location_id
  - start_time (datetime), end_time (datetime)
  - vehicle_type (car/bike/ev)
  - price_paid (float)
  - status (completed/cancelled)

Table 2: parking_slots
  - slot_id, location_id, lat, lng
  - type (public/residential)
  - capacity (int)
  - price_per_hour (float)

Table 3: locations
  - location_id, name, lat, lng
  - zone_type (commercial/residential/transit)

Table 4: live_availability  (from backend real-time API)
  - slot_id, available_count, timestamp

DATA FROM FRONTEND/GPS TEAM:
─────────────────────────────
- user_lat, user_lng at time of search
- user_vehicle_type
- search_timestamp

NOTE: If these tables don't exist yet, use the
synthetic generator below (Section 1) to simulate them.
"""

# ─────────────────────────────────────────────────────────────
# SECTION 1: SYNTHETIC DATA GENERATOR
# (Use this until real DB data is provided by teammates)
# ─────────────────────────────────────────────────────────────

def generate_synthetic_bookings(n=5000, seed=42):
    """
    Generates realistic synthetic booking history.
    Replace with real data from the DB when available.
    """
    np.random.seed(seed)
    location_ids = [f"LOC_{i:03d}" for i in range(1, 21)]
    vehicle_types = ["car", "bike", "ev"]
    
    data = []
    for _ in range(n):
        loc = np.random.choice(location_ids)
        hour = int(np.random.choice(
            np.arange(0, 24),
            p=_hour_demand_distribution()
        ))
        day_of_week = np.random.randint(0, 7)
        occupied = _simulate_occupancy(hour, day_of_week)
        capacity = np.random.choice([10, 20, 30, 50])
        
        data.append({
            "location_id": loc,
            "hour": hour,
            "day_of_week": day_of_week,        # 0=Mon, 6=Sun
            "month": np.random.randint(1, 13),
            "vehicle_type": np.random.choice(vehicle_types, p=[0.65, 0.25, 0.10]),
            "capacity": capacity,
            "occupied_slots": min(int(occupied * capacity), capacity),
            "available_slots": max(0, capacity - int(occupied * capacity)),
            "price_per_hour": round(np.random.choice([10, 20, 30, 50, 80]), 1),
            "distance_from_user_km": round(np.random.uniform(0.1, 5.0), 2),
            "traffic_level": np.random.choice(["low", "medium", "high"],
                                               p=[0.3, 0.5, 0.2]),
            "is_residential": np.random.choice([0, 1], p=[0.7, 0.3]),
            "lat": round(13.0827 + np.random.uniform(-0.05, 0.05), 6),  # Chennai
            "lng": round(80.2707 + np.random.uniform(-0.05, 0.05), 6),
        })
    
    return pd.DataFrame(data)


def _hour_demand_distribution():
    """Models real urban parking demand — peaks at 9am and 6pm."""
    weights = np.array([
        0.5, 0.3, 0.2, 0.1, 0.2, 0.5,   # 0–5 am
        1.5, 3.0, 5.0, 4.5, 3.0, 3.5,   # 6–11 am
        4.5, 3.5, 3.0, 3.0, 4.5, 6.0,   # 12–5 pm
        5.5, 3.5, 2.5, 2.0, 1.5, 1.0    # 6–11 pm
    ], dtype=float)
    return weights / weights.sum()


def _simulate_occupancy(hour, day_of_week):
    """Returns occupancy fraction based on time and day."""
    base = 0.3
    if 8 <= hour <= 10: base += 0.45
    elif 17 <= hour <= 19: base += 0.50
    elif 12 <= hour <= 14: base += 0.30
    elif 0 <= hour <= 5: base -= 0.20
    if day_of_week < 5: base += 0.15   # weekday boost
    return min(max(base + np.random.uniform(-0.1, 0.1), 0.0), 1.0)


# ─────────────────────────────────────────────────────────────
# SECTION 2: FEATURE ENGINEERING
# ─────────────────────────────────────────────────────────────

def engineer_features(df):
    """
    Transforms raw booking data into ML-ready features.
    Both models (availability + recommendation) use these.
    """
    df = df.copy()
    
    # Time-based cyclical encoding (so 23:00 and 0:00 are close)
    df["hour_sin"] = np.sin(2 * np.pi * df["hour"] / 24)
    df["hour_cos"] = np.cos(2 * np.pi * df["hour"] / 24)
    df["day_sin"]  = np.sin(2 * np.pi * df["day_of_week"] / 7)
    df["day_cos"]  = np.cos(2 * np.pi * df["day_of_week"] / 7)
    df["month_sin"] = np.sin(2 * np.pi * df["month"] / 12)
    df["month_cos"] = np.cos(2 * np.pi * df["month"] / 12)
    
    # Demand ratio
    df["occupancy_ratio"] = df["occupied_slots"] / df["capacity"]
    
    # Traffic encoding
    traffic_map = {"low": 0, "medium": 1, "high": 2}
    df["traffic_enc"] = df["traffic_level"].map(traffic_map)
    
    # Vehicle type encoding
    vehicle_map = {"bike": 0, "car": 1, "ev": 2}
    df["vehicle_enc"] = df["vehicle_type"].map(vehicle_map)
    
    # Price normalised
    df["price_norm"] = df["price_per_hour"] / df["price_per_hour"].max()
    
    # Distance score (closer = higher score)
    df["distance_score"] = 1 / (1 + df["distance_from_user_km"])
    
    return df


# ─────────────────────────────────────────────────────────────
# SECTION 3: NEURAL NETWORK — AVAILABILITY PREDICTION
# Stage 4: Predicts available slots 20 min into the future
# ─────────────────────────────────────────────────────────────

class ParkingAvailabilityPredictor:
    """
    Feed-forward neural network to predict:
      available_slots_in_20_minutes
    
    Input features:
      hour_sin, hour_cos, day_sin, day_cos, month_sin, month_cos,
      occupancy_ratio, traffic_enc, capacity
    
    Output: predicted available slot count (regression)
    """
    
    FEATURES = [
        "hour_sin", "hour_cos",
        "day_sin",  "day_cos",
        "month_sin", "month_cos",
        "occupancy_ratio",
        "traffic_enc",
        "capacity"
    ]
    
    def __init__(self):
        self.scaler = MinMaxScaler()
        self.weights = {}
        self.biases  = {}
        self.is_fitted = False
    
    # ── Network Architecture ──────────────────────────────
    # Input(9) → Dense(64, ReLU) → Dense(32, ReLU) → Dense(16, ReLU) → Output(1)
    
    def _init_weights(self, layer_sizes):
        """Xavier initialisation for stable training."""
        np.random.seed(0)
        self.weights, self.biases = {}, {}
        for i in range(len(layer_sizes) - 1):
            fan_in, fan_out = layer_sizes[i], layer_sizes[i + 1]
            limit = np.sqrt(6.0 / (fan_in + fan_out))
            self.weights[i] = np.random.uniform(-limit, limit, (fan_in, fan_out))
            self.biases[i]  = np.zeros((1, fan_out))
    
    @staticmethod
    def _relu(x):        return np.maximum(0, x)
    @staticmethod
    def _relu_grad(x):   return (x > 0).astype(float)
    
    def _forward(self, X):
        cache = {"A0": X}
        n_layers = len(self.weights)
        for i in range(n_layers - 1):
            Z = cache[f"A{i}"] @ self.weights[i] + self.biases[i]
            cache[f"Z{i+1}"] = Z
            cache[f"A{i+1}"] = self._relu(Z)
        # Last layer — linear (regression)
        i = n_layers - 1
        Z = cache[f"A{i}"] @ self.weights[i] + self.biases[i]
        cache[f"Z{n_layers}"] = Z
        cache[f"A{n_layers}"] = Z   # linear activation
        return cache
    
    def _backward(self, cache, y, lr=0.001):
        m = y.shape[0]
        n_layers = len(self.weights)
        grads_w, grads_b = {}, {}
        
        # Output layer gradient (MSE)
        dA = 2 * (cache[f"A{n_layers}"] - y.reshape(-1, 1)) / m
        
        for i in reversed(range(n_layers)):
            if i == n_layers - 1:
                dZ = dA
            else:
                dZ = dA * self._relu_grad(cache[f"Z{i+1}"])
            grads_w[i] = cache[f"A{i}"].T @ dZ
            grads_b[i] = dZ.sum(axis=0, keepdims=True)
            dA = dZ @ self.weights[i].T
        
        # Update
        for i in range(n_layers):
            self.weights[i] -= lr * grads_w[i]
            self.biases[i]  -= lr * grads_b[i]
    
    def train(self, df_engineered, epochs=200, batch_size=64, lr=0.001, verbose=True):
        df = engineer_features(df_engineered) if "hour_sin" not in df_engineered.columns else df_engineered
        X = df[self.FEATURES].values.astype(float)
        y = df["available_slots"].values.astype(float)
        
        X = self.scaler.fit_transform(X)
        X_train, X_val, y_train, y_val = train_test_split(X, y, test_size=0.2, random_state=42)
        
        self._init_weights([9, 64, 32, 16, 1])
        
        for epoch in range(epochs):
            # Mini-batch SGD
            indices = np.random.permutation(len(X_train))
            for start in range(0, len(X_train), batch_size):
                idx = indices[start:start + batch_size]
                cache = self._forward(X_train[idx])
                self._backward(cache, y_train[idx], lr=lr)
            
            if verbose and (epoch + 1) % 50 == 0:
                cache = self._forward(X_val)
                preds = cache[f"A{len(self.weights)}"].flatten()
                mae = mean_absolute_error(y_val, np.round(np.clip(preds, 0, None)))
                print(f"  Epoch {epoch+1:3d}/{epochs} | Validation MAE: {mae:.2f} slots")
        
        self.is_fitted = True
        print("[OK] Availability predictor trained.")
    
    def predict(self, current_hour, day_of_week, month, occupancy_ratio,
                traffic_level, capacity):
        """
        Returns: predicted available slots 20 minutes from now.
        
        Called from backend API endpoint:
          GET /api/ai/predict-availability?slot_id=...&current_hour=...
        """
        traffic_map = {"low": 0, "medium": 1, "high": 2}
        row = np.array([[
            np.sin(2 * np.pi * current_hour / 24),
            np.cos(2 * np.pi * current_hour / 24),
            np.sin(2 * np.pi * day_of_week / 7),
            np.cos(2 * np.pi * day_of_week / 7),
            np.sin(2 * np.pi * month / 12),
            np.cos(2 * np.pi * month / 12),
            occupancy_ratio,
            traffic_map.get(traffic_level, 1),
            capacity
        ]])
        row_scaled = self.scaler.transform(row)
        cache = self._forward(row_scaled)
        pred = cache[f"A{len(self.weights)}"].flatten()[0]
        return max(0, int(round(pred)))


# ─────────────────────────────────────────────────────────────
# SECTION 4: NEURAL NETWORK — RECOMMENDATION ENGINE
# Stage 3: Ranks nearby parking options for a user
# ─────────────────────────────────────────────────────────────

class ParkingRecommender:
    """
    Neural network that ranks parking slots.
    Outputs a score 0–1 (higher = better recommendation).
    
    Inputs per slot candidate:
      distance_score, price_norm, occupancy_ratio,
      traffic_enc, is_residential, vehicle_enc,
      hour_sin, hour_cos, day_sin, day_cos
    
    Output: recommendation_score (0–1)
    """
    
    FEATURES = [
        "distance_score", "price_norm", "occupancy_ratio",
        "traffic_enc", "is_residential", "vehicle_enc",
        "hour_sin", "hour_cos", "day_sin", "day_cos"
    ]
    
    def __init__(self):
        self.scaler = MinMaxScaler()
        self.weights = {}
        self.biases  = {}
        self.is_fitted = False
    
    @staticmethod
    def _sigmoid(x): return 1 / (1 + np.exp(-np.clip(x, -500, 500)))
    @staticmethod
    def _relu(x):    return np.maximum(0, x)
    
    def _forward_rec(self, X):
        """Architecture: Input(10) → Dense(32, ReLU) → Dense(16, ReLU) → Output(1, Sigmoid)"""
        A = X
        for i in range(len(self.weights) - 1):
            Z = A @ self.weights[i] + self.biases[i]
            A = self._relu(Z)
        Z = A @ self.weights[len(self.weights)-1] + self.biases[len(self.weights)-1]
        return self._sigmoid(Z)
    
    def _create_training_labels(self, df):
        """
        Creates proxy labels:
        A slot is "recommended" (1) if:
          - available_slots > 2
          - distance < 1km
          - traffic is not high
          - price is below median
        """
        median_price = df["price_per_hour"].median()
        label = (
            (df["available_slots"] > 2) &
            (df["distance_from_user_km"] < 1.0) &
            (df["traffic_level"] != "high") &
            (df["price_per_hour"] <= median_price)
        ).astype(int)
        return label.values
    
    def train(self, df_raw, epochs=150, lr=0.005, verbose=True):
        df = engineer_features(df_raw)
        X = df[self.FEATURES].values.astype(float)
        y = self._create_training_labels(df_raw)
        
        X = self.scaler.fit_transform(X)
        X_train, X_val, y_train, y_val = train_test_split(X, y, test_size=0.2, random_state=42)
        
        # Init weights
        np.random.seed(1)
        sizes = [10, 32, 16, 1]
        self.weights, self.biases = {}, {}
        for i in range(len(sizes) - 1):
            limit = np.sqrt(6 / (sizes[i] + sizes[i+1]))
            self.weights[i] = np.random.uniform(-limit, limit, (sizes[i], sizes[i+1]))
            self.biases[i]  = np.zeros((1, sizes[i+1]))
        
        for epoch in range(epochs):
            # Forward pass with cache
            activations = [X_train]
            pre_acts = []
            A = X_train
            n_layers = len(self.weights)
            for i in range(n_layers):
                Z = A @ self.weights[i] + self.biases[i]
                pre_acts.append(Z)
                if i < n_layers - 1:
                    A = self._relu(Z)
                else:
                    A = self._sigmoid(Z)
                activations.append(A)
            
            # Binary cross-entropy gradient at output
            dA = (activations[-1] - y_train.reshape(-1, 1)) / len(X_train)
            
            # Backprop through all layers
            for i in reversed(range(n_layers)):
                if i == n_layers - 1:
                    dZ = dA  # sigmoid layer: dL/dZ = dL/dA (since sigmoid' cancels for BCE)
                else:
                    dZ = dA * (pre_acts[i] > 0).astype(float)
                dW = activations[i].T @ dZ
                db = dZ.sum(axis=0, keepdims=True)
                dA = dZ @ self.weights[i].T
                self.weights[i] -= lr * dW
                self.biases[i]  -= lr * db
            
            if verbose and (epoch + 1) % 50 == 0:
                val_preds = (self._forward_rec(X_val) > 0.5).astype(int).flatten()
                acc = accuracy_score(y_val, val_preds)
                print(f"  Epoch {epoch+1:3d}/{epochs} | Validation Accuracy: {acc:.2%}")
        
        self.is_fitted = True
        print("[OK] Recommendation engine trained.")
    
    def rank_slots(self, slot_candidates: list) -> list:
        """
        Input: list of dicts, each representing a parking slot.
        Output: same list sorted best → worst with 'score' added.
        
        Each dict should have keys matching FEATURES.
        Called from backend:
          POST /api/ai/recommend-slots
          Body: { "slots": [...], "user_vehicle": "car" }
        """
        if not slot_candidates:
            return []
        
        df = pd.DataFrame(slot_candidates)
        df = engineer_features(df)
        X = df[self.FEATURES].values.astype(float)
        X_scaled = self.scaler.transform(X)
        scores = self._forward_rec(X_scaled).flatten()
        
        for i, slot in enumerate(slot_candidates):
            slot["recommendation_score"] = round(float(scores[i]), 4)
        
        return sorted(slot_candidates, key=lambda x: x["recommendation_score"], reverse=True)


# ─────────────────────────────────────────────────────────────
# SECTION 5: DEMAND HEATMAP GENERATOR
# Stage 9: Produces lat/lng demand data for frontend heatmap
# ─────────────────────────────────────────────────────────────

class DemandHeatmapGenerator:
    """
    Aggregates booking history into a demand intensity grid.
    Output fed to frontend (Leaflet.js / Google Maps heatmap layer).
    
    Output format:
      [ { "lat": 13.08, "lng": 80.27, "weight": 0.85 }, ... ]
    """
    
    def __init__(self, grid_resolution=0.005):
        """grid_resolution in degrees (≈ 500m)"""
        self.resolution = grid_resolution
        self.demand_grid = None
    
    def fit(self, df_bookings):
        """Build demand grid from historical bookings."""
        df = df_bookings.copy()
        
        # Snap coordinates to grid
        df["lat_grid"] = (df["lat"] / self.resolution).round() * self.resolution
        df["lng_grid"] = (df["lng"] / self.resolution).round() * self.resolution
        
        # Count bookings per grid cell
        demand = (
            df.groupby(["lat_grid", "lng_grid"])
            .size()
            .reset_index(name="booking_count")
        )
        
        # Normalize to 0–1 weight
        max_count = demand["booking_count"].max()
        demand["weight"] = demand["booking_count"] / max_count
        
        self.demand_grid = demand
        print(f"[OK] Heatmap fitted: {len(demand)} grid cells.")
        return self
    
    def get_heatmap_data(self, min_weight=0.1):
        """
        Returns heatmap-ready list for the frontend.
        Filter out low-demand cells with min_weight.
        
        Sent to frontend via:
          GET /api/ai/heatmap-data
          Response: { "points": [...] }
        """
        if self.demand_grid is None:
            raise ValueError("Call fit() before get_heatmap_data()")
        
        filtered = self.demand_grid[self.demand_grid["weight"] >= min_weight]
        return filtered.rename(columns={
            "lat_grid": "lat",
            "lng_grid": "lng"
        })[["lat", "lng", "weight"]].to_dict(orient="records")
    
    def get_peak_zones(self, top_n=5):
        """Returns the top N highest demand zones (for alerts/geofencing)."""
        if self.demand_grid is None:
            raise ValueError("Call fit() first.")
        return (
            self.demand_grid
            .nlargest(top_n, "weight")
            .rename(columns={"lat_grid": "lat", "lng_grid": "lng"})
            [["lat", "lng", "weight"]]
            .to_dict(orient="records")
        )


# ─────────────────────────────────────────────────────────────
# SECTION 6: GEOFENCING ENGINE
# Stage 2: Detects if user entered a high-demand zone
# ─────────────────────────────────────────────────────────────

class GeofencingEngine:
    """
    Checks if a user's GPS coordinate falls within a
    high-demand parking zone (defined by heatmap peaks).
    
    Triggered by:
      POST /api/ai/geofence-check
      Body: { "user_lat": ..., "user_lng": ... }
    """
    
    def __init__(self, heatmap_generator: DemandHeatmapGenerator,
                 radius_km=0.15, demand_threshold=0.7):
        self.heatmap = heatmap_generator
        self.radius_km = radius_km
        self.demand_threshold = demand_threshold
        self.zones = heatmap_generator.get_peak_zones(top_n=20)
    
    @staticmethod
    def _haversine_km(lat1, lng1, lat2, lng2):
        """Distance between two GPS coordinates in km."""
        R = 6371
        dlat = np.radians(lat2 - lat1)
        dlng = np.radians(lng2 - lng1)
        a = (np.sin(dlat / 2) ** 2 +
             np.cos(np.radians(lat1)) * np.cos(np.radians(lat2)) *
             np.sin(dlng / 2) ** 2)
        return R * 2 * np.arctan2(np.sqrt(a), np.sqrt(1 - a))
    
    def check(self, user_lat, user_lng):
        """
        Returns a dict with:
          - in_high_demand_zone (bool)
          - nearest_zone_distance_m (float)
          - available_slots_nearby (int) ← from live DB (teammate provides this)
          - alert_message (str)
        """
        for zone in self.zones:
            dist = self._haversine_km(user_lat, user_lng, zone["lat"], zone["lng"])
            if dist <= self.radius_km and zone["weight"] >= self.demand_threshold:
                nearby_slots = 3  # TODO: Replace with live DB query from backend team
                return {
                    "in_high_demand_zone": True,
                    "nearest_zone_distance_m": round(dist * 1000, 1),
                    "demand_intensity": round(zone["weight"], 2),
                    "available_slots_nearby": nearby_slots,
                    "alert_message": (
                        f"You have entered a high-demand parking zone.\n"
                        f"Available slots within {int(self.radius_km * 1000)}m: {nearby_slots}\n"
                        f"Reserve now?"
                    )
                }
        return {
            "in_high_demand_zone": False,
            "nearest_zone_distance_m": None,
            "demand_intensity": 0,
            "available_slots_nearby": None,
            "alert_message": None
        }


# ─────────────────────────────────────────────────────────────
# SECTION 7: MAIN — FULL PIPELINE DEMO
# ─────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("=" * 60)
    print("  ParkIQ AI Module - Full Pipeline")
    print("=" * 60)

    # Step 1: Generate synthetic data (replace with real DB data later)
    print("\n[1] Generating synthetic training data...")
    df_raw = generate_synthetic_bookings(n=5000)
    df_feat = engineer_features(df_raw)
    print(f"    Dataset: {len(df_raw)} records, {df_raw.columns.tolist()[:6]}...")

    # Step 2: Train Availability Predictor
    print("\n[2] Training Availability Prediction Network...")
    availability_model = ParkingAvailabilityPredictor()
    availability_model.train(df_feat, epochs=200, verbose=True)

    # Step 3: Inference - Stage 4
    print("\n[3] Stage 4 - Predict available slots in 20 min:")
    predicted = availability_model.predict(
        current_hour=9,
        day_of_week=1,     # Tuesday
        month=4,           # April
        occupancy_ratio=0.7,
        traffic_level="high",
        capacity=30
    )
    print(f"    Available slots now: ~9")
    print(f"    Predicted availability in 20 minutes: {predicted}")

    # Step 4: Train Recommender
    print("\n[4] Training Recommendation Engine...")
    recommender = ParkingRecommender()
    recommender.train(df_raw, epochs=150, verbose=True)

    # Step 5: Rank slot candidates - Stage 3
    print("\n[5] Stage 3 - Ranking slot candidates for user:")
    candidates = [
        {"distance_from_user_km": 0.3, "price_per_hour": 20, "available_slots": 8,
         "capacity": 10, "traffic_level": "low",  "is_residential": 0,
         "vehicle_type": "car", "hour": 9, "day_of_week": 1, "month": 4, "occupied_slots": 2},
        {"distance_from_user_km": 0.8, "price_per_hour": 10, "available_slots": 15,
         "capacity": 20, "traffic_level": "medium","is_residential": 1,
         "vehicle_type": "car", "hour": 9, "day_of_week": 1, "month": 4, "occupied_slots": 5},
        {"distance_from_user_km": 1.5, "price_per_hour": 50, "available_slots": 2,
         "capacity": 30, "traffic_level": "high",  "is_residential": 0,
         "vehicle_type": "car", "hour": 9, "day_of_week": 1, "month": 4, "occupied_slots": 28},
    ]
    ranked = recommender.rank_slots(candidates)
    for i, slot in enumerate(ranked, 1):
        print(f"    Rank {i}: {slot['distance_from_user_km']}km away | "
              f"Rs.{slot['price_per_hour']}/hr | "
              f"Score: {slot['recommendation_score']:.4f}")

    # Step 6: Heatmap
    print("\n[6] Stage 9 - Building demand heatmap...")
    heatmap_gen = DemandHeatmapGenerator(grid_resolution=0.005)
    heatmap_gen.fit(df_raw)
    heatmap_data = heatmap_gen.get_heatmap_data(min_weight=0.3)
    print(f"    Heatmap points (weight >= 0.3): {len(heatmap_data)}")
    print(f"    Sample point: {heatmap_data[0]}")

    # Step 7: Geofencing
    print("\n[7] Stage 2 - Geofence check (simulated user GPS):")
    geo_engine = GeofencingEngine(heatmap_gen, radius_km=0.15, demand_threshold=0.5)
    peak = heatmap_gen.get_peak_zones(1)[0]
    result = geo_engine.check(
        user_lat=peak["lat"] + 0.001,
        user_lng=peak["lng"] + 0.001
    )
    print(f"    In high-demand zone: {result['in_high_demand_zone']}")
    if result["alert_message"]:
        print(f"    Alert:\n      {result['alert_message']}")

    print("\n" + "=" * 60)
    print("  All AI Modules Loaded Successfully.")
    print("=" * 60)