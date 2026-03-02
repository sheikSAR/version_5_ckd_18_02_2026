import pandas as pd
import json

EXCEL_PATH = r"e:\ckd\Version_4_CKD\version4_ckd\Matlab Training\EFSD_27022026.xlsx"
df = pd.read_excel(EXCEL_PATH)

print("All columns:")
for i, col in enumerate(df.columns.tolist()):
    print(f"{i}: {col}")

# Look at row 1 (CKD1_0002) for any DR related columns
dr_cols = [c for c in df.columns if "DR" in c.upper()]
print("\nDR related columns:")
for c in dr_cols:
    print(f"{c}: {df.iloc[1][c]}")
