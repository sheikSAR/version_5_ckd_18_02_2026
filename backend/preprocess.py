import pandas as pd
import numpy as np

required_columns = [
    "ID",
    "age",
    "gender",
    "Hypertension",
    "HBA",
    "HB",
    "DR_OD",
    "DR_SEVERITY_OD",
    "DR_OS",
    "DR_SEVERITY_OS",
    "EGFR",
]


def encode_clinical_features(df):
    age_conditions = [
        df["age"] < 40,
        df["age"] == 40,
        (df["age"] > 40) & (df["age"] <= 45),
        (df["age"] > 45) & (df["age"] <= 50),
        (df["age"] > 50) & (df["age"] <= 55),
        (df["age"] > 55) & (df["age"] <= 60),
        (df["age"] > 60) & (df["age"] <= 65),
        (df["age"] > 65) & (df["age"] <= 70),
        (df["age"] > 70) & (df["age"] <= 75),
        (df["age"] > 75) & (df["age"] <= 78),
        df["age"] > 78,
    ]
    age_values = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

    hb_conditions = [
        df["HB"] <= 9,
        (df["HB"] > 9) & (df["HB"] <= 12),
        (df["HB"] > 12) & (df["HB"] <= 15),
        (df["HB"] > 15) & (df["HB"] <= 18),
        df["HB"] > 18,
    ]
    hb_values = [1, 2, 3, 4, 5]

    hba_conditions = [
        df["HBA"] <= 5,
        (df["HBA"] > 5) & (df["HBA"] <= 10),
        (df["HBA"] > 10) & (df["HBA"] <= 15),
        df["HBA"] > 15,
    ]
    hba_values = [1, 2, 3, 4]

    if "age" in df.columns:
        df["age"] = np.select(age_conditions, age_values)
    if "HB" in df.columns:
        df["HB"] = np.select(hb_conditions, hb_values)
    if "HBA" in df.columns:
        df["HBA"] = np.select(hba_conditions, hba_values)
        
    if "EGFR" in df.columns:
        egfr_conditions = [df["EGFR"] >= 90, df["EGFR"] < 90]
        egfr_values = [0, 1]
        df["EGFR"] = np.select(egfr_conditions, egfr_values)

    # Encode gender: M/Male -> 0.0, F/Female/1 -> 1.0
    if "gender" in df.columns:
        df["gender"] = df["gender"].apply(
            lambda x: 0.0 if isinstance(x, str) and x.upper() in ['M', 'MALE']
                      or (isinstance(x, (int, float)) and x == 0)
                      else 1.0
        )

    return df


def preprocess_excel_data(df):
    """
    Process Excel data and return as list of records.
    """

    missing_columns = [col for col in required_columns if col not in df.columns]
    if missing_columns:
        raise ValueError(f"Missing required columns: {', '.join(missing_columns)}")

    df = df.reindex(columns=required_columns)

    df = encode_clinical_features(df)

    df.insert(loc=df.columns.get_loc("ID") + 1, column="NAME", value="patient")

    rows = df.to_dict(orient="records")

    def convert_to_native(obj):
        if isinstance(obj, np.integer):
            return int(obj)
        elif isinstance(obj, np.floating):
            return float(obj)
        elif isinstance(obj, np.ndarray):
            return obj.tolist()
        return obj

    rows = [
        {key: convert_to_native(value) for key, value in row.items()} for row in rows
    ]

    return rows


# -------------------------------------------------------------------
# 🔽🔽🔽 ADDED LOGIC BELOW (NO EXISTING CODE MODIFIED) 🔽🔽🔽
# -------------------------------------------------------------------

FEATURE_CHAIN = [
    "age",
    "gender",
    "Hypertension",
    "HBA",
    "HB",
    "DR_OD",
    "DR_SEVERITY_OD",
    "DR_OS",
    "DR_SEVERITY_OS",
    "EGFR",
]


def chained_conditional_probability(df, conditions, target_col, target_value):
    """
    Computes:
    P(target_col = target_value | conditions)
    using empirical frequency.
    """

    subset = df.copy()

    for col, val in conditions.items():
        subset = subset[subset[col] == val]

    if len(subset) == 0:
        return 0.0

    return (subset[target_col] == target_value).sum() / len(subset)


def add_chained_probabilities(patient_record, full_encoded_df):
    """
    Adds chained conditional probabilities to a single patient record.
    """

    enriched = dict(patient_record)
    conditions = {}

    for feature in FEATURE_CHAIN:
        value = patient_record[feature]

        prob = chained_conditional_probability(
            df=full_encoded_df,
            conditions=conditions,
            target_col=feature,
            target_value=value,
        )

        enriched[f"probability_of_{feature}"] = round(prob, 6)

        conditions[feature] = value

    return enriched


def compute_aggregated_edge_probabilities(full_encoded_df):
    """
    Computes aggregated edge probabilities for the cohort-level relationship graph.

    CRITICAL SEMANTIC REQUIREMENT:
    Probabilities MUST be computed at the GROUP/BUCKET level, not raw value level.
    Each edge conditions ONLY on its source node category, never on upstream path.

    If graph nodes represent groups (e.g., "Age < 40", "HB <= 9"), then:
    P(AgeGroup = g | Gender = 1) = #(patients with Gender=1 AND AgeGroup=g) / #(patients with Gender=1)

    NOT raw-level probabilities like:
    P(age=19 | gender=1) = 1 / 387 ✗ FORBIDDEN
    NOT path-conditioned like:
    P(age | patient, gender) ✗ FORBIDDEN (use only source node)

    Returns a dict mapping edge keys to edge probability data:
    {
        "Patient-0|Gender-0": {
            "sourceId": "Patient-0",
            "targetId": "Gender-0",
            "count": 212,
            "numeratorCount": 212,
            "denominatorCount": 387,
            "chainedProbability": 0.547945,
            "conditioningSetKey": "hash(Patient=0)",
            "posteriorCKD": None
        },
        "Gender-0|Age_Group-0": {
            "sourceId": "Gender-0",
            "targetId": "Age_Group-0",
            "count": 105,
            "numeratorCount": 105,
            "denominatorCount": 212,
            "chainedProbability": 0.495283,
            "conditioningSetKey": "hash(Gender=0)",
            "posteriorCKD": None
        },
        ...
    }

    Formula: P(Fi+1 | Fi) = count(Fi AND Fi+1) / count(Fi)
    All features already encoded/bucketed before this function is called.
    """

    # Map numeric encoded values back to string labels for node IDs
    # These values are GROUP INDICES, not raw values
    category_value_labels = {
        "Patient": {0: "Patient"},  # Special case: only one patient bucket
        "age": {
            0: "Age < 40",
            1: "Age == 40",
            2: "40 < Age <= 45",
            3: "45 < Age <= 50",
            4: "50 < Age <= 55",
            5: "55 < Age <= 60",
            6: "60 < Age <= 65",
            7: "65 < Age <= 70",
            8: "70 < Age <= 75",
            9: "75 < Age <= 78",
            10: "Age > 78",
        },
        "gender": {0: "Female", 1: "Male"},
        "Hypertension": {0: "No HTN", 1: "HTN"},
        "HBA": {1: "HBA <= 5", 2: "5 < HBA <= 10", 3: "10 < HBA <= 15", 4: "HBA > 15"},
        "HB": {
            1: "HB <= 9",
            2: "9 < HB <= 12",
            3: "12 < HB <= 15",
            4: "15 < HB <= 18",
            5: "HB > 18",
        },
        "DR_OD": {0: "Non DR_OD", 1: "DR_OD"},
        "DR_OS": {0: "Non DR_OS", 1: "DR_OS"},
        "DR_SEVERITY_OD": {
            1: "Stage 1",
            2: "Stage 2",
            3: "Stage 3",
            4: "Stage 4",
            5: "Stage 5",
        },
        "DR_SEVERITY_OS": {
            1: "Stage 1",
            2: "Stage 2",
            3: "Stage 3",
            4: "Stage 4",
            5: "Stage 5",
        },
        "EGFR": {0: "EGFR >= 90", 1: "EGFR < 90"},
    }

    # Feature chain: order of edges in the graph (MUST match frontend categoriesOrdered)
    # Each tuple is (source_feature, target_feature)
    # Both refer to ENCODED/BUCKETED columns in the dataframe
    # Frontend expects this order: Patient, Gender, Age_Group, DR_OD, DR_OS, HTN, HB, HBA, DR_Severity_OD, DR_Severity_OS, EGFR
    edge_chain = [
        ("Patient", "gender"),           # Patient → Gender
        ("gender", "age"),               # Gender → Age_Group
        ("age", "DR_OD"),                # Age_Group → DR_OD
        ("DR_OD", "DR_OS"),              # DR_OD → DR_OS
        ("DR_OS", "Hypertension"),       # DR_OS → HTN
        ("Hypertension", "HB"),          # HTN → HB
        ("HB", "HBA"),                   # HB → HBA
        ("HBA", "DR_SEVERITY_OD"),       # HBA → DR_Severity_OD
        ("DR_SEVERITY_OD", "DR_SEVERITY_OS"),  # DR_Severity_OD → DR_Severity_OS
        ("DR_SEVERITY_OS", "EGFR"),      # DR_Severity_OS → EGFR
    ]

    # Mapping from backend feature names to frontend category names
    # Frontend uses "Age_Group", "HTN", "DR_Severity_OD", etc.
    # Backend uses "age", "Hypertension", "DR_SEVERITY_OD", etc.
    frontend_category_mapping = {
        "Patient": "Patient",  # Special case: Patient stays as Patient
        "age": "Age_Group",
        "gender": "Gender",
        "Hypertension": "HTN",
        "HBA": "HBA",
        "HB": "HB",
        "DR_OD": "DR_OD",
        "DR_OS": "DR_OS",
        "DR_SEVERITY_OD": "DR_Severity_OD",
        "DR_SEVERITY_OS": "DR_Severity_OS",
        "EGFR": "EGFR",
    }

    # Features with 1-based encoding that need to be converted to 0-based indices for node IDs
    # Frontend subtracts 1 from these values when constructing node IDs
    one_based_features = {"HB", "HBA", "DR_SEVERITY_OD", "DR_SEVERITY_OS"}

    def normalize_bucket_index(feature_name, bucket_idx):
        """
        Convert bucket index to 0-based if feature uses 1-based encoding.

        Ensures frontend and backend use matching node IDs:
        - Frontend: patient.HB=3 → HB-2 (subtracts 1)
        - Backend: encoded value 3 → HB-2 (subtracts 1)
        """
        if feature_name in one_based_features:
            return int(bucket_idx) - 1
        return int(bucket_idx)

    edges_metadata = {}
    total_patients = len(full_encoded_df)

    # Process all edges in the chain
    for source_feature, target_feature in edge_chain:
        # SPECIAL CASE: Patient → * edges
        # Denominator is always all patients (total_patients)
        # Numerator is count of patients with each target value
        if source_feature == "Patient":
            source_bucket_idx = 0  # Only one patient bucket
            source_id = "Patient-0"
            denominator = total_patients  # All patients are in the Patient bucket

            # For each unique value in target feature
            unique_targets = full_encoded_df[target_feature].unique()
            for target_bucket_idx in unique_targets:
                target_bucket_idx = int(target_bucket_idx)

                # Count patients with this target value
                numerator = len(
                    full_encoded_df[
                        full_encoded_df[target_feature] == target_bucket_idx
                    ]
                )

                if numerator == 0:
                    # No patients with this value - skip
                    continue

                # Probability: P(target | all patients) = fraction of patients with this value
                chained_prob = round(numerator / denominator, 6)

                # Create target node ID
                target_category = frontend_category_mapping.get(
                    target_feature, target_feature
                )
                target_node_idx = normalize_bucket_index(
                    target_feature, target_bucket_idx
                )
                target_id = f"{target_category}-{target_node_idx}"

                edge_key = f"{source_id}|{target_id}"

                # Store edge metadata
                edges_metadata[edge_key] = {
                    "sourceId": source_id,
                    "targetId": target_id,
                    "count": numerator,
                    "numeratorCount": numerator,
                    "denominatorCount": denominator,
                    "chainedProbability": chained_prob,
                    "conditioningSetKey": "hash(Patient=0)",
                    "posteriorCKD": None,
                }

        else:
            # REGULAR INTER-FEATURE EDGES: Get all unique value combinations for this edge
            # Both source_value and target_value are GROUP INDICES (0-N)
            edge_values = full_encoded_df[
                [source_feature, target_feature]
            ].drop_duplicates()

            for _, row in edge_values.iterrows():
                source_bucket_idx = int(row[source_feature])
                target_bucket_idx = int(row[target_feature])

                # Compute P(target_feature = target_bucket | source_feature = source_bucket)
                # at the GROUP level, NOT conditioned on any upstream path features

                # Denominator: count of ALL patients in source bucket (regardless of other features)
                denominator = len(
                    full_encoded_df[
                        full_encoded_df[source_feature] == source_bucket_idx
                    ]
                )

                if denominator == 0:
                    # No patients in this source bucket → skip edge (mathematically impossible for traversed edges)
                    continue

                # Numerator: count of patients in BOTH source and target buckets
                numerator = len(
                    full_encoded_df[
                        (full_encoded_df[source_feature] == source_bucket_idx)
                        & (full_encoded_df[target_feature] == target_bucket_idx)
                    ]
                )

                if numerator == 0:
                    # No patients in this transition → skip edge
                    continue

                # Compute group-level conditional probability: P(target | source ONLY)
                chained_prob = round(numerator / denominator, 6)

                # Create node IDs matching frontend category names and index normalization
                # Frontend converts 1-based indices to 0-based for node IDs
                # We must do the same in backend to ensure edge keys match
                source_category = frontend_category_mapping.get(
                    source_feature, source_feature
                )
                target_category = frontend_category_mapping.get(
                    target_feature, target_feature
                )

                # Normalize indices: convert 1-based to 0-based where needed
                source_node_idx = normalize_bucket_index(
                    source_feature, source_bucket_idx
                )
                target_node_idx = normalize_bucket_index(
                    target_feature, target_bucket_idx
                )

                source_id = f"{source_category}-{source_node_idx}"
                target_id = f"{target_category}-{target_node_idx}"

                edge_key = f"{source_id}|{target_id}"

                # Posterior CKD: only on final EGFR edge
                posterior_ckd = None
                if target_feature == "EGFR":
                    # P(CKD | all features) approximated as EGFR < 90 → higher CKD risk
                    posterior_ckd = round(1.0 if target_bucket_idx == 1 else 0.0, 6)

                # Store edge metadata with correct group-level semantics
                edges_metadata[edge_key] = {
                    "sourceId": source_id,
                    "targetId": target_id,
                    "count": numerator,
                    "numeratorCount": numerator,
                    "denominatorCount": denominator,
                    "chainedProbability": chained_prob,
                    "conditioningSetKey": f"hash({source_category}={source_bucket_idx})",
                    "posteriorCKD": posterior_ckd,
                }

    return edges_metadata
