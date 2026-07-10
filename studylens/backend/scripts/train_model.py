import os
import pandas as pd
import pickle
from sklearn.model_selection import train_test_split
from sklearn.feature_extraction.text import HashingVectorizer
from sklearn.linear_model import SGDClassifier
from sklearn.pipeline import Pipeline
from sklearn.metrics import precision_recall_fscore_support

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(os.path.dirname(BASE_DIR), "data")
INPUT_FILE = os.path.join(DATA_DIR, "dataset_raw.csv")
MODEL_DIR = os.path.join(BASE_DIR, "models")
MODEL_PATH = os.path.join(MODEL_DIR, "educational_classifier.pkl")

def main():
    if not os.path.exists(MODEL_DIR):
        os.makedirs(MODEL_DIR)

    print(f"Loading data from {INPUT_FILE}...")
    df = pd.read_csv(INPUT_FILE)
    
    # Clean text (strip newlines)
    df['text'] = df['text'].astype(str).str.replace('\n', ' ').str.replace('\r', ' ').str.strip()
    
    # 85/15 stratified split
    X_train, X_valid, y_train, y_valid = train_test_split(
        df['text'], df['label'], test_size=0.15, stratify=df['label'], random_state=42
    )
    print(f"Training on {len(X_train)} samples, validating on {len(X_valid)} samples.")

    # Create scikit-learn pipeline identical in spirit to fastText
    # HashingVectorizer avoids storing a vocabulary dictionary (saving RAM/disk space).
    # n_features=2**17 (~131k buckets) is similar to fastText bucket=200000.
    pipeline = Pipeline([
        ('vectorizer', HashingVectorizer(ngram_range=(1, 2), n_features=2**17, alternate_sign=False)),
        ('clf', SGDClassifier(loss='log_loss', penalty='l2', alpha=1e-4, random_state=42, max_iter=35))
    ])

    print("Training SGDClassifier pipeline...")
    pipeline.fit(X_train, y_train)

    # Evaluate
    print("\n--- Evaluation on Validation Set ---")
    y_pred = pipeline.predict(X_valid)
    
    p, r, f1, _ = precision_recall_fscore_support(y_valid, y_pred, pos_label="YES", average='binary')
    print(f"Precision: {p:.4f}")
    print(f"Recall:    {r:.4f}")
    print(f"F1 Score:  {f1:.4f}")
    
    print("\n[WARNING] Validation accuracy on this synthetic dataset may be near-perfect due to shared templates.")
    print("Treat this as a smoke test, not a real accuracy measurement for production confidence thresholds.\n")

    # Misclassified examples
    print("--- Misclassified Examples ---")
    misclassified = 0
    probs = pipeline.predict_proba(X_valid)
    classes = pipeline.classes_ 
    
    for text, true_lbl, pred_lbl, prob_array in zip(X_valid, y_valid, y_pred, probs):
        if true_lbl != pred_lbl:
            misclassified += 1
            conf = prob_array[list(classes).index(pred_lbl)]
            print(f"True: {true_lbl:3s} | Pred: {pred_lbl:3s} (Conf: {conf:.4f}) | Text: {text}")
            
    if misclassified == 0:
        print("No misclassified examples found in the validation set!")
    else:
        print(f"Total misclassified: {misclassified}")

    # Save model
    with open(MODEL_PATH, 'wb') as f:
        pickle.dump(pipeline, f)
        
    model_size = os.path.getsize(MODEL_PATH) / (1024 * 1024)
    print(f"\nSaved lightweight model to {MODEL_PATH} ({model_size:.2f} MB)")

    # Sanity checks
    print("\n--- Manual Sanity Checks ---")
    test_cases = [
        "Minecraft Redstone Tutorial: Learn Logic Gates",
        "Minecraft Funny Moments Compilation",
        "University Lecture Series on The French Revolution",
        "Top 10 Funniest Among Us Fails of All Time",
        "Step-by-Step Guide to Mastering Newton's Laws",
        "Reacting to the New GTA V Trailer",
        "Introduction to Quantum Mechanics",
        "I Spent $500 on Loot Boxes - Was It Worth It?"
    ]
    
    test_probs = pipeline.predict_proba(test_cases)
    test_preds = pipeline.predict(test_cases)
    
    for text, pred_lbl, prob_array in zip(test_cases, test_preds, test_probs):
        conf = prob_array[list(classes).index(pred_lbl)]
        print(f"Pred: {pred_lbl:3s} (Conf: {conf:.4f}) | {text}")

if __name__ == "__main__":
    main()
