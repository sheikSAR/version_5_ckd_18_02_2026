import json

path = r"e:\ckd\Version_4_CKD\version4_ckd\backend\outputs\EGFR_AllPatients_Predictions.json"
with open(path, "r") as f:
    data = json.load(f)

found = False
for p in data:
    if p.get("Patient_ID") == "CKD1_0002":
        print(json.dumps(p, indent=2))
        found = True

if not found:
    print("CKD1_0002 not found in predictions JSON.")
