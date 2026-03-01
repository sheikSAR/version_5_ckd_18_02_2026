import traceback
from backend.prediction import run

try:
    results = run('user_sessions/user1/session_01_03_2026_20_36_59/output/prediction_config.json')
    print('Classifier2:', results['hehe']['Classifier2'])
except Exception as e:
    traceback.print_exc()
