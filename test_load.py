import joblib
import traceback
import sys

try:
    path = "backend/models/New_Regressor/kidney_risk_model_final_FD_14.pkl"
    print(f"Loading {path}...")
    model = joblib.load(path)
    print("Loaded successfully")
    print(model)
except Exception as e:
    print(f"Error loading model: {e}")
    traceback.print_exc()
