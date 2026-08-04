# TraceGov AI Data Provenance Documentation

## Overview

TraceGov maintains explicit tracking of data origins and dataset provenance to prevent silent confusion between synthetic baseline simulations and empirical historical outcomes.

---

## Active Provenance Regimes

### 1. Cold-Start Baseline Regime (`"trained_model_synthetic"`)
- **Dataset Size**: 3,000 synthetic file movement histories.
- **Simulation Method**: Grounded in M/M/1 queuing theory ($W = \frac{1}{\mu - \lambda}$), department service time distributions (Reception, Verification Desk, Tax Desk, Ward Chair Approval), missing document penalties, backtrack probability, and day-of-week arrival spikes.
- **Labeling**: Every prediction response produced under this regime returns `"predictionSource": "trained_model_synthetic"` and `"modelVersion": "v1.0.0-synthetic"`.
- **Purpose**: Provides realistic, calibrated ML predictions during early deployment before sufficient historical completed files ($\ge 50$) have been processed in MongoDB Atlas.

---

### 2. Empirical Historical Regime (`"trained_model_real_data"`)
- **Dataset Size**: Dynamically queried from completed files (`isClosed: true`) in MongoDB Atlas.
- **Minimum Threshold**: Requires $\ge 50$ completed files with full start-to-finish timestamps and `MovementHistory` records.
- **Grouped Split**: Cross-validation and train/validation splits are grouped strictly by `fileUid` to prevent movement-step leakage across folds.
- **Labeling**: Every prediction response produced under this regime returns `"predictionSource": "trained_model_real_data"` and `"modelVersion": "v1.1.0-real-YYYYMMDD"`.
- **Promotion**: Automatically promoted over the synthetic model via `ai-service/scripts/retrain.py` once the sample threshold is met and validation score improves.

---

### 3. Fallback Safety Net (`"heuristic_fallback"`)
- **Condition**: Active if model loading fails or an unhandled microservice error occurs.
- **Labeling**: Returns `"predictionSource": "heuristic_fallback"` and `"modelVersion": "v0.1.0-heuristic"`.
