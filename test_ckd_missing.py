import sys
import os
import json
sys.path.append(r"e:\ckd\Version_4_CKD\version4_ckd")

from backend.prediction import predict_json_model

# What happens if the user manually inputs Age 55 and Gender M 
# and ALL other expected matlab features are missing?
patient_data = {
    'age': 55.0,
    'gender': 'M',
    # All others are completely missing from the dictionary
    # because the user's manual form used different names like "FastingBloodSugar"
}

try:
    with open(r"e:\ckd\Version_4_CKD\version4_ckd\backend\models\MatlabTrained\CKD_Exported_Models.json", "r") as f:
        models = json.load(f)
    result = predict_json_model("Tree", models["Tree"], patient_data)
    print("Tree prediction (missing fields):", result)
except Exception as e:
    print(f"Error: {e}")
