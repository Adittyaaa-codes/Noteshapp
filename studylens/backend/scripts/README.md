# Local Educational Classifier

This directory contains the pipeline for training a lightweight, offline binary classifier using `scikit-learn`. The classifier filters educational vs. non-educational browser tabs based *only* on their title/heading, running at <50ms per prediction.

## Why Scikit-Learn?
This pipeline uses a `HashingVectorizer` paired with a linear `SGDClassifier` configured for `log_loss`. Under the hood, this behaves almost identically to `fastText` (utilizing unigrams/bigrams and feature hashing), but requires **zero C++ compilers** to install—which is critical for running seamlessly on Python 3.13+ environments!

## Getting Started

First, ensure you have the required dependencies:

```powershell
pip install scikit-learn pandas
```

## Workflow

If you gather real-world labeled browsing data (non-synthetic), you should follow this process to re-train the model.

### 1. Prepare Data
Ensure your data is saved in `studylens/data/dataset_raw.csv` with `text,label` columns (label should be YES or NO). 

### 2. Train the Model
Train the pipeline using:

```powershell
python train_model.py
```

This script will:
- Clean and format the data directly from the CSV.
- Perform a stratified 85/15 split.
- Train the model using hyper-parameters optimized for small vocabularies and fast inference (`n_features=131k`, n-grams up to 2).
- Evaluate precision, recall, and F1 score against the validation set.
- Explicitly print any misclassified validation examples for you to review.
- Save the pickled pipeline to `studylens/backend/models/educational_classifier.pkl` (weighing in at a tiny ~1MB).
- Run manual sanity checks on trick examples.

### 3. Restart the Backend
The FastAPI backend (`backend/main.py`) loads the `.pkl` model at startup. After retraining, simply restart the backend server (or run `python desktop.py` again) so the new model is loaded into memory!
