import pickle

with open(r'e:\ckd\Version_4_CKD\version4_ckd\backend\models\classifier2\2802CKD_Clinical_Cols.pkl', 'rb') as f:
    cols = pickle.load(f)

print("Columns:", list(cols))
