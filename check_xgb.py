import joblib
import xgboost as xgb
import warnings
warnings.filterwarnings('ignore')

try:
    model = joblib.load(r'e:\ckd\Version_4_CKD\version4_ckd\backend\models\classifier2\2802CKD_ResNet_XGB_Model.pkl')
    with open('xgb_out.txt', 'w') as f:
        f.write("Model loaded successfully\n")
        f.write(f"Type: {type(model)}\n")
        
        if hasattr(model, 'n_features_in_'):
            f.write(f"n_features_in_: {model.n_features_in_}\n")
            
        if hasattr(model, 'feature_names_in_'):
            f.write(f"feature_names_in_: {model.feature_names_in_}\n")
            
        if hasattr(model, 'get_booster'):
            booster = model.get_booster()
            f.write(f"Booster feature names: {booster.feature_names}\n")
            f.write(f"Booster num_features: {booster.num_features}\n")
            
except Exception as e:
    with open('xgb_out.txt', 'w') as f:
        f.write(f"Error: {e}\n")
