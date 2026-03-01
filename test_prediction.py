import json
from backend.prediction import run

print("Testing prediction run...")
try:
    results = run("user_sessions/user1/session_01_03_2026_20_36_59/output/prediction_config.json")
    print(json.dumps(results, indent=2))
except Exception as e:
    import traceback
    print(f"Error: {e}")
    traceback.print_exc()
