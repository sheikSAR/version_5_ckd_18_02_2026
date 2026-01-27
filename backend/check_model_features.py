import joblib

# Load the model
m = joblib.load('backend/models/EGFR_Lasso_model.pkl')
print(f"Model Type: {type(m)}")
print(f"Number of features expected: {m.n_features_in_}")
print(f"\nFeature names ({len(m.feature_names_in_)} total):")
for i, f in enumerate(m.feature_names_in_, 1):
    print(f"  {i}. {f}")
