import json
import os
import pickle
import time
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import SGDClassifier
from sklearn.pipeline import Pipeline
from sklearn.metrics import classification_report, accuracy_score, precision_score, recall_score, f1_score

def load_data(filepath):
    texts = []
    labels = []
    with open(filepath, 'r', encoding='utf-8') as f:
        for line in f:
            data = json.loads(line)
            texts.append(data['text'])
            labels.append(data['label'])
    return texts, labels

def train_model(data_path, model_out_path):
    print(f"Loading data from {data_path}...")
    X, y = load_data(data_path)
    
    # We use a TfidfVectorizer with word and character n-grams.
    # 'char_wb' helps capture subwords and technical terms robustly (like fastText).
    print("Initializing pipeline (TfidfVectorizer + SGDClassifier)...")
    pipeline = Pipeline([
        ('tfidf', TfidfVectorizer(
            analyzer='char_wb', 
            ngram_range=(3, 5), 
            max_features=50000, 
            lowercase=True
        )),
        ('clf', SGDClassifier(
            loss='log_loss', # Logistic Regression (outputs probabilities)
            penalty='l2',
            alpha=1e-4,
            max_iter=1000,
            tol=1e-3,
            class_weight='balanced', # Crucial for maximizing recall on underrepresented classes
            random_state=42
        ))
    ])
    
    print("Training model...")
    t0 = time.time()
    pipeline.fit(X, y)
    t1 = time.time()
    print(f"Training completed in {t1 - t0:.3f} seconds.")
    
    # Quick eval on training set
    preds = pipeline.predict(X)
    print("\n--- Training Set Evaluation ---")
    print(classification_report(y, preds, target_names=["Non-Educational", "Educational"]))
    
    # Benchmark Inference Speed
    print("\n--- Inference Speed Benchmark ---")
    t0 = time.time()
    pipeline.predict([X[0]])
    t1 = time.time()
    ms = (t1 - t0) * 1000
    print(f"Single prediction time: {ms:.3f} ms")
    if ms > 10.0:
        print("WARNING: Inference is taking > 10ms.")
    else:
        print("SUCCESS: Inference is < 10ms.")
    
    # Save model
    os.makedirs(os.path.dirname(model_out_path), exist_ok=True)
    with open(model_out_path, 'wb') as f:
        pickle.dump(pipeline, f)
    
    file_size = os.path.getsize(model_out_path) / (1024 * 1024)
    print(f"\nModel exported to {model_out_path} ({file_size:.2f} MB)")

if __name__ == "__main__":
    train_model(
        data_path="backend/scripts/data/dataset.jsonl",
        model_out_path="backend/models/educational_classifier.pkl"
    )
