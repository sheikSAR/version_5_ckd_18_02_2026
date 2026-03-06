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

print(">>> LOADED PREDICTION.PY WITH ZERO-PADDING FIX <<<")



# Classifier 1 configuration
CLASSIFIER_1_CLINICAL_FEATURES = [
    "age", "gender", "Durationofdiabetes", "BMI", "Hypertension",
    "OHA", "INSULIN", "HBA", "CHO", "TRI", "HB", "DR_Label"
]

JSON_MODEL_FILE = "backend/models/MatlabTrained/CKD_Exported_Models.json"
JSON_LEVEL2_MODEL_FILE = "backend/models/MatlabTrained/CKD_Exported_Models_level2.json"

# Models we expect to load and run from the JSON
REGRESSION_MODELS = [
    "Tree"
]

LEVEL2_REGRESSION_MODELS = [
    "LINEAR", 
    "ROBUST", 
    "QUADRATIC", 
    "Ridge", 
    "Tree"
]

# Global ResNet model for classifiers
_cnn_model = None


def load_config(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def predict_json_model(model_name, model_data, patient_features, is_level2=False, level1_egfr=0.0, level1_label=0.0):
    """
    Predicts using the exported JSON weights.
    Order of features expected by the MATLAB Level 1 models:
    ["age", "gender", "Durationofdiabetes", "BMI", "Hypertension", "OHA", "INSULIN", "HBA", "CHO", "TRI", "HB", "DR_OD_OS"]
    Level 2 models append: ["predicted eGFR", "Predicted_Label"]
    """
    matlab_feature_order = [
         "age", "gender", "Durationofdiabetes", "BMI", "Hypertension", 
         "OHA", "INSULIN", "HBA", "CHO", "TRI", "HB", "DR_OD_OS"
    ]
    
    # Extract X vector in exact order
    X_vals = []
    for f in matlab_feature_order:
        val = patient_features.get(f, 0.0)
        if f == "gender":
            val_str = str(val).strip().upper()
            if val_str == "F" or val in [1, 1.0, "1", "1.0"]:
                val = 1.0
            elif val_str == "M" or val in [0, 0.0, "0", "0.0"]:
                val = 0.0
            else:
                val = 0.0
        X_vals.append(float(val))
        
    if is_level2:
        X_vals.append(float(level1_egfr))
        X_vals.append(float(level1_label))
        
    X = np.array(X_vals)
    
    y_pred = 0.0
    
    if model_name == "Tree":
        # model_data contains: CutPredictor, CutPoint, Children, NodeMean, IsBranchNode
        current_node = 0 # root
        
        cut_predictors = model_data.get("CutPredictor", [])
        cut_points = model_data.get("CutPoint", [])
        children = model_data.get("Children", [])
        node_means = model_data.get("NodeMean", [])
        is_branch = model_data.get("IsBranchNode", [])
        
        while current_node < len(is_branch) and is_branch[current_node]:
            cut_pred_name = cut_predictors[current_node]
            
            if isinstance(cut_pred_name, str) and cut_pred_name.startswith('x'):
                try:
                    feat_idx = int(cut_pred_name[1:]) - 1
                except:
                    feat_idx = 0
            elif isinstance(cut_pred_name, str) and cut_pred_name in matlab_feature_order:
                feat_idx = matlab_feature_order.index(cut_pred_name)
            else:
                feat_idx = 0
                
            cut_val = cut_points[current_node]
            patient_val = X[feat_idx]
            
            if patient_val < cut_val:
                current_node = int(children[current_node][0]) - 1
            else:
                current_node = int(children[current_node][1]) - 1
                
        if current_node < len(node_means):
            y_pred = float(node_means[current_node])
        else:
            y_pred = 0.0

    elif model_name in ["LINEAR", "ROBUST"]:
        coeffs = model_data.get("Coefficients", [])
        if len(coeffs) > len(X):
            y_pred = coeffs[0] + np.dot(X, coeffs[1:])
        else:
            y_pred = 0.0
            
    elif model_name == "QUADRATIC":
        coeffs = model_data.get("Coefficients", [])
        X_quad = np.concatenate([X, X**2])
        if len(coeffs) > len(X_quad):
            y_pred = coeffs[0] + np.dot(X_quad, coeffs[1:])
        else:
            y_pred = 0.0

    elif model_name == "Ridge":
        # Ridge output is a list of coefficients. First element is intercept.
        if isinstance(model_data, list) and len(model_data) > len(X):
            y_pred = model_data[0] + np.dot(X, model_data[1:])
        else:
            y_pred = 0.0

    return round(float(y_pred), 2)



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





def run_classifier_2(patient, clinical_columns, model, scaler, egfr_predictions, image_paths=None):
    """Run Classifier 2 (CKD prediction conditioned on EGFR + clinical + image features)"""
    results = {}
    try:
        import pandas as pd
        
        # Determine image features once for all models to speed up
        img_feat = None
        if image_paths:
            img_feat = extract_image_features(image_paths)
        if img_feat is None:
            img_feat = np.zeros(2048)

        # Baseline clinical subset
        patient_subset = {}
        for k in clinical_columns:
            if k in patient and k != "Predicted_EGFR":
                val = patient.get(k, 0.0)
                if k == "gender" and isinstance(val, str):
                    if val.upper() == "F":
                        val = 1.0
                    elif val.upper() == "M":
                        val = 0.0
                    else:
                        try:
                            val = float(val)
                        except ValueError:
                            val = 0.0
                patient_subset[k] = float(val)

        print(f"DEBUG Classifier 2: Running on Regressors: {egfr_predictions.keys()}")

        # Loop through existing regressors predictions and run Classifier 2 for each
        for model_name, egfr_val in egfr_predictions.items():
            print(f"DEBUG Classifier 2: Running for {model_name} with EGFR: {egfr_val}")
            try:
                # Add the specific EGFR prediction into the feature list
                temp_subset = patient_subset.copy()
                temp_subset["Predicted_EGFR"] = float(egfr_val)
                
                patient_df = pd.DataFrame([temp_subset])
                
                # Make sure we're getting dummy vars correctly, but with just numericals it shouldn't matter
                patient_df = pd.get_dummies(patient_df)
                
                # Align columns exactly with expected ones
                patient_df = patient_df.reindex(columns=clinical_columns, fill_value=0)
                
                # Scale using C2 scaler
                Xc_scaled = scaler.transform(patient_df)
                
                # Stack scaled clinical with images vector
                X_final = np.hstack([Xc_scaled, img_feat.reshape(1, -1)])
                
                # Make Prediction
                y_pred = model.predict(X_final)[0]
                y_prob = model.predict_proba(X_final)[0][1]

                results[model_name] = {
                    "label": "CKD" if int(y_pred) == 1 else "Non-CKD",
                    "probability": round(float(y_prob) * 100, 2)
                }

            except Exception as e:
                import traceback
                print(f"Error predicting for {model_name} in C2: {e}")
                results[model_name] = {"label": "Error", "probability": 0.0}

        return results

    except Exception as e:
        import traceback
        with open("debug_errors.txt", "a") as f:
            f.write(f"Classifier 2 Global Error: {str(e)}\n{traceback.format_exc()}\n")
        print(f"Classifier 2 error: {str(e)}")
        return {}


def run(config_path: str) -> List[Dict[str, Any]]:
    cfg = load_config(config_path)

    data_cfg = cfg["data"]
    excel_path = data_cfg["excel"]
    id_col = data_cfg["id_column"]
    egfr_col = data_cfg["target_column"]

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
        "age", "gender", "Hypertension", "HBA", "HB", 
        "BMI", "Durationofdiabetes", "OHA", "INSULIN", "CHO", "TRI", "DR_Label", 
        "DR_OD_OS", "EGFR"
    ]
    
    for c in FULL_CLINICAL_COLUMNS:
        if c not in df.columns:
            df[c] = 0.0

    df_original = df.copy()

    # Load classifier models if configured
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
            
    # Load classifier 2 models if configured
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

    print("Encoding clinical features for classifiers...")
    df = encode_clinical_features(df)

    print("Loading Exported MATLAB JSON Models...")
    try:
        exported_matlab_models = load_config(JSON_MODEL_FILE)
    except Exception as e:
        print(f"Warning: Could not load {JSON_MODEL_FILE}: {e}")
        exported_matlab_models = {}
        
    try:
        exported_level2_models = load_config(JSON_LEVEL2_MODEL_FILE)
    except Exception as e:
        print(f"Warning: Could not load {JSON_LEVEL2_MODEL_FILE}: {e}")
        exported_level2_models = {}

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

        # ---------------- LEVEL 1 PIPELINE ----------------
        
        # 1. Run Level 1 Tree to get Level 1 predicted eGFR
        level1_tree_pred = None
        if exported_matlab_models and "Tree" in exported_matlab_models:
            try:
                level1_tree_pred = predict_json_model("Tree", exported_matlab_models["Tree"], patient_original, is_level2=False)
            except Exception as e:
                print(f"Warning: Level 1 JSON Model Tree failed: {e}")
                
        # 2. Run Classifier 2 to get Level 1 predicted label (using Level 1 Tree eGFR)
        classifier_2_result = {}
        level1_label_num = 0.0 # Default Non-CKD
        if classifier_2_model is not None and classifier_2_scaler is not None and classifier_2_clinical_cols is not None and level1_tree_pred is not None:
            image_paths = []
            if "image_path" in patient_original and patient_original["image_path"]:
                image_paths = [patient_original["image_path"]] if isinstance(patient_original["image_path"], str) else patient_original["image_path"]
            elif "image_paths" in patient_original and patient_original["image_paths"]:
                image_paths = patient_original["image_paths"] if isinstance(patient_original["image_paths"], list) else [patient_original["image_paths"]]
            elif discovered_images:
                image_paths = discovered_images
                
            # Create a dictionary with just the Tree prediction to pass to C2
            c2_input_preds = {"Tree": level1_tree_pred}
                
            classifier_2_result = run_classifier_2(
                patient_original,
                list(classifier_2_clinical_cols),
                classifier_2_model,
                classifier_2_scaler,
                c2_input_preds,
                image_paths if image_paths else None
            )
            
            # Extract the raw 1.0 or 0.0 output from C2 for the Tree model
            c2_tree_res = classifier_2_result.get("Tree", {})
            c2_label_str = c2_tree_res.get("label", "Non-CKD")
            level1_label_num = 1.0 if c2_label_str == "CKD" else 0.0

        # Run Classifier 1 (Independent)
        classifier_1_result = None
        if classifier_1_model is not None and classifier_1_scaler is not None and classifier_1_clinical_cols is not None:
            image_paths = []
            if "image_path" in patient_original and patient_original["image_path"]:
                image_paths = [patient_original["image_path"]] if isinstance(patient_original["image_path"], str) else patient_original["image_path"]
            elif "image_paths" in patient_original and patient_original["image_paths"]:
                image_paths = patient_original["image_paths"] if isinstance(patient_original["image_paths"], list) else [patient_original["image_paths"]]
            elif discovered_images:
                image_paths = discovered_images

            classifier_1_result = run_classifier_1(
                patient_original,
                list(classifier_1_clinical_cols), 
                classifier_1_model,
                classifier_1_scaler,
                image_paths if image_paths else None
            )

        # ---------------- LEVEL 2 PIPELINE ----------------
        
        # Process the newly exported regression models over raw features + level 1 predictions
        if exported_level2_models and level1_tree_pred is not None:
            for model_name in LEVEL2_REGRESSION_MODELS:
                if model_name in exported_level2_models:
                    try:
                        pred = predict_json_model(
                            model_name, 
                            exported_level2_models[model_name], 
                            patient_original, 
                            is_level2=True,
                            level1_egfr=level1_tree_pred,
                            level1_label=level1_label_num
                        )
                        predictions_dict[model_name] = pred
                        if has_actual:
                            errors_dict[model_name] = round(pred - actual, 2)
                    except Exception as e:
                        import traceback
                        traceback.print_exc()
                        print(f"Warning: Level 2 JSON Model {model_name} failed: {e}")

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

        # Map Classifier 2 results using the newly computed predictions
        if "Classifier2" in entry and entry["Classifier2"]:
            c2_out = {}
            for model_lbl, c2_data in entry["Classifier2"].items():
                c2_out[model_lbl] = {
                    "label": c2_data.get("label", "Not Available"),
                    "probability": float(c2_data.get("probability", 0.0))
                }
            converted_entry["Classifier2"] = c2_out
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
