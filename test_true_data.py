import sys
import os
import json
sys.path.append(r"e:\ckd\Version_4_CKD\version4_ckd")

from backend.prediction import predict_json_model

patient_data_true = {
  "ID": "CKD1_0002",
  "age": 67.0,
  "gender": 1.0,         # Fixed gender float mapping
  "Hypertension": 1.0,
  "HBA": 8.1,
  "HB": 10.7,
  "BMI": 28.19,
  "Durationofdiabetes": 27.4,
  "OHA": 1.0,
  "INSULIN": 1.0,
  "CHO": 91.0,
  "TRI": 86.0,
  "DR_OD_OS": 1.0,    # Fixed DR_OD_OS mapping
  "DR_Label": 1.0
}

try:
    with open(r"e:\ckd\Version_4_CKD\version4_ckd\backend\models\MatlabTrained\CKD_Exported_Models.json", "r") as f:
        models = json.load(f)
    print("True Data Prediction:", predict_json_model("Tree", models["Tree"], patient_data_true))
except Exception as e:
    print(f"Error: {e}")
