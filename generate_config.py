import os
import json
from backend.backend import load_config

user_id = "user1"
session_id = "session_01_03_2026_20_36_59"

user_session_path = os.path.join("user_sessions", user_id, session_id)
input_dir = os.path.join(user_session_path, "input")
output_dir = os.path.join(user_session_path, "output")

input_xlsx_path = os.path.join(input_dir, "inputData.xlsx")
base_config = load_config("backend/config.json")
images_dir = os.path.join(input_dir, "images")

config_for_prediction = {
    "data": {
        "excel": input_xlsx_path,
        "id_column": "ID",
        "target_column": "EGFR",
    },
    "classifier_1": base_config.get("classifier_1", {}),
    "classifier_2": base_config.get("classifier_2", {}),
    "images_dir": images_dir,
    "output": {
        "json": os.path.join(output_dir, "predictions.json"),
        "print_progress": True,
    },
}

temp_config_path = os.path.join(output_dir, "prediction_config.json")
with open(temp_config_path, "w") as f:
    json.dump(config_for_prediction, f, indent=2)

print("Generated config")
