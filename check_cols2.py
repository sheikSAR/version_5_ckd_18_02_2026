import sys
try:
    import numpy._core
except ImportError:
    import numpy.core
    sys.modules['numpy._core'] = numpy.core
    sys.modules['numpy._core.multiarray'] = numpy.core.multiarray
    sys.modules['numpy._core.umath'] = numpy.core.umath
    sys.modules['numpy._core.numerictypes'] = numpy.core.numerictypes

import joblib

path = "backend/models/classifier2/22new1287CKD_Clinical_Cols.pkl"
try:
    cols = joblib.load(path)
    print("Columns required by Classifier 2:")
    print(cols)
except Exception as e:
    print("Error:", e)
