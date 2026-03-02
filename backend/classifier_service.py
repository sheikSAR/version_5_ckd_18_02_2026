import os
import numpy as np
import pandas as pd
import joblib
import json

# Suppress TensorFlow logging
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '2'

# ==========================================================
# CONSTANTS & PATHS
# ==========================================================
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODELS_DIR = os.path.join(BASE_DIR, "models")

# Classifier 1 Paths (Clinical + Image Pooling)
C1_DIR = os.path.join(MODELS_DIR, "Classifier1")
C1_MODEL_PATH = os.path.join(C1_DIR, "CKD_ResNet_XGB_Model.pkl")
C1_SCALER_PATH = os.path.join(C1_DIR, "CKD_Scaler.pkl")
C1_COLS_PATH = os.path.join(C1_DIR, "CKD_Clinical_Cols.pkl")

# Classifier 2 Paths (EGFR-Aware Ensemble)
C2_DIR = os.path.join(MODELS_DIR, "classifier2")
C2_MODEL_PATH = os.path.join(C2_DIR, "3112CKD_ResNet_XGB_Model.pkl")
C2_SCALER_PATH = os.path.join(C2_DIR, "31125CKD_Scaler.pkl")
C2_COLS_PATH = os.path.join(C2_DIR, "3112CKD_Clinical_Cols.pkl")

# Clinical Features for Normalization
CLINICAL_FEATURES_LIST = [
    "age", "gender", "Durationofdiabetes", "BMI", "Hypertension",
    "OHA", "INSULIN", "HBA", "CHO", "TRI", "HB", "DR_Label",
    "Predicted_EGFR"
]

EGFR_COLUMNS = [
    "Predicted_EGFR_FilterModel",
    "Predicted_EGFR_YALIMP_Model",
    "Predicted_EGFR_LASSOMatlab",
    "Predicted_EGFR_ElasticNet_Matlab",
    "Predicted_EGFR_Ridge_Matlab",
    "Predicted_EGFR_LASSO",
    "Predicted_EGFR_RIDGE",
    "Predicted_EGFR_ELASTICNET"
]

EGFR_MAPPING = {
    "Predicted_EGFR_FilterModel": "egfr_filter_matlab",
    "Predicted_EGFR_YALIMP_Model": "yalmip_matlab",
    "Predicted_EGFR_LASSOMatlab": "lasso_matlab",
    "Predicted_EGFR_ElasticNet_Matlab": "elasticnet_matlab",
    "Predicted_EGFR_Ridge_Matlab": "ridge_matlab",
    "Predicted_EGFR_LASSO": "predicted_egfr_lasso",
    "Predicted_EGFR_RIDGE": "predicted_egfr_ridge",
    "Predicted_EGFR_ELASTICNET": "predicted_egfr_elasticnet"
}

# ==========================================================
# SINGLETON RESOURCES
# ==========================================================
class ModelSingleton:
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(ModelSingleton, cls).__new__(cls)
            cls._instance.initialize()
        return cls._instance

    def initialize(self):
        print("Loading Shared Resources...")
        # Import TensorFlow here to defer the heavy import cost
        from tensorflow.keras.applications import ResNet50

        # Load ResNet50 once for both classifiers
        self.cnn_model = ResNet50(weights="imagenet", include_top=False, pooling="avg")

        # Load Classifier 1 Resources
        self.c1_model = joblib.load(C1_MODEL_PATH)
        self.c1_scaler = joblib.load(C1_SCALER_PATH)
        self.c1_cols = joblib.load(C1_COLS_PATH)

        # Load Classifier 2 Resources
        self.c2_model = joblib.load(C2_MODEL_PATH)
        self.c2_scaler = joblib.load(C2_SCALER_PATH)
        # self.c2_cols = joblib.load(C2_COLS_PATH) # Might not be needed if we hardcode features
        print("Resources Loaded Successfully.")

# Lazy-load: Get singleton instance only when needed
def get_resources():
    """Get the ModelSingleton instance, initializing if necessary"""
    return ModelSingleton()

# ==========================================================
# HELPERS
# ==========================================================
def extract_image_features(image_paths):
    """
    Extract features from images using ResNet50.
    Handles 0 to 4 images. Returns pooled (mean) features.
    """
    if not image_paths:
        # If no images, return zero vector of correct shape (2048,)
        return np.zeros(2048)

    from tensorflow.keras.preprocessing import image
    from tensorflow.keras.applications.resnet import preprocess_input

    resources = get_resources()
    features = []
    for img_path in image_paths:
        try:
            img = image.load_img(img_path, target_size=(224, 224))
            x = image.img_to_array(img)
            x = np.expand_dims(x, axis=0)
            x = preprocess_input(x)

            feat = resources.cnn_model.predict(x, verbose=0)[0]
            features.append(feat)
        except Exception as e:
            print(f"Error processing image {img_path}: {e}")

    if not features:
        return np.zeros(2048)

    return np.mean(np.vstack(features), axis=0)

def normalize_key(key):
    """Normalize clinical data keys to match model expectations."""
    key_map = {
        "duration_of_diabetes": "Durationofdiabetes",
        "bmi": "BMI",
        "hba": "HBA",
        "tri": "TRI",
        "cho": "CHO",
        "hb": "HB",
        "hypertension": "Hypertension",
        "oha": "OHA",
        "insulin": "INSULIN",
        "dr_od": "DR_OD",
        "dr_os": "DR_OS",
        "dr_od_or_dr_os": "DR_OD_OS",
        "dr_od_os": "DR_OD_OS",
        "ckd_label": "CKD_Label",
    }
    return key_map.get(key.lower(), key)

def encode_value(key, val):
    """Encode string values to numeric for model compatibility."""
    if val is None:
        return 0.0
    if isinstance(val, str):
        # Gender encoding: M=1, F=0
        if key.lower() == 'gender':
            return 1.0 if val.upper() in ['M', 'MALE', '1'] else 0.0
        # Try numeric conversion for other strings
        try:
            return float(val)
        except ValueError:
            return 0.0
    return float(val)

# ==========================================================
# CLASSIFIER 1: Clinical + Image
# ==========================================================
def run_classifier_1(clinical_data, image_paths):
    """
    Runs Classifier 1 (ResNet + Clinical Pooling).
    Returns: { "label": "CKD"/"Non-CKD", "probability": 0.xx }
    """
    try:
        resources = get_resources()

        # 1. Prepare Clinical Data
        # Ensure we have all required columns
        df_patient = pd.DataFrame([clinical_data])

        # Simple Key Normalization if needed (though existing keys usually match)
        # We rely on the input clinical_data having correct keys or being adaptable

        # Create dummies and align with training columns
        Xc = pd.get_dummies(df_patient)

        # DEBUG: Print columns to resolve mismatch
        try:
            with open(os.path.join(os.getcwd(), "debug_cols.txt"), "w") as f:
                f.write(f"Required: {list(resources.c1_cols)}\n")
                f.write(f"Current: {list(Xc.columns)}\n")
                f.flush()
        except Exception as e:
            print(f"Failed to write debug: {e}")

        Xc = Xc.reindex(columns=resources.c1_cols, fill_value=0)

        # Scale
        Xc_scaled = resources.c1_scaler.transform(Xc)

        # 2. Prepare Image Features
        pooled_feat = extract_image_features(image_paths)

        # 3. Combine
        X_final = np.hstack([Xc_scaled, pooled_feat.reshape(1, -1)])

        # 4. Predict
        y_pred = resources.c1_model.predict(X_final)[0]
        y_proba = resources.c1_model.predict_proba(X_final)[0][1]

        return {
            "label": "CKD" if y_pred == 1 else "Non-CKD",
            "probability": float(y_proba)
        }
    except Exception as e:
        print(f"Classifier 1 Error: {e}")
        # Return fallback/error state
        return {
            "label": "Error",
            "probability": 0.0,
            "error": str(e)
        }

# ==========================================================
# CLASSIFIER 2: EGFR-Aware Ensemble
# ==========================================================
def run_classifier_2(clinical_data, image_paths, egfr_predictions):
    """
    Runs Classifier 2 for each predicted eGFR value.
    clinical_data: dict of clinical features
    image_paths: list of paths
    egfr_predictions: dict of { "ModelName": value }

    Returns: { "ModelName": { "label": "...", "probability": ... } }
    """
    results = {}

    try:
        resources = get_resources()

        # Pre-calculate image features once
        img_feat = extract_image_features(image_paths)

        # Normalize keys AND encode values for the input record
        normalized_record = {normalize_key(k): encode_value(normalize_key(k), v) for k, v in clinical_data.items()}

        for model_name, egfr_val in egfr_predictions.items():
            # Determine which EGFR column matches this model
            # We need to map 'Model Name' (from prediction.py) -> 'EGFR Column' (for Classifier 2)
            # Or simplified: In this specific classifier logic, 'Predicted_EGFR' is the FEATURE NAME used in training.
            # So we just inject the current model's predicted eGFR into that feature.

            temp_record = normalized_record.copy()
            temp_record["Predicted_EGFR"] = float(egfr_val)

            # Prepare feature vector (must match CLINICAL_FEATURES_LIST order)
            try:
                # Extract ordered features. Use 0 as default if missing.
                X = np.array([temp_record.get(f, 0.0) for f in CLINICAL_FEATURES_LIST]).reshape(1, -1)

                # Scale
                X_scaled = resources.c2_scaler.transform(X)

                # Combine with images
                X_final = np.hstack([X_scaled, img_feat.reshape(1, -1)])

                # Predict
                y_pred = resources.c2_model.predict(X_final)[0]
                y_prob = resources.c2_model.predict_proba(X_final)[0][1]

                results[model_name] = {
                    "label": "CKD" if int(y_pred) == 1 else "Non-CKD",
                    "probability": round(float(y_prob), 4)
                }

            except Exception as e:
                print(f"Error predicting for {model_name}: {e}")
                results[model_name] = {"label": "Error", "probability": 0}

    except Exception as e:
        print(f"Classifier 2 Global Error: {e}")

    return results
