import json
import os
import joblib
import numpy as np
import pandas as pd
from typing import Dict, Any, List
from backend.preprocess import encode_clinical_features

import sys
import importlib
try:
    import numpy._core
except ImportError:
    # Fallback for models pickled with numpy 2.x but loaded in numpy 1.x
    import numpy.core
    sys.modules['numpy._core'] = numpy.core
    sys.modules['numpy._core.multiarray'] = numpy.core.multiarray
    sys.modules['numpy._core.umath'] = numpy.core.umath
    sys.modules['numpy._core.numerictypes'] = numpy.core.numerictypes

print(">>> LOADED PREDICTION.PY — Classifier 1 + Random Forest Pipeline <<<")


# Classifier 1 configuration
CLASSIFIER_1_CLINICAL_FEATURES = [
    "age", "gender", "Durationofdiabetes", "BMI", "Hypertension",
    "OHA", "INSULIN", "HBA", "CHO", "TRI", "HB", "DR_Label"
]

# Random Forest feature order
RF_14_FEATURES = [
    "age", "gender", "Durationofdiabetes", "BMI", "Hypertension",
    "OHA", "INSULIN", "HBA", "CHO", "TRI", "HB", "DR_OD_OS",
    "DR_SEVERITY_OD", "DR_SEVERITY_OS"
]

# Global ResNet model for classifiers
_cnn_model = None


def load_config(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


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


def filter_images_for_patient(all_images, patient_id, total_patients=0):
    """
    Filter images to only include those belonging to a specific patient.
    Images are matched by checking if the filename starts with the patient ID.
    e.g., patient_id='EY00425' matches 'EY00425_OD1_30.jpg'
    If there is only 1 patient (single upload), we return all images.
    """
    if not all_images or not patient_id:
        return []
    
    if total_patients == 1:
        return all_images
    
    pid = str(patient_id).strip()
    filtered = [
        img for img in all_images
        if os.path.basename(img).startswith(pid)
    ]
    return filtered


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
        
        # Build a normalized lookup to handle column name mismatches (e.g., 'DR _Label' vs 'DR_Label')
        # Create a map from normalized (no-space) keys to actual patient keys
        patient_keys = {}
        for pk in patient.index if hasattr(patient, 'index') else patient.keys():
            patient_keys[str(pk).replace(' ', '')] = pk
        
        patient_subset = {}
        for k in clinical_columns:
            k_norm = str(k).replace(' ', '')
            if k_norm in patient_keys:
                patient_subset[k] = patient[patient_keys[k_norm]]
            elif k in patient:
                patient_subset[k] = patient[k]
            else:
                patient_subset[k] = 0.0
        
        patient_df = pd.DataFrame([patient_subset])
        
        # One-hot encoding alignment (matches training)
        patient_df = pd.get_dummies(patient_df)
        
        # Align columns with training columns
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


def run_classifier_2(patient, clinical_columns, model, scaler, rf_probability, image_paths=None):
    """Run Classifier 2 (CKD prediction with clinical + RF prob + image features)"""
    try:
        import numpy as np
        
        # Build feature vector exactly matching `clinical_columns` order
        X_vals = []
        for col in clinical_columns:
            if col == 'predicted_probability':
                X_vals.append(float(rf_probability))
            else:
                val = patient.get(col, 0.0)
                if col == "gender":
                    val_str = str(val).strip().upper()
                    if val_str == "F" or val in [1, 1.0, "1", "1.0"]:
                        val = 1.0
                    elif val_str == "M" or val in [0, 0.0, "0", "0.0"]:
                        val = 0.0
                    else:
                        val = 0.0
                else:
                    try:
                        val = float(val) if val is not None and str(val).strip() != "" else 0.0
                        if np.isnan(val):
                            val = 0.0
                    except (ValueError, TypeError):
                        val = 0.0
                X_vals.append(val)
                
        # Scale the 15 features using the provided scaler
        # The scaler expects a 2D array or DataFrame with the same feature names
        import pandas as pd
        X_clinical_df = pd.DataFrame([X_vals], columns=clinical_columns)
        Xc_scaled = scaler.transform(X_clinical_df)

        # Extract image features if available
        if image_paths:
            img_feat = extract_image_features(image_paths)
            if img_feat is not None:
                X_final = np.hstack([Xc_scaled, img_feat.reshape(1, -1)])
            else:
                zero_img_feat = np.zeros((1, 2048))
                X_final = np.hstack([Xc_scaled, zero_img_feat])
        else:
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
            f.write(f"Classifier 2 Error: {str(e)}\n")
            f.write(traceback.format_exc() + "\n")
        print(f"Classifier 2 error: {str(e)}")
        return {"Prediction": "Error", "Probability": 0.0, "Error": str(e)}


def run_random_forest(patient_features, rf_pkg_14):
    """
    Run Random Forest prediction using the 14-feature model.
    
    Each rf_pkg is a dict: {'model', 'features', 'defaults', 'threshold'}
    
    Returns: {"label": "CKD"/"Non-CKD", "probability": float, "model_used": "RF_14"}
    """
    try:
        if rf_pkg_14 is None:
            raise ValueError("Random Forest 14-feature package is not available.")
            
        pkg = rf_pkg_14
        model_used = "RF_14"
        
        model = pkg['model']
        feature_order = pkg['features']
        defaults = pkg.get('defaults', {})
        threshold = pkg['threshold']
        
        print(f"DEBUG RF: Using {model_used} model, threshold={threshold}, features={feature_order}")
        
        # Build feature vector
        X_vals = []
        for f in feature_order:
            val = patient_features.get(f, defaults.get(f, 0.0))
            if f == "gender":
                val_str = str(val).strip().upper()
                if val_str == "F" or val in [1, 1.0, "1", "1.0"]:
                    val = 1.0
                elif val_str == "M" or val in [0, 0.0, "0", "0.0"]:
                    val = 0.0
                else:
                    val = 0.0
            else:
                try:
                    val = float(val) if val is not None and str(val).strip() != "" else defaults.get(f, 0.0)
                    if np.isnan(val):
                        val = defaults.get(f, 0.0)
                except (ValueError, TypeError):
                    val = defaults.get(f, 0.0)
            X_vals.append(val)
        
        X = np.array(X_vals).reshape(1, -1)
        
        # Get probability
        prob = model.predict_proba(X)[0][1]  # Probability of class 1 (CKD)
        
        # Apply threshold from model package
        label = 1 if prob >= threshold else 0
        
        return {
            "label": "CKD" if label == 1 else "Non-CKD",
            "probability": round(float(prob) * 100, 2),
            "model_used": model_used
        }
    except Exception as e:
        import traceback
        with open("debug_errors.txt", "a") as f:
            f.write(f"Random Forest Error: {str(e)}\n")
            f.write(traceback.format_exc() + "\n")
        print(f"Random Forest error: {str(e)}")
        traceback.print_exc()
        return {"label": "Error", "probability": 0.0, "model_used": "N/A", "Error": str(e)}


def run(config_path: str) -> List[Dict[str, Any]]:
    cfg = load_config(config_path)

    data_cfg = cfg["data"]
    excel_path = data_cfg["excel"]
    id_col = data_cfg["id_column"]
    egfr_col = data_cfg["target_column"]

    classifier_1_cfg = cfg.get("classifier_1", {})
    classifier_2_cfg = cfg.get("classifier_2", {})
    random_forest_cfg = cfg.get("random_forest", {})
    images_dir = cfg.get("images_dir")

    output_cfg = cfg["output"]
    output_json = output_cfg["json"]
    verbose = output_cfg.get("print_progress", True)

    print("Loading data...")
    df = pd.read_excel(excel_path)
    has_actual = egfr_col in df.columns

    FULL_CLINICAL_COLUMNS = [
        "age", "gender", "Hypertension", "HBA", "HB", 
        "BMI", "Durationofdiabetes", "OHA", "INSULIN", "CHO", "TRI", "DR_Label", 
        "DR_OD_OS", "EGFR", "DR_SEVERITY_OD", "DR_SEVERITY_OS"
    ]
    
    for c in FULL_CLINICAL_COLUMNS:
        if c not in df.columns:
            # Auto-derive DR_Label from DR_OD_OS if available
            if c == 'DR_Label' and 'DR_OD_OS' in df.columns:
                df['DR_Label'] = df['DR_OD_OS']
            else:
                df[c] = 0.0

    df_original = df.copy()

    # Load Classifier 1 model
    classifier_1_model = None
    classifier_1_scaler = None
    classifier_1_clinical_cols = None

    if classifier_1_cfg:
        try:
            print("Loading Classifier 1...")
            classifier_1_clinical_cols = joblib.load(classifier_1_cfg.get("Clinical_Cols"))
            classifier_1_model = joblib.load(classifier_1_cfg.get("Model"))
            classifier_1_scaler = joblib.load(classifier_1_cfg.get("Scaler"))
        except Exception as e:
            print(f"Warning: Could not load Classifier 1: {str(e)}")
            classifier_1_model = None

    # Load Classifier 2 model
    classifier_2_model = None
    classifier_2_scaler = None
    classifier_2_clinical_cols = None

    if classifier_2_cfg:
        try:
            print("Loading Classifier 2...")
            classifier_2_clinical_cols = joblib.load(classifier_2_cfg.get("Clinical_Cols"))
            classifier_2_model = joblib.load(classifier_2_cfg.get("Model"))
            classifier_2_scaler = joblib.load(classifier_2_cfg.get("Scaler"))
        except Exception as e:
            print(f"Warning: Could not load Classifier 2: {str(e)}")
            classifier_2_model = None

    # Load Random Forest model package
    rf_pkg_14 = None

    if random_forest_cfg:
        try:
            print("Loading Random Forest models...")
            rf_model_14_path = random_forest_cfg.get("model_14")
            
            if rf_model_14_path:
                rf_pkg_14 = joblib.load(rf_model_14_path)
                print(f"  Loaded 14-feature RF package from {rf_model_14_path}")
                print(f"    Features: {rf_pkg_14.get('features', 'N/A')}")
                print(f"    Threshold: {rf_pkg_14.get('threshold', 'N/A')}")
        except Exception as e:
            print(f"Warning: Could not load Random Forest models: {str(e)}")
            import traceback
            traceback.print_exc()

    print("Encoding clinical features for classifiers...")
    df = encode_clinical_features(df)

    # Discover images from images directory
    discovered_images = discover_images(images_dir)
    if discovered_images and verbose:
        print(f"Found {len(discovered_images)} image(s) in images directory")

    results = []
    total_patients = len(df)

    for idx, patient in df.iterrows():
        pid = str(patient[id_col])
        actual = round(float(df_original.iloc[idx][egfr_col]), 2) if has_actual and egfr_col in df_original.columns else None

        # Get the original unencoded patient data
        patient_original = df_original.iloc[idx]

        # Run Classifier 1
        classifier_1_result = None
        if classifier_1_model is not None and classifier_1_scaler is not None and classifier_1_clinical_cols is not None:
            image_paths = []
            if "image_path" in patient_original and patient_original["image_path"]:
                image_paths = [patient_original["image_path"]] if isinstance(patient_original["image_path"], str) else patient_original["image_path"]
            elif "image_paths" in patient_original and patient_original["image_paths"]:
                image_paths = patient_original["image_paths"] if isinstance(patient_original["image_paths"], list) else [patient_original["image_paths"]]
            elif discovered_images:
                image_paths = filter_images_for_patient(discovered_images, pid, total_patients)

            classifier_1_result = run_classifier_1(
                patient_original,
                list(classifier_1_clinical_cols), 
                classifier_1_model,
                classifier_1_scaler,
                image_paths if image_paths else None
            )

        # Run Random Forest
        rf_result = None
        if rf_pkg_14 is not None:
            rf_result = run_random_forest(
                patient_original,
                rf_pkg_14
            )

        # Store image information in the entry (only patient-specific images)
        images_used = []
        if discovered_images:
            patient_images = filter_images_for_patient(discovered_images, pid, total_patients)
            images_used = [os.path.basename(img) for img in patient_images]

        # Run Classifier 2
        classifier_2_result = None
        if classifier_2_model is not None and classifier_2_scaler is not None and classifier_2_clinical_cols is not None:
            rf_prob = rf_result["probability"] / 100.0 if rf_result and "probability" in rf_result else 0.0
            
            # Use same image paths as classifier 1
            image_paths = []
            if "image_path" in patient_original and patient_original["image_path"]:
                image_paths = [patient_original["image_path"]] if isinstance(patient_original["image_path"], str) else patient_original["image_path"]
            elif "image_paths" in patient_original and patient_original["image_paths"]:
                image_paths = patient_original["image_paths"] if isinstance(patient_original["image_paths"], list) else [patient_original["image_paths"]]
            elif discovered_images:
                image_paths = filter_images_for_patient(discovered_images, pid, total_patients)

            classifier_2_result = run_classifier_2(
                patient_original,
                list(classifier_2_clinical_cols), 
                classifier_2_model,
                classifier_2_scaler,
                rf_prob,
                image_paths if image_paths else None
            )

        entry = {
            "Patient_ID": pid,
            "Actual_EGFR": actual,
            "Classifier1": classifier_1_result,
            "Classifier2": classifier_2_result,
            "RandomForest": rf_result,
            "Images_Used": images_used,
        }

        results.append(entry)

        if verbose and (idx + 1) % max(1, total_patients // 10) == 0:
            print(f"Processed {idx + 1}/{total_patients} patients")

    # Convert numpy types to native Python types
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
        if entry.get("Classifier2"):
            classifier_2_data = entry["Classifier2"]
            converted_entry["Classifier2"] = {
                "label": classifier_2_data.get("Prediction", "Not Available"),
                "probability": float(classifier_2_data.get("Probability", 0.0))
            }
        else:
            converted_entry["Classifier2"] = {"label": "Not Available", "probability": 0.0}

        # Add Random Forest results
        if entry["RandomForest"]:
            rf_data = entry["RandomForest"]
            converted_entry["RandomForest"] = {
                "label": rf_data.get("label", "Not Available"),
                "probability": float(rf_data.get("probability", 0.0)),
                "model_used": rf_data.get("model_used", "N/A")
            }
        else:
            converted_entry["RandomForest"] = {"label": "Not Available", "probability": 0.0, "model_used": "N/A"}

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
