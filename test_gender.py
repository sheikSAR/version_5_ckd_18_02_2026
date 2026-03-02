import sys
import os
import json
sys.path.append(r"e:\ckd\Version_4_CKD\version4_ckd")

from backend.prediction import predict_json_model

# Simulate create_dataset.py passing raw float for Female
patient_data_dataset = {
  "ID": "CKD1_0002",
  "age": 67.0,
  "gender": 1.0,  # Float from excel
  "Hypertension": 1.0,
  "HBA": 8.1,
  "HB": 10.7,
  "BMI": 28.19,
  "Durationofdiabetes": 27.4,
  "OHA": 1.0,
  "INSULIN": 1.0,
  "CHO": 91.0,
  "TRI": 86.0,
  "DR_OD_DR_OS": 0.0
}

# Simulate UI passing string "F"
patient_data_ui = patient_data_dataset.copy()
patient_data_ui["gender"] = "F"

try:
    with open(r"e:\ckd\Version_4_CKD\version4_ckd\backend\models\MatlabTrained\CKD_Exported_Models.json", "r") as f:
        models = json.load(f)
    print("Dataset logic:", predict_json_model("Tree", models["Tree"], patient_data_dataset))
    print("UI logic:", predict_json_model("Tree", models["Tree"], patient_data_ui))
except Exception as e:
    print(f"Error: {e}")
