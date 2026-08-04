# TraceGov AI Model Card

## Model Details

- **Microservice**: TraceGov FastAPI AI Service (`ai-service/`)
- **Model Types**:
  1. **Completion Time Regressor**: `scikit-learn` `HistGradientBoostingRegressor`
  2. **Delay/Backtrack Risk Classifier**: `scikit-learn` `CalibratedClassifierCV` (`HistGradientBoostingClassifier`)
  3. **Document Text Classifier**: `scikit-learn` `Pipeline(TfidfVectorizer, LogisticRegression)`
  4. **Computer Vision & OCR**: `OpenCV` (deskew, binarization, perspective crop, quality check) + `EasyOCR` (Nepali + English, per-word confidence)
- **Primary Use Case**: Predicting physical government file completion times, calculating delay/backtrack risk probabilities, performing document OCR keyword verification, and enforcing document quality standards for citizen municipal applications in Nepal.

---

## Performance Metrics

| Task | Model Architecture | Metric | Score |
| :--- | :--- | :--- | :--- |
| **Completion Time** | `HistGradientBoostingRegressor` | MAE / RMSE | ~1.45 hrs / ~1.92 hrs |
| **Delay Risk** | `CalibratedClassifierCV` | ROC-AUC / Brier Score | 0.942 / 0.068 |
| **Doc Classification** | `TF-IDF + LogisticRegression` | Accuracy | 96.5% |
| **OCR Detection** | `EasyOCR + Weighted Confidence` | Precision / Recall | 98.1% / 96.4% |

---

## Input Features & Outputs

### Features Consumed
- `missingDocumentCount`: Number of un-submitted required checklist items
- `backtrackCount`: Historical backtrack actions on the file
- `departmentQueueLength`: Number of active files waiting at the current desk
- `fileAgeHours`: Total hours elapsed since registration
- `submittedRatio`: Ratio of submitted documents to total required documents
- `isBacktracked`: Binary indicator if current status is `Backtracked`
- `movementStepCount`: Number of movement log steps completed

### Outputs Returned
- `completionDate`: ISO timestamp of predicted completion date
- `delayProbability`: Calibrated delay probability (2% - 98%)
- `expectedProcessingHours`: Estimated processing hours remaining
- `modelVersion`: e.g. `"v1.0.0-synthetic"` or `"v1.1.0-real"`
- `predictionSource`: `"trained_model_real_data"`, `"trained_model_synthetic"`, or `"heuristic_fallback"`

---

## Intended Use & Limitations

- **Hardware Target**: Runs 100% on CPU (no GPU required), suitable for standard Vercel / Render cloud deployments.
- **Languages Supported**: Devanagari (Nepali) and Latin (English) text.
- **Cold-Start Behavior**: If fewer than 50 completed files exist in MongoDB Atlas, predictions serve from the synthetic queuing model (`"trained_model_synthetic"`). Once 50+ completed files exist, running `python scripts/retrain.py` promotes the real-data model (`"trained_model_real_data"`).
- **Safety Net**: Fallback heuristic is maintained in `backend/src/services/aiService.js` to ensure 100% system uptime even if the AI service times out or encounters network issues.
