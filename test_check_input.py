import os
import glob
import json

sessions_dir = r"e:\ckd\Version_4_CKD\version4_ckd\user_sessions"
all_initial_data = glob.glob(os.path.join(sessions_dir, "*", "*", "input", "initial_data.json"))

all_initial_data.sort(key=os.path.getmtime, reverse=True)

with open(r"e:\ckd\Version_4_CKD\version4_ckd\test_check_all.txt", "w") as out:
    for path in all_initial_data[:15]:
        out.write(f"--- File: {path} ---\n")
        with open(path, "r") as f:
            data = json.load(f)
            try:
                d = data[0] if isinstance(data, list) else data
                out.write(json.dumps(d) + "\n\n")
            except:
                out.write("Could not parse " + path + "\n")
