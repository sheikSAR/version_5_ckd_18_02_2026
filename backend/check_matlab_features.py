import json

models = {
    "LASSO": "backend/Matlabjson/LassoModelTestResults29.json",
    "ElasticNet": "backend/Matlabjson/EnetmodeltraintestResults.json", 
    "Ridge": "backend/Matlabjson/ridgemodeltraintestResults29.json"
}

all_features = set()

for name, path in models.items():
    print(f"\n=== {name} ===")
    m = json.load(open(path))
    
    cont = m.get('continuousVars', m.get('continuousvars', []))
    binary = m.get('binaryVars', m.get('binaryvars', []))
    ordinal = m.get('ordinalVars', m.get('ordinalvars', []))
    
    print(f"continuousVars: {cont}")
    print(f"binaryVars: {binary}")
    print(f"ordinalVars: {ordinal}")
    
    all_features.update(cont)
    all_features.update(binary)
    all_features.update(ordinal)

print(f"\n=== ALL UNIQUE FEATURES ===")
print(sorted(all_features))
print(f"Total: {len(all_features)}")
