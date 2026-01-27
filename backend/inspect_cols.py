import joblib
import os
import sys

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
# C1 paths
C1_COLS = os.path.join(BASE_DIR, "models", "Classifier1", "CKD_Clinical_Cols.pkl")
C1_SCALER = os.path.join(BASE_DIR, "models", "Classifier1", "CKD_Scaler.pkl")

# C2 paths
C2_COLS = os.path.join(BASE_DIR, "models", "classifier2", "3112CKD_Clinical_Cols.pkl")

def inspect(path, name):
    print(f"--- Inspecting {name} ({path}) ---")
    try:
        data = joblib.load(path)
        print(f"Type: {type(data)}")
        if hasattr(data, "shape"):
            print(f"Shape: {data.shape}")
        if hasattr(data, "n_features_in_"):
            print(f"Scaler n_features_in_: {data.n_features_in_}")
        if isinstance(data, list) or hasattr(data, '__iter__'):
            l = list(data)
            print(f"Length: {len(l)}")
            print(f"Content: {l}")
    except Exception as e:
        print(f"Error: {e}")
    print("\n")

inspect(C1_COLS, "Classifier 1 Cols")
inspect(C1_SCALER, "Classifier 1 Scaler")
inspect(C2_COLS, "Classifier 2 Cols")
