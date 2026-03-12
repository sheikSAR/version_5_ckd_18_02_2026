import json
from backend.prediction import run

# Because we added classifier_2 to backend.py but not this specific prediction config,
# we need to inject the classifier_2 config into this json before running or just 
# let it run (it will skip Classifier 2 if config is missing, so we must add it).

config_path = r"e:\ckd\Version_4_CKD\version4_ckd\user_sessions\user1\session_10_03_2026_12_37_04\output\prediction_config.json"

with open(config_path, "r") as f:
    cfg = json.load(f)

cfg["classifier_2"] = {
    "Clinical_Cols": "backend/models/classifier2/22new1287CKD_Clinical_Cols.pkl",
    "Model": "backend/models/classifier2/22new1287CKD_ResNet_XGB_Model.pkl",
    "Scaler": "backend/models/classifier2/22new1287CKD_Scaler.pkl"
}

temp_config = "temp_test_cfg.json"
with open(temp_config, "w") as f:
    json.dump(cfg, f)

resp = run(temp_config)
print(resp)
