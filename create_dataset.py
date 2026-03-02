import json
import numpy as np
import pandas as pd
import os

EXCEL_PATH = r"e:\ckd\Version_4_CKD\version4_ckd\Matlab Training\EFSD_27022026.xlsx"
JSON_PATH = r"e:\ckd\Version_4_CKD\version4_ckd\backend\models\MatlabTrained\CKD_Exported_Models copy.json"
OUTPUT_PATH = r"e:\ckd\Version_4_CKD\version4_ckd\Matlab Training\EFSD_27022026_with_predicted_label.xlsx"

def load_json(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)

import sys
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from backend.prediction import predict_json_model
def main():
    print(f"Loading data from {EXCEL_PATH}...")
    df = pd.read_excel(EXCEL_PATH)
    
    print(f"Loading models from {JSON_PATH}...")
    models = load_json(JSON_PATH)
    
    if "Tree" not in models:
        print("Error: Tree model not found in the exported JSON!")
        return

    tree_model = models["Tree"]
    matlab_feature_order = [
        "age", "gender", "Durationofdiabetes", "BMI", "Hypertension", 
        "OHA", "INSULIN", "HBA", "CHO", "TRI", "HB", "DR_OD_OS"
    ]
    
    col_map = {c.lower().replace(" ", "").replace("_", ""): c for c in df.columns}
    
    def get_val(row, feat):
        feat_clean = feat.lower().replace(" ", "").replace("_", "")
        if feat_clean in col_map:
            return row[col_map[feat_clean]]
        if feat in row.index:
            return row[feat]
        return 0.0

    predicted_labels = []
    predicted_egfrs = []
    
    print("Computing Tree predictions for each row...")
    for idx, row in df.iterrows():
        patient_features = {}
        for feat in matlab_feature_order:
            patient_features[feat] = get_val(row, feat)
            
        pred_egfr = predict_json_model("Tree", tree_model, patient_features)
        
        # Determine label based on threshold
        label = 1 if pred_egfr < 60 else 0
        predicted_egfrs.append(pred_egfr)
        predicted_labels.append(label)
        
    df["predicted eGFR"] = predicted_egfrs
    df["predicted Label"] = predicted_labels
    
    print(f"Successfully processed {len(df)} rows.")
    print(f"Sample distribution of new 'predicted Label' column: \n{df['predicted Label'].value_counts()}")
    
    print(f"Saving to {OUTPUT_PATH}...")
    df.to_excel(OUTPUT_PATH, index=False)
    print("Done!")

if __name__ == "__main__":
    main()
