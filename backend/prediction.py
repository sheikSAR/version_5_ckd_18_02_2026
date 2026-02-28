import json
import os
import joblib
import numpy as np
import pandas as pd
from typing import Dict, Any, List
from backend.preprocess import encode_clinical_features

print(">>> LOADED PREDICTION.PY WITH ZERO-PADDING FIX <<<")

SKLEARN_NAME_MAP = {
    "LASSO_PKL": "LASSO_1",
    "RIDGE_PKL": "RIDGE_1",
    "ELASTICNET_PKL": "ELASTICNET_1",
}

MATLAB_NAME_MAP = {
    "EGFR_FilterModel": "EGFR_Filter",
    "YALMIP_Model": "YALMIP",
    "LASSO_JSON": "LASSO_2",
    "ElasticNet_JSON": "ELASTICNET_2",
    "Ridge_JSON": "RIDGE_2",
}

# Classifier 1 configuration
CLASSIFIER_1_CLINICAL_FEATURES = [
    "age", "gender", "Durationofdiabetes", "BMI", "Hypertension",
    "OHA", "INSULIN", "HBA", "CHO", "TRI", "HB", "DR_Label"
]

# Classifier 2 configuration
CLASSIFIER_2_CLINICAL_FEATURES = [
    "age", "gender", "Durationofdiabetes", "BMI", "Hypertension",
    "OHA", "INSULIN", "HBA", "CHO", "TRI", "HB", "DR_Label",
    "Predicted_EGFR"
]

CLASSIFIER_2_EGFR_COLUMNS = [
    "LASSO_1",
    "RIDGE_1",
    "ELASTICNET_1",
    "LASSO_2",
    "ELASTICNET_2",
    "RIDGE_2",
    "EGFR_Filter",
    "YALMIP"
]

# Global ResNet model for classifiers
_cnn_model = None


def load_config(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def predict_simple(model, patient, id_col, egfr_col):
    if "Coefficients" in model and isinstance(model["Coefficients"], dict):
        betas = model["Coefficients"]
        intercept = model.get("Intercept", 0.0)

    elif "Coefficients" in model and "VariableNames" in model:
        betas = dict(zip(model["VariableNames"], model["Coefficients"]))
        intercept = model.get("Intercept", 0.0)

    elif "Estimate" in model and "CoefficientNames" in model:
        betas = dict(zip(model["CoefficientNames"], model["Estimate"]))
        intercept = betas.pop("Intercept", 0.0)

    elif "x" in model:
        features = [c for c in patient.index if c not in [id_col, egfr_col]]
        intercept = model["x"][0]
        betas = dict(zip(features, model["x"][1:]))

    else:
        raise ValueError("Unsupported simple MATLAB model")

    y = intercept
    for f, b in betas.items():
        if f in patient:
            y += float(patient[f]) * float(b)

    return round(float(y), 2)


def get_cnn_model():
    """Load ResNet50 model once and cache it"""
    global _cnn_model
    if _cnn_model is None:
        from tensorflow.keras.applications import ResNet50
        _cnn_model = ResNet50(
            weights="imagenet",
            include_top=False,
            pooling="avg"
        )
    return _cnn_model


def discover_images(images_dir):
    """
    Discover all image files in the images directory.
    Returns a list of image file paths sorted by filename.
    """
    if not images_dir or not os.path.exists(images_dir):
        return []

    supported_extensions = {'.jpg', '.jpeg', '.png', '.bmp', '.gif', '.tiff'}
    image_files = []

    try:
        for filename in sorted(os.listdir(images_dir)):
            if os.path.splitext(filename)[1].lower() in supported_extensions:
                full_path = os.path.join(images_dir, filename)
                if os.path.isfile(full_path):
                    image_files.append(full_path)
    except Exception as e:
        print(f"Warning: Could not read images directory: {str(e)}")

    return image_files


def extract_image_features(image_paths):
    """Extract features from one or more images using ResNet50"""
    if not image_paths or len(image_paths) == 0:
        return None

    from tensorflow.keras.preprocessing import image as keras_image
    from tensorflow.keras.applications.resnet import preprocess_input

    cnn = get_cnn_model()
    features = []

    for img_path in image_paths:
        try:
            if not os.path.exists(img_path):
                continue

            img = keras_image.load_img(img_path, target_size=(224, 224))
            x = keras_image.img_to_array(img)
            x = np.expand_dims(x, axis=0)
            x = preprocess_input(x)

            feat = cnn.predict(x, verbose=0)[0]
            features.append(feat)
        except Exception as e:
            print(f"Warning: Could not extract features from {img_path}: {str(e)}")
            continue

    if len(features) == 0:
        return None

    return np.mean(np.vstack(features), axis=0)


def run_classifier_1(patient, clinical_columns, model, scaler, image_paths=None):
    """Run Classifier 1 (CKD prediction with clinical + image features)"""
    try:
        # Convert patient dict to DataFrame
        import pandas as pd
        
        # Only use the needed original clinical columns
        # Filter original patient to ONLY predefined classifier 1 clinical features
        # (excluding internal ones like "Patient" or "NAME" accidentally introduced)
        patient_subset = {k: patient.get(k, 0.0) for k in clinical_columns if k in patient}
        patient_df = pd.DataFrame([patient_subset])
        
        # One-hot encoding alignment (matches training)
        patient_df = pd.get_dummies(patient_df)
        
        # Align columns with training columns
        # Note: The 'clinical_columns' parameter here should ideally be the loaded cols_path
        # list so it ensures exactly the columns the scaler expects.
        patient_df = patient_df.reindex(columns=clinical_columns, fill_value=0)
        
        # Scale
        Xc_scaled = scaler.transform(patient_df)

        # Extract image features if available
        if image_paths:
            img_feat = extract_image_features(image_paths)
            if img_feat is not None:
                X_final = np.hstack([Xc_scaled, img_feat.reshape(1, -1)])
            else:
                # No valid images, use zero padding for image features
                # ResNet50 features are 2048 dimensions
                zero_img_feat = np.zeros((1, 2048))
                X_final = np.hstack([Xc_scaled, zero_img_feat])
        else:
            # No images provided, use zero padding
            zero_img_feat = np.zeros((1, 2048))
            X_final = np.hstack([Xc_scaled, zero_img_feat])

        # Make prediction
        y_pred = model.predict(X_final)[0]
        y_prob = model.predict_proba(X_final)[0][1]

        return {
            "Prediction": "CKD" if int(y_pred) == 1 else "Non-CKD",
            "Probability": round(float(y_prob) * 100, 2)
        }
    except Exception as e:
        import traceback
        with open("debug_errors.txt", "a") as f:
            f.write(f"Classifier 1 Error: {str(e)}\n")
            f.write(traceback.format_exc() + "\n")
        print(f"Classifier 1 error: {str(e)}")
        return {"Prediction": "Error", "Probability": 0.0, "Error": str(e)}


def run_classifier_2(patient, egfr_predictions, clinical_columns, model, scaler, image_paths=None):
    """Run Classifier 2 (CKD prediction with multiple EGFR models + image features)"""
    try:
        results = {}

        # Extract image features once
        img_feat = None
        if image_paths:
            img_feat = extract_image_features(image_paths)

        # For each EGFR model, create a variant with that EGFR prediction
        for egfr_col in CLASSIFIER_2_EGFR_COLUMNS:
            if egfr_col not in egfr_predictions:
                continue

            # Build feature vector with this specific EGFR prediction
            feature_values = [float(patient.get(f, 0.0)) for f in clinical_columns]
            # Replace "Predicted_EGFR" position if it exists
            if "Predicted_EGFR" in clinical_columns:
                egfr_idx = clinical_columns.index("Predicted_EGFR")
                feature_values[egfr_idx] = float(egfr_predictions[egfr_col])

            X = np.array(feature_values).reshape(1, -1)
            X_scaled = scaler.transform(X)

            if img_feat is not None:
                X_final = np.hstack([X_scaled, img_feat.reshape(1, -1)])
            else:
                # No valid images, use zero padding
                zero_img_feat = np.zeros((1, 2048))
                X_final = np.hstack([X_scaled, zero_img_feat])

            try:
                y_pred = model.predict(X_final)[0]
                y_prob = model.predict_proba(X_final)[0][1]

                results[egfr_col] = {
                    "Prediction": "CKD" if int(y_pred) == 1 else "Non-CKD",
                    "Probability": round(float(y_prob) * 100, 2)
                }
            except Exception as e:
                results[egfr_col] = {"Prediction": "Error", "Probability": 0.0}

        return results if results else {"Error": "No EGFR predictions available"}

    except Exception as e:
        import traceback
        with open("debug_errors.txt", "a") as f:
            f.write(f"Classifier 2 Error: {str(e)}\n")
            f.write(traceback.format_exc() + "\n")
        print(f"Classifier 2 error: {str(e)}")
        return {"Error": str(e)}


def predict_standardized(model, patient):
    model["continuousVars"] = model.get(
        "continuousVars", model.get("continuousvars", [])
    )
    model["binaryVars"] = model.get("binaryVars", model.get("binaryvars", []))
    model["ordinalVars"] = model.get("ordinalVars", model.get("ordinalvars", []))

    beta = model.get("betaenet") or model.get("betalasso") or model.get("betaridge")
    beta = np.array(beta, dtype=float)

    intercept = (
        model.get("intercept")
        or model.get("Intercept")
        or model.get("Interceptlasso")
        or model.get("interceptridge")
        or 0.0
    )

    mu = np.array(model["mu_cont"], dtype=float)
    sigma = np.array(model["sigma_cont"], dtype=float)

    # Safely extract feature values with default 0.0 for missing keys
    Xc = np.array([float(patient.get(v, 0.0)) for v in model["continuousVars"]], dtype=float)
    Xc = (Xc - mu) / sigma

    Xb = np.array([float(patient.get(v, 0.0)) for v in model["binaryVars"]], dtype=float)
    Xo = np.array([float(patient.get(v, 0.0)) for v in model["ordinalVars"]], dtype=float)

    X = np.concatenate([Xc, Xb, Xo])

    if len(beta) == len(X) + 1:
        beta = beta[1:]

    return round(float(np.dot(X, beta) + intercept), 2)


def run(config_path: str) -> List[Dict[str, Any]]:
    global CLASSIFIER_2_CLINICAL_FEATURES
    cfg = load_config(config_path)

    data_cfg = cfg["data"]
    excel_path = data_cfg["excel"]
    id_col = data_cfg["id_column"]
    egfr_col = data_cfg["target_column"]

    sklearn_models_cfg = cfg.get("sklearn_models", {})
    matlab_models_cfg = cfg.get("matlab_models", {})
    classifier_1_cfg = cfg.get("classifier_1", {})
    classifier_2_cfg = cfg.get("classifier_2", {})
    images_dir = cfg.get("images_dir")

    output_cfg = cfg["output"]
    output_json = output_cfg["json"]
    verbose = output_cfg.get("print_progress", True)

    print("Loading data...")
    df = pd.read_excel(excel_path)
    has_actual = egfr_col in df.columns

    FULL_CLINICAL_COLUMNS = [
        "ID", "NAME", "age", "gender", "Hypertension", "HBA", "HB", 
        "DR_OD", "DR_SEVERITY_OD", "DME_OD", "DR_OS", "DR_SEVERITY_OS", "DME_OS", 
        "BMI", "Durationofdiabetes", "OHA", "INSULIN", "CHO", "TRI", "DR_Label", 
        "EGFR", "DR_OD_DR_OS", "CKD_Stage", "DR_Stage", "CKD_Label"
    ]
    
    for c in FULL_CLINICAL_COLUMNS:
        if c not in df.columns:
            df[c] = 0.0

    # Ensure any image passing logic columns are appended securely after
    extra_cols = [c for c in df.columns if c not in FULL_CLINICAL_COLUMNS]
    df = df[FULL_CLINICAL_COLUMNS + extra_cols]

    # Load classifier models if configured
    classifier_1_model = None
    classifier_1_scaler = None
    classifier_1_clinical_cols = None
    classifier_2_model = None
    classifier_2_scaler = None

    if classifier_1_cfg:
        try:
            print("Loading Classifier 1...")
            classifier_1_clinical_cols = joblib.load(classifier_1_cfg.get("Clinical_Cols"))
            classifier_1_model = joblib.load(classifier_1_cfg.get("Model"))
            classifier_1_scaler = joblib.load(classifier_1_cfg.get("Scaler"))
        except Exception as e:
            print(f"Warning: Could not load Classifier 1: {str(e)}")
            classifier_1_model = None

    if classifier_2_cfg:
        try:
            print("Loading Classifier 2...")
            # Classifier 2 needs a CKD model, scaler and clinical columns
            if "Model" in classifier_2_cfg and "Scaler" in classifier_2_cfg:
                classifier_2_model = joblib.load(classifier_2_cfg.get("Model"))
                classifier_2_scaler = joblib.load(classifier_2_cfg.get("Scaler"))
                
                # Load clinical columns if available
                if "Clinical_Cols" in classifier_2_cfg:
                     classifier_2_clinical_cols = joblib.load(classifier_2_cfg.get("Clinical_Cols"))
                     # Use loaded columns instead of global hardcoded list
                     CLASSIFIER_2_CLINICAL_FEATURES = list(classifier_2_clinical_cols)
                     print(f"Loaded Classifier 2 columns: {CLASSIFIER_2_CLINICAL_FEATURES}")
            else:
                print("Warning: Classifier 2 config missing Model or Scaler path")
                classifier_2_model = None
        except Exception as e:
            print(f"Warning: Could not load Classifier 2: {str(e)}")
            classifier_2_model = None

    print("Loading sklearn models...")
    sklearn_models = {
        name: joblib.load(path) for name, path in sklearn_models_cfg.items()
    }

    # Define required columns for sklearn models
    # These are the columns the models were trained with
    SKLEARN_REQUIRED_COLUMNS = [
        "age",
        "gender",
        "Durationofdiabetes",
        "BMI",
        "Hypertension",
        "OHA",
        "INSULIN",
        "HBA",
        "CHO",
        "TRI",
        "HB",
        "DR_OD",
        "DR_SEVERITY_OD",
        "DME_OD",
        "DR_OS",
        "DR_SEVERITY_OS",
        "DME_OS",
        "DR_OD_DR_OS",
        "CKD_Stage",
        "DR_Stage",
    ]

    # Ensure all required columns exist in the original dataframe
    # This is needed for sklearn and MATLAB models that expect these columns
    for col in SKLEARN_REQUIRED_COLUMNS:
        if col not in df.columns:
            df[col] = 0.0

    # Ensure all values are numeric (convert any remaining strings to float)
    for col in SKLEARN_REQUIRED_COLUMNS:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0.0)

    # IMPORTANT: Keep the original unencoded dataframe for sklearn/MATLAB models
    # These models were trained on continuous/original values, NOT encoded categorical values
    df_original = df.copy()

    # Drop ID and EGFR columns for regressors
    X_all = df_original.drop(columns=[id_col, egfr_col], errors="ignore")

    # Select only the required columns in the correct order
    X_all = X_all[SKLEARN_REQUIRED_COLUMNS]

    # NOW encode the dataframe for classifiers and relationship graphs
    print("Encoding clinical features for classifiers...")
    df = encode_clinical_features(df)

    print("Loading MATLAB models...")
    matlab_models = {
        name: json.load(open(path, "r", encoding="utf-8"))
        for name, path in matlab_models_cfg.items()
    }

    # Pre-batch sklearn predictions for efficiency
    sklearn_predictions = {}
    for sklearn_name, sklearn_model in sklearn_models.items():
        out_name = SKLEARN_NAME_MAP[sklearn_name]
        try:
            # Predict for all patients at once, then round
            all_preds = sklearn_model.predict(X_all)
            sklearn_predictions[out_name] = np.round(all_preds, 2)
        except Exception as e:
            print(f"Warning: sklearn model {sklearn_name} failed: {e}")
            sklearn_predictions[out_name] = [None] * len(X_all)

    # Discover images from images directory
    discovered_images = discover_images(images_dir)
    if discovered_images and verbose:
        print(f"Found {len(discovered_images)} image(s) in images directory")

    results = []
    total_patients = len(df)

    for idx, patient in df.iterrows():
        pid = str(patient[id_col])
        actual = round(float(patient[egfr_col]), 2) if has_actual else None

        # Get the original unencoded patient data for MATLAB models
        patient_original = df_original.iloc[idx]

        predictions_dict = {}
        errors_dict = {}

        # Get pre-computed sklearn predictions
        for sklearn_name in sklearn_models.keys():
            out_name = SKLEARN_NAME_MAP[sklearn_name]
            try:
                pred_val = sklearn_predictions[out_name][idx]
                if pred_val is not None:
                    pred = float(pred_val)
                    predictions_dict[out_name] = pred
                    if has_actual:
                        errors_dict[out_name] = round(pred - actual, 2)
            except Exception as e:
                print(f"Warning: {sklearn_name} prediction failed for patient {pid}: {e}")

        # Process MATLAB models using original unencoded data
        for name, model in matlab_models.items():
            out_name = MATLAB_NAME_MAP[name]
            try:
                if name in ["EGFR_FilterModel", "YALMIP_Model"]:
                    pred = predict_simple(model, patient_original, id_col, egfr_col)
                else:
                    pred = predict_standardized(model, patient_original)
                predictions_dict[out_name] = pred
                if has_actual:
                    errors_dict[out_name] = round(pred - actual, 2)
            except Exception as e:
                print(f"Warning: {name} prediction failed for patient {pid}: {e}")

        # Run Classifier 1 using original unencoded data
        classifier_1_result = None
        if classifier_1_model is not None and classifier_1_scaler is not None and classifier_1_clinical_cols is not None:
            # Get image paths: first check original patient data, then use discovered images
            image_paths = []
            if "image_path" in patient_original and patient_original["image_path"]:
                image_paths = [patient_original["image_path"]] if isinstance(patient_original["image_path"], str) else patient_original["image_path"]
            elif "image_paths" in patient_original and patient_original["image_paths"]:
                image_paths = patient_original["image_paths"] if isinstance(patient_original["image_paths"], list) else [patient_original["image_paths"]]
            elif discovered_images:
                # Use discovered images if no patient-specific images provided
                image_paths = discovered_images

            classifier_1_result = run_classifier_1(
                patient_original,
                list(classifier_1_clinical_cols), # Must use the joblib loaded column list specifically for the scaler
                classifier_1_model,
                classifier_1_scaler,
                image_paths if image_paths else None
            )

        # Run Classifier 2 using original unencoded data
        classifier_2_result = None
        if classifier_2_model and classifier_2_scaler:
            # Get image paths: first check original patient data, then use discovered images
            image_paths = []
            if "image_path" in patient_original and patient_original["image_path"]:
                image_paths = [patient_original["image_path"]] if isinstance(patient_original["image_path"], str) else patient_original["image_path"]
            elif "image_paths" in patient_original and patient_original["image_paths"]:
                image_paths = patient_original["image_paths"] if isinstance(patient_original["image_paths"], list) else [patient_original["image_paths"]]
            elif discovered_images:
                # Use discovered images if no patient-specific images provided
                image_paths = discovered_images

            classifier_2_result = run_classifier_2(
                patient_original,
                predictions_dict,
                CLASSIFIER_2_CLINICAL_FEATURES,
                classifier_2_model,
                classifier_2_scaler,
                image_paths if image_paths else None
            )

        # Store image information in the entry
        images_used = []
        if discovered_images:
            images_used = [os.path.basename(img) for img in discovered_images]

        entry = {
            "Patient_ID": pid,
            "Actual_EGFR": actual,
            "Predictions": predictions_dict,
            "Errors": errors_dict,
            "Classifier1": classifier_1_result,
            "Classifier2": classifier_2_result,
            "Images_Used": images_used,
        }

        results.append(entry)

        if verbose and (idx + 1) % max(1, total_patients // 10) == 0:
            print(f"Processed {idx + 1}/{total_patients} patients")

    # Convert numpy types to native Python types more efficiently
    converted_results = {}
    patient_ids = []

    for entry in results:
        converted_entry = {
            "Patient_ID": str(entry["Patient_ID"]),
            "Actual_EGFR": (
                float(entry["Actual_EGFR"])
                if entry["Actual_EGFR"] is not None
                else None
            ),
            "Predictions": {k: float(v) for k, v in entry["Predictions"].items()},
            "Errors": (
                {k: float(v) for k, v in entry["Errors"].items()}
                if entry["Errors"]
                else {}
            ),
        }

        # Add Classifier 1 results
        if entry["Classifier1"]:
            classifier_1_data = entry["Classifier1"]
            converted_entry["Classifier1"] = {
                "label": classifier_1_data.get("Prediction", "Not Available"),
                "probability": float(classifier_1_data.get("Probability", 0.0))
            }
        else:
            converted_entry["Classifier1"] = {"label": "Not Available", "probability": 0.0}

        # Add Classifier 2 results
        if entry["Classifier2"]:
            converted_entry["Classifier2"] = {}
            for key, val in entry["Classifier2"].items():
                if isinstance(val, dict):
                    converted_entry["Classifier2"][key] = {
                        "label": val.get("Prediction", "Error"),
                        "probability": float(val.get("Probability", 0.0))
                    }
        else:
            converted_entry["Classifier2"] = {}

        # Add images information
        if entry.get("Images_Used"):
            converted_entry["Images_Used"] = entry["Images_Used"]

        patient_id = converted_entry["Patient_ID"]
        converted_results[patient_id] = converted_entry
        patient_ids.append(patient_id)

    # Write predictions JSON as object indexed by Patient_ID
    with open(output_json, "w", encoding="utf-8") as f:
        json.dump(converted_results, f, indent=4)

    # Save patient IDs list to patients.json in the same output directory
    patients_json_path = os.path.join(os.path.dirname(output_json), "patients.json")
    with open(patients_json_path, "w", encoding="utf-8") as f:
        json.dump(patient_ids, f, indent=4)

    print("\nCOMBINED BATCH PREDICTION COMPLETED")
    print(f"Patients: {len(converted_results)}")
    print(f"Saved predictions to: {output_json}")
    print(f"Saved patient list to: {patients_json_path}")

    return converted_results
