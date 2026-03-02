import pandas as pd

EXCEL_PATH = r"e:\ckd\Version_4_CKD\version4_ckd\Matlab Training\EFSD_27022026.xlsx"
df = pd.read_excel(EXCEL_PATH)

print(df.head(5)[["Patient ID"] + [c for c in df.columns if c in ["Age", "Gender", "age", "gender"]]])
