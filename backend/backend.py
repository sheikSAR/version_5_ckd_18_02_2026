import os
import json
import shutil
import subprocess
import io
from datetime import datetime
from flask import Flask, request, jsonify
from flask_cors import CORS
import pandas as pd
import joblib
import numpy as np
from backend.preprocess import (
    preprocess_excel_data,
    compute_aggregated_edge_probabilities,
)

app = Flask(__name__)
CORS(app)

SESSIONS_DIR = "configurator_sessions"
USER_SESSIONS_DIR = "user_sessions"

if not os.path.exists(SESSIONS_DIR):
    os.makedirs(SESSIONS_DIR)

if not os.path.exists(USER_SESSIONS_DIR):
    os.makedirs(USER_SESSIONS_DIR)

CREDENTIALS = {
    "user1": {"password": "password123", "role": "user"},
    "admin1": {"password": "password123", "role": "admin"},
    "config1": {"password": "password123", "role": "configurator"},
}


def load_config(path):
    """Load configuration from JSON file."""
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


@app.route("/login", methods=["POST"])
def login():
    data = request.get_json()
    username = data.get("username")
    password = data.get("password")

    if username in CREDENTIALS and CREDENTIALS[username]["password"] == password:
        role = CREDENTIALS[username]["role"]
        return jsonify({"success": True, "role": role})
    else:
        return (
            jsonify({"success": False, "message": "Invalid username or password"}),
            401,
        )


@app.route("/configurator/create-session", methods=["POST"])
def create_session():
    data = request.get_json()
    role = data.get("role")
    mode = data.get("mode")
    input_data = data.get("data", {})

    timestamp = datetime.now().strftime("%d_%m_%Y_%H_%M")
    session_folder = f"{role}_{mode}_{timestamp}"
    session_path = os.path.join(SESSIONS_DIR, session_folder)

    input_dir = os.path.join(session_path, "input")
    output_dir = os.path.join(session_path, "output")

    os.makedirs(input_dir, exist_ok=True)
    os.makedirs(output_dir, exist_ok=True)

    initial_data_path = os.path.join(input_dir, "initial_data.json")
    with open(initial_data_path, "w") as f:
        json.dump(input_data, f, indent=2)

    return jsonify({"success": True, "sessionFolder": session_folder})


@app.route("/configurator/latest-session", methods=["GET"])
def get_latest_session():
    """Get the most recently created configurator session folder."""
    try:
        if not os.path.exists(SESSIONS_DIR):
            return jsonify({"success": False, "error": "No sessions found"}), 404

        # List all session folders
        sessions = [
            d
            for d in os.listdir(SESSIONS_DIR)
            if os.path.isdir(os.path.join(SESSIONS_DIR, d))
        ]

        if not sessions:
            return jsonify({"success": False, "error": "No sessions found"}), 404

        # Sort by modification time and get the most recent
        session_paths = [os.path.join(SESSIONS_DIR, s) for s in sessions]
        latest_session = max(session_paths, key=os.path.getmtime)
        latest_session_folder = os.path.basename(latest_session)

        return jsonify({"success": True, "sessionFolder": latest_session_folder})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/configurator/<config_path>/input/initial_data.json", methods=["GET"])
def get_initial_data(config_path):
    try:
        initial_data_path = os.path.join(
            SESSIONS_DIR, config_path, "input", "initial_data.json"
        )

        if not os.path.exists(initial_data_path):
            return jsonify({"success": False, "error": "File not found"}), 404

        with open(initial_data_path, "r") as f:
            data = json.load(f)

        return jsonify(data)
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/configurator/<config_path>/input/edges_metadata.json", methods=["GET"])
def get_edges_metadata(config_path):
    try:
        edges_metadata_path = os.path.join(
            SESSIONS_DIR, config_path, "input", "edges_metadata.json"
        )

        if not os.path.exists(edges_metadata_path):
            return jsonify({"success": False, "error": "File not found"}), 404

        with open(edges_metadata_path, "r") as f:
            data = json.load(f)

        return jsonify(data)
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/predict", methods=["POST"])
def trigger_prediction():
    """
    Trigger prediction.py execution for a given session.

    Expects:
    - configPath: session folder name

    Returns:
    - success: boolean
    - message: string with status
    """
    try:
        data = request.get_json()
        config_path = data.get("configPath")

        if not config_path:
            return jsonify({"success": False, "error": "configPath is required"}), 400

        session_path = os.path.join(SESSIONS_DIR, config_path)
        input_dir = os.path.join(session_path, "input")
        output_dir = os.path.join(session_path, "output")

        # Check if inputData.xlsx exists
        input_xlsx_path = os.path.join(input_dir, "inputData.xlsx")
        if not os.path.exists(input_xlsx_path):
            return (
                jsonify(
                    {"success": False, "error": "inputData.xlsx not found in session"}
                ),
                404,
            )

        # Load base config to get model paths
        base_config = load_config("backend/config.json")

        # Create config for prediction.py
        config_for_prediction = {
            "data": {
                "excel": input_xlsx_path,
                "id_column": "ID",
                "target_column": "EGFR",
            },
            "classifier_1": base_config.get("classifier_1", {}),
            "classifier_2": base_config.get("classifier_2", {}),
            "output": {
                "json": os.path.join(output_dir, "regressor_predictions.json"),
                "print_progress": True,
            },
        }

        # Save config temporarily
        temp_config_path = os.path.join(output_dir, "prediction_config.json")
        with open(temp_config_path, "w") as f:
            json.dump(config_for_prediction, f, indent=2)

        # Execute prediction in a background thread
        import threading

        def run_prediction():
            try:
                from backend.prediction import run

                run(temp_config_path)
            except Exception as e:
                print(f"Prediction error: {str(e)}")
                import traceback

                traceback.print_exc()

        # Use non-daemon thread so it completes even if Flask restarts
        prediction_thread = threading.Thread(target=run_prediction, daemon=False)
        prediction_thread.start()

        return (
            jsonify(
                {
                    "success": True,
                    "message": "Prediction process started",
                    "sessionFolder": config_path,
                }
            ),
            200,
        )

    except Exception as e:
        return jsonify({"success": False, "error": f"Server error: {str(e)}"}), 500


@app.route("/api/check-predictions", methods=["GET"])
def check_predictions():
    """
    Check if regressor_predictions.json exists for a session.

    Query params:
    - configPath: session folder name

    Returns:
    - success: boolean
    - exists: boolean indicating if predictions file exists
    """
    try:
        config_path = request.args.get("configPath")

        if not config_path:
            return jsonify({"success": False, "error": "configPath is required"}), 400

        predictions_path = os.path.join(
            SESSIONS_DIR, config_path, "output", "regressor_predictions.json"
        )
        exists = os.path.exists(predictions_path)

        return jsonify({"success": True, "exists": exists}), 200

    except Exception as e:
        return jsonify({"success": False, "error": f"Server error: {str(e)}"}), 500


@app.route(
    "/configurator/<config_path>/output/regressor_predictions.json", methods=["GET"]
)
def get_predictions(config_path):
    """Get the regressor predictions JSON file."""
    try:
        predictions_path = os.path.join(
            SESSIONS_DIR, config_path, "output", "regressor_predictions.json"
        )

        if not os.path.exists(predictions_path):
            return (
                jsonify({"success": False, "error": "Predictions file not found"}),
                404,
            )

        with open(predictions_path, "r") as f:
            data = json.load(f)

        return jsonify(data)
    except json.JSONDecodeError as e:
        print(f"JSON decode error in {predictions_path}: {str(e)}")
        return (
            jsonify({"success": False, "error": f"Invalid predictions JSON: {str(e)}"}),
            500,
        )
    except Exception as e:
        print(f"Error reading predictions {predictions_path}: {str(e)}")
        import traceback

        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/configurator/<config_path>/output/patients.json", methods=["GET"])
def get_patients_list(config_path):
    """Get the list of patient IDs from the generated predictions."""
    try:
        patients_path = os.path.join(
            SESSIONS_DIR, config_path, "output", "patients.json"
        )

        if not os.path.exists(patients_path):
            return (
                jsonify({"success": False, "error": "Patients list not found"}),
                404,
            )

        with open(patients_path, "r") as f:
            data = json.load(f)

        return jsonify(data)
    except json.JSONDecodeError as e:
        print(f"JSON decode error in {patients_path}: {str(e)}")
        return (
            jsonify({"success": False, "error": f"Invalid patients JSON: {str(e)}"}),
            500,
        )
    except Exception as e:
        print(f"Error reading patients {patients_path}: {str(e)}")
        import traceback

        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/user-sessions/<user_id>/list-sessions", methods=["GET"])
def list_user_sessions(user_id):
    """List all sessions for a user with metadata, sorted by date (newest first)."""
    try:
        user_path = os.path.join(USER_SESSIONS_DIR, user_id)

        if not os.path.exists(user_path):
            return jsonify({"success": True, "sessions": []}), 200

        sessions = []
        for folder_name in os.listdir(user_path):
            folder_path = os.path.join(user_path, folder_name)
            if not os.path.isdir(folder_path):
                continue

            metadata_path = os.path.join(folder_path, "metadata.json")
            predictions_path = os.path.join(folder_path, "output", "predictions.json")

            session_info = {
                "session_id": folder_name,
                "is_bulk": folder_name.startswith("session_bulk_"),
                "has_predictions": os.path.exists(predictions_path),
                "created_at": None,
                "patient_count": 0,
            }

            # Load metadata if available
            if os.path.exists(metadata_path):
                try:
                    with open(metadata_path, "r") as f:
                        meta = json.load(f)
                    session_info["created_at"] = meta.get("created_at")
                    session_info["patient_count"] = meta.get("patient_count", 0)
                except Exception:
                    pass

            # If no created_at from metadata, parse from folder name
            if not session_info["created_at"]:
                try:
                    # Parse from session_DD_MM_YYYY_HH_MM_SS or session_bulk_DD_MM_YYYY_HH_MM_SS
                    parts = folder_name.replace("session_bulk_", "").replace("session_", "")
                    dt = datetime.strptime(parts, "%d_%m_%Y_%H_%M_%S")
                    session_info["created_at"] = dt.isoformat()
                except Exception:
                    session_info["created_at"] = ""

            # If patient_count is 0 but predictions exist, count from predictions
            if session_info["patient_count"] == 0 and session_info["has_predictions"]:
                try:
                    with open(predictions_path, "r") as f:
                        preds = json.load(f)
                    session_info["patient_count"] = len(preds)
                except Exception:
                    pass

            sessions.append(session_info)

        # Sort by created_at descending (newest first)
        sessions.sort(key=lambda s: s.get("created_at", ""), reverse=True)

        return jsonify({"success": True, "sessions": sessions}), 200

    except Exception as e:
        return jsonify({"success": False, "error": f"Server error: {str(e)}"}), 500


@app.route("/user-sessions/create-session", methods=["POST"])
def create_user_session():
    """
    Create a new user session with input/output folders.

    Expects:
    - user_id: string identifier for the user
    - data: list of dicts with clinical patient data (for single or batch patients)

    Returns:
    - success: boolean
    - sessionId: unique session identifier
    """
    try:
        data = request.get_json()
        user_id = data.get("user_id")
        input_data = data.get("data", [])

        if not user_id:
            return jsonify({"success": False, "error": "user_id is required"}), 400

        # Ensure input_data is a list
        if isinstance(input_data, dict):
            input_data = [input_data]

        # Create user-specific directory if it doesn't exist
        user_path = os.path.join(USER_SESSIONS_DIR, user_id)
        os.makedirs(user_path, exist_ok=True)

        # Generate session ID with timestamp
        timestamp = datetime.now().strftime("%d_%m_%Y_%H_%M_%S")
        session_id = f"session_{timestamp}"
        session_path = os.path.join(user_path, session_id)

        # Create input and output directories
        input_dir = os.path.join(session_path, "input")
        output_dir = os.path.join(session_path, "output")

        os.makedirs(input_dir, exist_ok=True)
        os.makedirs(output_dir, exist_ok=True)

        # Save initial data as list
        initial_data_path = os.path.join(input_dir, "initial_data.json")
        with open(initial_data_path, "w") as f:
            json.dump(input_data, f, indent=2)

        # Save session metadata
        metadata = {
            "user_id": user_id,
            "session_id": session_id,
            "created_at": datetime.now().isoformat(),
            "input_data_saved": True,
            "patient_count": len(input_data)
        }
        metadata_path = os.path.join(session_path, "metadata.json")
        with open(metadata_path, "w") as f:
            json.dump(metadata, f, indent=2)

        return jsonify({
            "success": True,
            "sessionId": session_id,
            "userId": user_id
        }), 200

    except Exception as e:
        return jsonify({"success": False, "error": f"Server error: {str(e)}"}), 500


@app.route("/user-sessions/<user_id>/latest-session", methods=["GET"])
def get_latest_user_session(user_id):
    """Get the most recently created user session."""
    try:
        user_path = os.path.join(USER_SESSIONS_DIR, user_id)

        if not os.path.exists(user_path):
            return jsonify({"success": False, "error": "No sessions found for this user"}), 404

        # List all session folders for this user
        sessions = [
            d for d in os.listdir(user_path)
            if os.path.isdir(os.path.join(user_path, d))
        ]

        if not sessions:
            return jsonify({"success": False, "error": "No sessions found"}), 404

        # Sort by modification time and get the most recent
        session_paths = [os.path.join(user_path, s) for s in sessions]
        latest_session_path = max(session_paths, key=os.path.getmtime)
        latest_session_id = os.path.basename(latest_session_path)

        return jsonify({
            "success": True,
            "sessionId": latest_session_id,
            "userId": user_id
        }), 200

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/user-sessions/<user_id>/<session_id>/input/initial_data.json", methods=["GET"])
def get_user_initial_data(user_id, session_id):
    """Get initial data for a user session."""
    try:
        initial_data_path = os.path.join(
            USER_SESSIONS_DIR, user_id, session_id, "input", "initial_data.json"
        )

        if not os.path.exists(initial_data_path):
            return jsonify({"success": False, "error": "File not found"}), 404

        with open(initial_data_path, "r") as f:
            data = json.load(f)

        return jsonify(data)

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/user-sessions/<user_id>/<session_id>/output/predictions.json", methods=["GET"])
def get_user_predictions(user_id, session_id):
    """Get predictions for a user session."""
    try:
        predictions_path = os.path.join(
            USER_SESSIONS_DIR, user_id, session_id, "output", "predictions.json"
        )

        if not os.path.exists(predictions_path):
            return jsonify({"success": False, "error": "Predictions file not found"}), 404

        with open(predictions_path, "r") as f:
            data = json.load(f)

        return jsonify(data)

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/user-sessions/<user_id>/<session_id>/predict", methods=["POST"])
def trigger_user_prediction(user_id, session_id):
    """
    Trigger batch prediction for a user session.

    Expects session to have inputData.xlsx in input folder
    """
    try:
        user_session_path = os.path.join(USER_SESSIONS_DIR, user_id, session_id)
        input_dir = os.path.join(user_session_path, "input")
        output_dir = os.path.join(user_session_path, "output")

        # Check if inputData.xlsx exists
        input_xlsx_path = os.path.join(input_dir, "inputData.xlsx")
        if not os.path.exists(input_xlsx_path):
            return jsonify({
                "success": False,
                "error": "inputData.xlsx not found in session"
            }), 404

        # Load base config
        base_config = load_config("backend/config.json")

        # Get images directory
        images_dir = os.path.join(input_dir, "images")

        # Create config for prediction
        config_for_prediction = {
            "data": {
                "excel": input_xlsx_path,
                "id_column": "ID",
                "target_column": "EGFR",
            },
            "classifier_1": base_config.get("classifier_1", {}),
            "random_forest": base_config.get("random_forest", {}),
            "images_dir": images_dir,
            "output": {
                "json": os.path.join(output_dir, "predictions.json"),
                "print_progress": True,
            },
        }

        # Save config temporarily
        temp_config_path = os.path.join(output_dir, "prediction_config.json")
        with open(temp_config_path, "w") as f:
            json.dump(config_for_prediction, f, indent=2)

        # Execute prediction in background thread
        import threading

        def run_prediction():
            try:
                from backend.prediction import run
                run(temp_config_path)
            except Exception as e:
                print(f"User session prediction error: {str(e)}")
                import traceback
                traceback.print_exc()

        prediction_thread = threading.Thread(target=run_prediction, daemon=False)
        prediction_thread.start()

        return jsonify({
            "success": True,
            "message": "Prediction process started",
            "userId": user_id,
            "sessionId": session_id
        }), 200

    except Exception as e:
        return jsonify({"success": False, "error": f"Server error: {str(e)}"}), 500


@app.route("/user-sessions/<user_id>/<session_id>/check-predictions", methods=["GET"])
def check_user_predictions(user_id, session_id):
    """Check if predictions.json exists for a user session."""
    try:
        predictions_path = os.path.join(
            USER_SESSIONS_DIR, user_id, session_id, "output", "predictions.json"
        )
        exists = os.path.exists(predictions_path)

        return jsonify({
            "success": True,
            "exists": exists,
            "userId": user_id,
            "sessionId": session_id
        }), 200

    except Exception as e:
        return jsonify({"success": False, "error": f"Server error: {str(e)}"}), 500


@app.route("/user-sessions/<user_id>/<session_id>/predict-single", methods=["POST"])
def predict_single_patient(user_id, session_id):
    """
    Handle single patient prediction for a user session.

    Creates an Excel file from the patient data and triggers prediction.
    """
    try:
        user_session_path = os.path.join(USER_SESSIONS_DIR, user_id, session_id)
        input_dir = os.path.join(user_session_path, "input")
        output_dir = os.path.join(user_session_path, "output")

        # Read initial_data.json
        initial_data_path = os.path.join(input_dir, "initial_data.json")
        if not os.path.exists(initial_data_path):
            return jsonify({
                "success": False,
                "error": "Initial data not found in session"
            }), 404

        with open(initial_data_path, "r") as f:
            patient_data_list = json.load(f)

        # Ensure it's a list
        if isinstance(patient_data_list, dict):
            patient_data_list = [patient_data_list]

        # Create DataFrame from patient data
        df = pd.DataFrame(patient_data_list)

        # Save as Excel file
        input_xlsx_path = os.path.join(input_dir, "inputData.xlsx")
        df.to_excel(input_xlsx_path, index=False)

        # Load base config
        base_config = load_config("backend/config.json")

        # Get images directory
        images_dir = os.path.join(input_dir, "images")

        # Create config for prediction
        config_for_prediction = {
            "data": {
                "excel": input_xlsx_path,
                "id_column": "ID",
                "target_column": "EGFR",
            },
            "classifier_1": base_config.get("classifier_1", {}),
            "random_forest": base_config.get("random_forest", {}),
            "images_dir": images_dir,
            "output": {
                "json": os.path.join(output_dir, "predictions.json"),
                "print_progress": True,
            },
        }

        # Save config temporarily
        temp_config_path = os.path.join(output_dir, "prediction_config.json")
        with open(temp_config_path, "w") as f:
            json.dump(config_for_prediction, f, indent=2)

        # Execute prediction in background thread
        import threading

        def run_prediction():
            try:
                from backend.prediction import run
                run(temp_config_path)
            except Exception as e:
                print(f"Single patient prediction error: {str(e)}")
                import traceback
                traceback.print_exc()
                with open(os.path.join(output_dir, "debug_trace.txt"), "w") as dbg:
                    dbg.write(f"Single patient prediction error: {str(e)}\n")
                    dbg.write(traceback.format_exc())

        prediction_thread = threading.Thread(target=run_prediction, daemon=False)
        prediction_thread.start()

        return jsonify({
            "success": True,
            "message": "Single patient prediction process started",
            "userId": user_id,
            "sessionId": session_id
        }), 200

    except Exception as e:
        return jsonify({"success": False, "error": f"Server error: {str(e)}"}), 500


@app.route("/user-sessions/<user_id>/upload", methods=["POST"])
def upload_user_file(user_id):
    """
    Handle file upload for user sessions.

    Expects:
    - file: Excel file with clinical data
    - image_*: image files (image_1, image_2, etc.) for classification
    - user_id: user identifier
    - session_id: session identifier (optional, generates one if not provided)

    Returns:
    - success: boolean
    - sessionId: the session ID where file was uploaded
    - imagesUploaded: number of images saved
    """
    try:
        session_id = request.form.get("session_id")
        
        # Check if this is an image-only upload for an existing session
        is_image_only = "file" not in request.files and session_id and any(k.startswith('image_') for k in request.files.keys())

        if "file" not in request.files and not is_image_only:
            return jsonify({"success": False, "error": "No file provided"}), 400

        file = request.files.get("file")
        if file and file.filename == "":
            return jsonify({"success": False, "error": "No file selected"}), 400

        # Generate session ID if not provided
        if not session_id:
            timestamp = datetime.now().strftime("%d_%m_%Y_%H_%M_%S")
            session_id = f"session_{timestamp}"

        # Validate file type if file is provided
        if file:
            filename = file.filename.lower()
            if not filename.endswith((".xlsx", ".xls")):
                return jsonify({
                    "success": False,
                    "error": "Only Excel files (.xlsx, .xls) are supported"
                }), 400

        # Create session directories
        user_path = os.path.join(USER_SESSIONS_DIR, user_id)
        session_path = os.path.join(user_path, session_id)
        input_dir = os.path.join(session_path, "input")
        output_dir = os.path.join(session_path, "output")
        images_dir = os.path.join(input_dir, "images")

        os.makedirs(input_dir, exist_ok=True)
        os.makedirs(output_dir, exist_ok=True)
        os.makedirs(images_dir, exist_ok=True)

        # Save Excel file if provided
        if file:
            try:
                file_content = file.read()
                df = pd.read_excel(io.BytesIO(file_content))

                # Save processed data as JSON
                initial_data_path = os.path.join(input_dir, "initial_data.json")
                processed_rows = preprocess_excel_data(df)

                from backend.preprocess import add_chained_probabilities
                processed_rows_with_probs = [
                    add_chained_probabilities(record, df) for record in processed_rows
                ]

                with open(initial_data_path, "w") as f:
                    json.dump(processed_rows_with_probs, f, indent=2)

                # Save original Excel file
                input_xlsx_path = os.path.join(input_dir, "inputData.xlsx")
                df.to_excel(input_xlsx_path, index=False)
            except ValueError as e:
                return jsonify({"success": False, "error": str(e)}), 400
            except Exception as e:
                 return jsonify({
                    "success": False,
                    "error": f"File processing failed: {str(e)}"
                }), 400

        # Handle image uploads
        images_uploaded = 0
        image_files_list = []

        for key in request.files.keys():
            if key.startswith('image_'):
                image_file = request.files[key]
                if image_file and image_file.filename != "":
                    try:
                        # Generate unique filename
                        ext = os.path.splitext(image_file.filename)[1] or ".jpg"
                        image_filename = f"image_{images_uploaded + 1}{ext}"
                        image_path = os.path.join(images_dir, image_filename)

                        # Save image file
                        image_file.save(image_path)
                        image_files_list.append(image_path)
                        images_uploaded += 1
                    except Exception as e:
                        print(f"Warning: Could not save image: {str(e)}")

        # Save session metadata with image information
        metadata = {
            "user_id": user_id,
            "session_id": session_id,
            "created_at": datetime.now().isoformat(),
            "input_data_saved": True,
            "file_uploaded": True,
            "images_uploaded": images_uploaded,
            "image_files": image_files_list
        }
        metadata_path = os.path.join(session_path, "metadata.json")
        with open(metadata_path, "w") as f:
            json.dump(metadata, f, indent=2)

        return jsonify({
            "success": True,
            "message": "File uploaded successfully",
            "sessionId": session_id,
            "userId": user_id,
            "imagesUploaded": images_uploaded
        }), 200

    except Exception as e:
        return jsonify({"success": False, "error": f"Server error: {str(e)}"}), 500


@app.route("/api/validate-bulk-data", methods=["POST"])
def validate_bulk_data():
    """
    Validate bulk upload data (Excel) + check local image directory.
    Returns warnings (for Excel NaNs) and errors (for missing images).
    """
    try:
        # 1. Parse request
        if "file" not in request.files:
            return jsonify({"success": False, "error": "No Excel file provided"}), 400
            
        file = request.files["file"]
        if file.filename == "":
            return jsonify({"success": False, "error": "No file selected"}), 400
            
        image_folder_path = request.form.get("image_folder_path")
        image_filenames_json = request.form.get("image_filenames")
        
        if not image_folder_path and not image_filenames_json:
            return jsonify({"success": False, "error": "No image folder path or image metadata provided"}), 400
            
        if image_folder_path:
            if not os.path.exists(image_folder_path) or not os.path.isdir(image_folder_path):
                return jsonify({"success": False, "error": f"Image folder path does not exist or is not a directory: {image_folder_path}"}), 400

        # 2. Read Excel
        try:
            file_content = file.read()
            df = pd.read_excel(io.BytesIO(file_content))
            
            # Ensure ID column exists
            id_col = "ID"
            if id_col not in df.columns:
                # Try finding case-insensitive 'id'
                cols_lower = {c.lower(): c for c in df.columns}
                if 'id' in cols_lower:
                    df = df.rename(columns={cols_lower['id']: "ID"})
                else:
                    return jsonify({"success": False, "error": "Excel file must contain an 'ID' column"}), 400
                    
        except Exception as e:
            return jsonify({"success": False, "error": f"Failed to read Excel file: {str(e)}"}), 400

        warnings = []
        errors = []

        # 3. Check for NaNs
        for index, row in df.iterrows():
            # Check if there are any na values in the row
            if row.isna().any():
                patient_id = row.get("ID")
                patient_id_str = "Unknown ID" if pd.isna(patient_id) else str(patient_id)
                
                # Find which specific columns are NaN for this patient
                missing_cols = row.index[row.isna()].tolist()
                if missing_cols:
                    warnings.append(f"Patient {patient_id_str}: Missing values in columns: {', '.join(missing_cols)}")

        # 4. Check images for each ID
        patient_ids = df["ID"].dropna().astype(str).tolist()
        
        # Get all files either from directory or from JSON list
        try:
            if image_folder_path:
                all_files = os.listdir(image_folder_path)
            else:
                all_files = json.loads(image_filenames_json)
            # Use just the basename for matching if it includes paths
            all_files_lower = {os.path.basename(f).lower(): os.path.basename(f) for f in all_files}
        except Exception as e:
            return jsonify({"success": False, "error": f"Failed to retrieve image list: {str(e)}"}), 400

        for pid in patient_ids:
            # We accept id_1.jpg, id_2.png, id(1).jpg, etc.
            # Looking for variations of pid + separator + number
            pid_lower = str(pid).lower()
            
            patient_images = []
            for f_lower, f_actual in all_files_lower.items():
                # Check extensions
                if not f_lower.endswith(('.jpg', '.jpeg', '.png')):
                    continue
                    
                filename_no_ext = os.path.splitext(f_lower)[0]
                
                # Check matching patterns: pid_1, pid(1), pid-1
                if filename_no_ext.startswith(f"{pid_lower}_") or \
                   filename_no_ext.startswith(f"{pid_lower}(") or \
                   filename_no_ext.startswith(f"{pid_lower}-"):
                    patient_images.append(f_actual)
            
            img_count = len(patient_images)
            if img_count == 0:
                errors.append(f"Patient {pid}: No images found. Expected files like {pid}_1.jpg or {pid}(1).png")
            elif img_count > 4:
                warnings.append(f"Patient {pid}: Found {img_count} images, but maximum is 4. Only first 4 will be used.")

        return jsonify({
            "success": True, 
            "warnings": warnings, 
            "errors": errors,
            "patient_count": len(patient_ids)
        }), 200

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"success": False, "error": f"Validation failed: {str(e)}"}), 500


@app.route("/user-sessions/<user_id>/upload-bulk-local", methods=["POST"])
def upload_bulk_local(user_id):
    """
    Handle bulk file upload for user sessions using a local directory for images.
    Creates a session, saves Excel, and copies local images to the session.
    """
    try:
        # 1. Parse request
        if "file" not in request.files:
            return jsonify({"success": False, "error": "No file provided"}), 400
            
        file = request.files["file"]
        if file.filename == "":
            return jsonify({"success": False, "error": "No file selected"}), 400
            
        image_folder_path = request.form.get("image_folder_path")
        if not image_folder_path:
            return jsonify({"success": False, "error": "No image folder path provided"}), 400
            
        if not os.path.exists(image_folder_path) or not os.path.isdir(image_folder_path):
            return jsonify({"success": False, "error": f"Image folder path does not exist or is not a directory: {image_folder_path}"}), 400

        # Generate session ID
        timestamp = datetime.now().strftime("%d_%m_%Y_%H_%M_%S")
        session_id = f"session_bulk_{timestamp}"

        # Create session directories
        user_path = os.path.join(USER_SESSIONS_DIR, user_id)
        session_path = os.path.join(user_path, session_id)
        input_dir = os.path.join(session_path, "input")
        output_dir = os.path.join(session_path, "output")
        images_dir = os.path.join(input_dir, "images")

        os.makedirs(input_dir, exist_ok=True)
        os.makedirs(output_dir, exist_ok=True)
        os.makedirs(images_dir, exist_ok=True)

        # 2. Process Excel
        try:
            file_content = file.read()
            df = pd.read_excel(io.BytesIO(file_content))
            
            # Ensure ID column
            id_col = "ID"
            if id_col not in df.columns:
                cols_lower = {c.lower(): c for c in df.columns}
                if 'id' in cols_lower:
                    df = df.rename(columns={cols_lower['id']: "ID"})
                else:
                    return jsonify({"success": False, "error": "Excel file must contain an 'ID' column"}), 400

            # Preprocess and save JSON
            initial_data_path = os.path.join(input_dir, "initial_data.json")
            processed_rows = preprocess_excel_data(df)

            from backend.preprocess import add_chained_probabilities
            processed_rows_with_probs = [
                add_chained_probabilities(record, df) for record in processed_rows
            ]

            with open(initial_data_path, "w") as f:
                json.dump(processed_rows_with_probs, f, indent=2)

            # Save original Excel
            input_xlsx_path = os.path.join(input_dir, "inputData.xlsx")
            df.to_excel(input_xlsx_path, index=False)
            
        except ValueError as e:
            return jsonify({"success": False, "error": str(e)}), 400
        except Exception as e:
            import traceback
            traceback.print_exc()
            return jsonify({"success": False, "error": f"File processing failed: {str(e)}"}), 400

        # 3. Copy Images
        patient_ids = df["ID"].dropna().astype(str).tolist()
        all_files = os.listdir(image_folder_path)
        all_files_lower = {f.lower(): f for f in all_files}
        
        images_copied = 0
        image_files_list = []

        for pid in patient_ids:
            pid_lower = str(pid).lower()
            copied_for_patient = 0
            
            for f_lower, f_actual in all_files_lower.items():
                if copied_for_patient >= 4:
                    break # Max 4 per patient
                    
                if not f_lower.endswith(('.jpg', '.jpeg', '.png')):
                    continue
                    
                filename_no_ext = os.path.splitext(f_lower)[0]
                
                if filename_no_ext.startswith(f"{pid_lower}_") or \
                   filename_no_ext.startswith(f"{pid_lower}(") or \
                   filename_no_ext.startswith(f"{pid_lower}-"):
                    
                    src_path = os.path.join(image_folder_path, f_actual)
                    
                    # Target path will be simply copied over, keeping original name
                    # Or we could rename them to standardize if needed, but prediction pipeline
                    # might just search for patient ID in the filename.
                    dst_path = os.path.join(images_dir, f_actual)
                    
                    try:
                        shutil.copy2(src_path, dst_path)
                        image_files_list.append(dst_path)
                        images_copied += 1
                        copied_for_patient += 1
                    except Exception as e:
                        print(f"Warning: Could not copy image {src_path}: {e}")

        # 4. Save Metadata
        metadata = {
            "user_id": user_id,
            "session_id": session_id,
            "created_at": datetime.now().isoformat(),
            "input_data_saved": True,
            "file_uploaded": True,
            "images_uploaded": images_copied,
            "image_files": image_files_list,
            "patient_count": len(patient_ids),
            "is_bulk": True
        }
        metadata_path = os.path.join(session_path, "metadata.json")
        with open(metadata_path, "w") as f:
            json.dump(metadata, f, indent=2)

        return jsonify({
            "success": True,
            "message": "Bulk session created successfully",
            "sessionId": session_id,
            "userId": user_id,
            "imagesCopied": images_copied,
            "patients": len(patient_ids)
        }), 200

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"success": False, "error": f"Server error: {str(e)}"}), 500


@app.route("/user-sessions/<user_id>/upload-bulk-files", methods=["POST"])
def upload_bulk_files(user_id):
    """
    Handle bulk file upload for user sessions with uploaded image files.
    Creates a session, saves Excel, and saves the uploaded images.
    """
    try:
        # 1. Parse request
        if "file" not in request.files:
            return jsonify({"success": False, "error": "No file provided"}), 400
            
        file = request.files["file"]
        if file.filename == "":
            return jsonify({"success": False, "error": "No file selected"}), 400

        # Generate session ID
        timestamp = datetime.now().strftime("%d_%m_%Y_%H_%M_%S")
        session_id = f"session_bulk_{timestamp}"

        # Create session directories
        user_path = os.path.join(USER_SESSIONS_DIR, user_id)
        session_path = os.path.join(user_path, session_id)
        input_dir = os.path.join(session_path, "input")
        output_dir = os.path.join(session_path, "output")
        images_dir = os.path.join(input_dir, "images")

        os.makedirs(input_dir, exist_ok=True)
        os.makedirs(output_dir, exist_ok=True)
        os.makedirs(images_dir, exist_ok=True)

        # 2. Process Excel
        try:
            file_content = file.read()
            df = pd.read_excel(io.BytesIO(file_content))
            
            # Ensure ID column
            id_col = "ID"
            if id_col not in df.columns:
                cols_lower = {c.lower(): c for c in df.columns}
                if 'id' in cols_lower:
                    df = df.rename(columns={cols_lower['id']: "ID"})
                else:
                    return jsonify({"success": False, "error": "Excel file must contain an 'ID' column"}), 400

            # Preprocess and save JSON
            initial_data_path = os.path.join(input_dir, "initial_data.json")
            processed_rows = preprocess_excel_data(df)

            from backend.preprocess import add_chained_probabilities
            processed_rows_with_probs = [
                add_chained_probabilities(record, df) for record in processed_rows
            ]

            with open(initial_data_path, "w") as f:
                json.dump(processed_rows_with_probs, f, indent=2)

            # Save original Excel
            input_xlsx_path = os.path.join(input_dir, "inputData.xlsx")
            df.to_excel(input_xlsx_path, index=False)
            
        except ValueError as e:
            return jsonify({"success": False, "error": str(e)}), 400
        except Exception as e:
            import traceback
            traceback.print_exc()
            return jsonify({"success": False, "error": f"File processing failed: {str(e)}"}), 400

        # 3. Save Uploaded Images
        patient_ids = df["ID"].dropna().astype(str).tolist()
        
        images_saved = 0
        image_files_list = []

        # The files will come as 'bulk_image_0', 'bulk_image_1', etc.
        for key in request.files.keys():
            if key.startswith('bulk_image_'):
                img_file = request.files[key]
                if img_file and img_file.filename != "":
                    # Get just the basename
                    basename = os.path.basename(img_file.filename)
                    dst_path = os.path.join(images_dir, basename)
                    try:
                        img_file.save(dst_path)
                        image_files_list.append(dst_path)
                        images_saved += 1
                    except Exception as e:
                        print(f"Warning: Could not save image {basename}: {e}")

        # 4. Save Metadata
        metadata = {
            "user_id": user_id,
            "session_id": session_id,
            "created_at": datetime.now().isoformat(),
            "input_data_saved": True,
            "file_uploaded": True,
            "images_uploaded": images_saved,
            "image_files": image_files_list,
            "patient_count": len(patient_ids),
            "is_bulk": True
        }
        metadata_path = os.path.join(session_path, "metadata.json")
        with open(metadata_path, "w") as f:
            json.dump(metadata, f, indent=2)

        return jsonify({
            "success": True,
            "message": "Bulk session created and files uploaded successfully",
            "sessionId": session_id,
            "userId": user_id,
            "imagesCopied": images_saved,
            "patients": len(patient_ids)
        }), 200

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"success": False, "error": f"Server error: {str(e)}"}), 500


@app.route("/api/upload", methods=["POST"])
def upload_file():
    """
    Handle file upload and preprocessing.

    Accepts:
    - file: multipart form file (Excel or JSON)
    - configPath: form parameter with folder name (roleName_mode_DDMMYY_HHMM)

    Returns:
    - success: boolean
    - message: string
    """
    try:
        # Check if file is in request
        if "file" not in request.files:
            return jsonify({"success": False, "error": "No file provided"}), 400

        file = request.files["file"]
        if file.filename == "":
            return jsonify({"success": False, "error": "No file selected"}), 400

        # Get configPath from form data
        config_path = request.form.get("configPath")
        if not config_path:
            return jsonify({"success": False, "error": "configPath is required"}), 400

        # Determine file type
        filename = file.filename.lower()
        is_excel = filename.endswith((".xlsx", ".xls"))
        is_json = filename.endswith(".json")

        if not is_excel and not is_json:
            return (
                jsonify(
                    {
                        "success": False,
                        "error": "File type not supported. Please upload .xlsx, .xls, or .json",
                    }
                ),
                400,
            )

        # Create session directories
        session_path = os.path.join(SESSIONS_DIR, config_path)
        input_dir = os.path.join(session_path, "input")
        output_dir = os.path.join(session_path, "output")

        os.makedirs(input_dir, exist_ok=True)
        os.makedirs(output_dir, exist_ok=True)

        initial_data_path = os.path.join(input_dir, "initial_data.json")

        # Process file based on type
        if is_json:
            # Validate and save JSON
            try:
                json_data = json.loads(file.read().decode("utf-8"))

                # Validate that it's an array of objects
                if not isinstance(json_data, list):
                    return (
                        jsonify(
                            {
                                "success": False,
                                "error": "JSON must be an array of objects",
                            }
                        ),
                        400,
                    )

                # Save JSON
                with open(initial_data_path, "w") as f:
                    json.dump(json_data, f, indent=2)

            except json.JSONDecodeError as e:
                return (
                    jsonify({"success": False, "error": f"Invalid JSON: {str(e)}"}),
                    400,
                )

        elif is_excel:
            # Process Excel file
            try:
                # Read Excel file
                file_content = file.read()
                df = pd.read_excel(io.BytesIO(file_content))

                # Preprocess data
                processed_rows = preprocess_excel_data(df)

                # Add chained probabilities to each patient record
                from backend.preprocess import add_chained_probabilities, encode_clinical_features

                processed_rows_with_probs = [
                    add_chained_probabilities(record, df) for record in processed_rows
                ]

                # Save processed data as JSON
                with open(initial_data_path, "w") as f:
                    json.dump(processed_rows_with_probs, f, indent=2)

                # CRITICAL: Encode the dataframe before computing edge probabilities
                # The dataframe must have encoded feature values (buckets) for group-level computation
                df_encoded = df.copy()
                df_encoded = encode_clinical_features(df_encoded)

                # Compute aggregated edge probabilities for relationship graph
                edges_metadata = compute_aggregated_edge_probabilities(df_encoded)
                edges_metadata_path = os.path.join(input_dir, "edges_metadata.json")
                with open(edges_metadata_path, "w") as f:
                    json.dump(edges_metadata, f, indent=2)

                # Save original Excel file as inputData.xlsx in input folder
                input_xlsx_path = os.path.join(input_dir, "inputData.xlsx")
                df.to_excel(input_xlsx_path, index=False)

            except ValueError as e:
                # Missing required columns or preprocessing error
                return jsonify({"success": False, "error": str(e)}), 400
            except Exception as e:
                return (
                    jsonify(
                        {
                            "success": False,
                            "error": f"Excel processing failed: {str(e)}",
                        }
                    ),
                    400,
                )

        return (
            jsonify(
                {"success": True, "message": "File uploaded and processed successfully"}
            ),
            200,
        )

    except Exception as e:
        return jsonify({"success": False, "error": f"Server error: {str(e)}"}), 500


@app.route("/api/user-predict", methods=["POST"])
def user_predict():
    """
    Handle single-patient prediction for end users.

    Expects:
    - data: JSON string with clinical features
    - image_0, image_1, etc: image files

    Returns:
    - success: boolean
    - predictions: dict with regressor outputs and classifier outputs
    """
    try:
        print("=== User Predict Request Received ===")

        # Extract clinical data
        clinical_data_str = request.form.get('data')
        if not clinical_data_str:
            print("Error: Clinical data is required")
            return jsonify({"success": False, "error": "Clinical data is required"}), 400

        try:
            clinical_data = json.loads(clinical_data_str)
            print(f"Clinical data received: {list(clinical_data.keys())}")
        except json.JSONDecodeError as e:
            print(f"Error parsing clinical data: {e}")
            return jsonify({"success": False, "error": "Invalid clinical data JSON"}), 400

        # Extract image files
        image_files = []
        for key in request.files.keys():
            if key.startswith('image_'):
                image_files.append(request.files[key])
        print(f"Image files received: {len(image_files)}")

        # Load models
        try:
            print("Loading models from config...")
            base_config = load_config("backend/config.json")
            sklearn_models_cfg = base_config.get("sklearn_models", {})
            matlab_models_cfg = base_config.get("matlab_models", {})
            print(f"SKLearn models in config: {list(sklearn_models_cfg.keys())}")
            print(f"MATLAB models in config: {list(matlab_models_cfg.keys())}")
        except Exception as e:
            print(f"Error loading config: {e}")
            return jsonify({"success": False, "error": f"Configuration error: {str(e)}"}), 500

        # Load sklearn models
        sklearn_models = {}
        for name, path in sklearn_models_cfg.items():
            try:
                print(f"Loading sklearn model: {name} from {path}")
                sklearn_models[name] = joblib.load(path)
            except Exception as e:
                print(f"Warning: Could not load sklearn model {name}: {e}")

        # Load MATLAB models
        matlab_models = {}
        for name, path in matlab_models_cfg.items():
            try:
                print(f"Loading MATLAB model: {name} from {path}")
                matlab_models[name] = json.load(open(path, "r", encoding="utf-8"))
            except Exception as e:
                print(f"Warning: Could not load MATLAB model {name}: {e}")

        # Import prediction helpers
        from backend.prediction import predict_simple, predict_standardized, SKLEARN_NAME_MAP, MATLAB_NAME_MAP

        # These are the EXACT columns the models were trained with (from batch pipeline)
        # Must match SKLEARN_REQUIRED_COLUMNS in backend/prediction.py
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
            "DR_OD_OS",
            "CKD_Stage",
            "DR_Stage",
        ]

        # Create a DataFrame for the patient with defaults for all required columns
        patient_data = {col: clinical_data.get(col, 0.0) for col in SKLEARN_REQUIRED_COLUMNS}

        # Ensure all values are numeric (same preprocessing as batch pipeline)
        # SPECIAL HANDLING: gender must be converted from M/F strings to numeric values
        # This matches the encode_clinical_features function behavior
        for col in SKLEARN_REQUIRED_COLUMNS:
            val = patient_data[col]

            # Special case: gender encoding (M/Male -> 0.0, F/Female -> 1.0)
            if col == "gender" and isinstance(val, str):
                if val.upper() in ['M', 'MALE']:
                    patient_data[col] = 0.0
                elif val.upper() in ['F', 'FEMALE']:
                    patient_data[col] = 1.0
                else:
                    patient_data[col] = float(val)  # Try to convert if it's numeric string
            elif isinstance(val, str):
                try:
                    patient_data[col] = float(val)
                except ValueError:
                    patient_data[col] = 0.0
            else:
                patient_data[col] = float(val) if val is not None else 0.0

        # CRITICAL: Keep original unencoded patient data for sklearn/MATLAB models
        # From batch pipeline: "These models were trained on continuous/original values, NOT encoded categorical values"
        patient_series = pd.Series(patient_data)

        # Build DataFrame for sklearn models with correct column order and values
        # IMPORTANT: Do NOT encode the data - models were trained on unencoded values
        X_patient = pd.DataFrame([patient_data])[SKLEARN_REQUIRED_COLUMNS]

        # Get sklearn predictions using UNENCODED data (same as batch pipeline)
        predictions_dict = {}
        for sklearn_name, sklearn_model in sklearn_models.items():
            out_name = SKLEARN_NAME_MAP[sklearn_name]
            pred = float(sklearn_model.predict(X_patient)[0])
            predictions_dict[out_name] = round(pred, 2)

        # Predict with MATLAB models using raw unencoded patient data (same as batch pipeline)
        for name, model in matlab_models.items():
            out_name = MATLAB_NAME_MAP[name]
            if name in ["EGFR_FilterModel", "YALMIP_Model"]:
                pred = predict_simple(model, patient_series, "ID", "EGFR")
            else:
                pred = predict_standardized(model, patient_series)
            predictions_dict[out_name] = round(pred, 2)

        # ==========================================================
        # RUN ADVANCED CLASSIFIERS
        # ==========================================================
        classifier1_result = None
        classifier2_result = None

        try:
            print("Loading classifier service...")
            from backend.classifier_service import run_classifier_1, run_classifier_2

            # Save images temporarily if needed, or pass file objects if service handles them
            # Converting Flask FileStorage to paths for the service
            temp_image_paths = []
            import tempfile

            if image_files:
                temp_dir = tempfile.mkdtemp()
                for i, img_file in enumerate(image_files):
                    ext = os.path.splitext(img_file.filename)[1] or ".jpg"
                    temp_path = os.path.join(temp_dir, f"temp_img_{i}{ext}")
                    img_file.seek(0) # Reset pointer
                    img_file.save(temp_path)
                    temp_image_paths.append(temp_path)

            try:
                # Classifier 1: Clinical + Image
                print("Running Classifier 1...")
                classifier1_result = run_classifier_1(clinical_data, temp_image_paths)

                # Classifier 2: EGFR-Aware Ensemble
                print("Running Classifier 2...")
                classifier2_result = run_classifier_2(clinical_data, temp_image_paths, predictions_dict)

            finally:
                # Cleanup temp images
                if temp_image_paths:
                    shutil.rmtree(os.path.dirname(temp_image_paths[0]), ignore_errors=True)

        except ImportError as e:
            print(f"Warning: Classifier service not available: {e}")
            # Use fallback classifiers with only predictions
            classifier1_result = {"label": "Unable to determine", "probability": 0.0}
            classifier2_result = {}

        print("=== Prediction successful ===")
        print(f"Predictions generated: {list(predictions_dict.keys())}")

        # Prepare result in the correct format
        patient_id = str(clinical_data.get("ID", "Patient"))
        prediction_result = {
            "Patient_ID": patient_id,
            "Predictions": predictions_dict,
            "Classifier1": classifier1_result or {"label": "Unknown", "probability": 0.0},
            "Classifier2": classifier2_result or {}
        }

        return jsonify({
            "success": True,
            "predictions": prediction_result
        }), 200

    except Exception as e:
        print(f"=== User predict error: {str(e)} ===")
        import traceback
        traceback.print_exc()
        return jsonify({"success": False, "error": f"Prediction failed: {str(e)}"}), 500


if __name__ == "__main__":
    app.run(debug=True, port=5000, use_reloader=False)
