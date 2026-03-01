import joblib
import json
import traceback
import sys
import numpy.core
sys.modules['numpy._core'] = numpy.core

print("Testing Classifier 1 loading")
try:
    classifier_1_clinical_cols = joblib.load("backend/models/Classifier1/CKD_Clinical_Cols.pkl")
    classifier_1_model = joblib.load("backend/models/Classifier1/CKD_ResNet_XGB_Model.pkl")
    classifier_1_scaler = joblib.load("backend/models/Classifier1/CKD_Scaler.pkl")
    print("Loaded successfully")
    print(classifier_1_clinical_cols)
except Exception as e:
    print(f"Failed: {e}")
    traceback.print_exc()
