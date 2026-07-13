import json
import pickle
import time
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

def validate_model(data_path, model_path):
    print(f"Loading model from {model_path}...")
    with open(model_path, 'rb') as f:
        pipeline = pickle.load(f)
        
    print(f"Loading validation data from {data_path}...")
    X, y = load_data(data_path)
    
    print("Running validation...")
    t0 = time.time()
    preds = pipeline.predict(X)
    t1 = time.time()
    
    total_time_ms = (t1 - t0) * 1000
    avg_time_ms = total_time_ms / len(X)
    
    print("\n--- Validation Results ---")
    print(classification_report(y, preds, target_names=["Non-Educational", "Educational"]))
    
    recall = recall_score(y, preds)
    precision = precision_score(y, preds)
    f1 = f1_score(y, preds)
    
    print(f"Target Recall: > 97% | Actual: {recall*100:.2f}%")
    print(f"Target Precision: > 93% | Actual: {precision*100:.2f}%")
    print(f"Target F1: > 95% | Actual: {f1*100:.2f}%")
    
    print(f"\nAverage CPU Inference time per document: {avg_time_ms:.3f} ms")
    if avg_time_ms < 10.0:
        print("✅ Speed requirement met (< 10 ms).")
    else:
        print("❌ Speed requirement failed (> 10 ms).")
        
    if recall >= 0.97 and precision >= 0.93:
        print("✅ Accuracy requirements met!")
    else:
        print("⚠️ Accuracy requirements not fully met. Try tuning hyper-parameters or dataset.")

if __name__ == "__main__":
    validate_model(
        data_path="backend/scripts/data/dataset.jsonl",
        model_path="backend/models/educational_classifier.pkl"
    )
