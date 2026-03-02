import sys
import os
import json
sys.path.append(r"e:\ckd\Version_4_CKD\version4_ckd")

from backend.prediction import predict_json_model

patient_data = {
  "ID": "ckd0012",
  "NAME": "patient",
  "age": 67,
  "gender": "F",
  "Hypertension": 1,
  "HBA": 8.1,
  "HB": 10.7,
  "BMI": 28.19,
  "Durationofdiabetes": 27.4,
  "OHA": 1,
  "INSULIN": 1,
  "CHO": 91,
  "TRI": 86,
  "DR_Label": 1,
  "DR_OD_DR_OS": 1
}

try:
    with open(r"e:\ckd\Version_4_CKD\version4_ckd\backend\models\MatlabTrained\CKD_Exported_Models.json", "r") as f:
        models = json.load(f)
    result = predict_json_model("Tree", models["Tree"], patient_data)
    print("Tree prediction (ckd0012 precise payload):", result)
except Exception as e:
    print(f"Error: {e}")
