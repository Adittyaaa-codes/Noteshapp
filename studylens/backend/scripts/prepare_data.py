import csv
import os
import random
import re

# Set paths
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(os.path.dirname(BASE_DIR), "data")
INPUT_FILE = os.path.join(DATA_DIR, "dataset_raw.csv")
TRAIN_FILE = os.path.join(DATA_DIR, "fasttext_train.txt")
VALID_FILE = os.path.join(DATA_DIR, "fasttext_valid.txt")

def clean_text(text):
    """Strip newlines and collapse whitespace."""
    text = text.replace('\n', ' ').replace('\r', ' ')
    text = re.sub(r'\s+', ' ', text)
    return text.strip()

def prepare_data():
    print(f"Reading {INPUT_FILE}...")
    
    yes_examples = []
    no_examples = []
    
    with open(INPUT_FILE, 'r', encoding='utf-8') as f:
        reader = csv.reader(f)
        header = next(reader)
        
        for row in reader:
            if len(row) < 2:
                continue
            text, label = row[0], row[1]
            cleaned_text = clean_text(text)
            formatted_line = f"__label__{label} {cleaned_text}\n"
            
            if label == "YES":
                yes_examples.append(formatted_line)
            elif label == "NO":
                no_examples.append(formatted_line)

    print(f"Loaded {len(yes_examples)} YES examples and {len(no_examples)} NO examples.")
    
    # Shuffle for randomness before split
    random.seed(42)
    random.shuffle(yes_examples)
    random.shuffle(no_examples)
    
    # 85/15 Stratified Split
    yes_split_idx = int(len(yes_examples) * 0.85)
    no_split_idx = int(len(no_examples) * 0.85)
    
    train_data = yes_examples[:yes_split_idx] + no_examples[:no_split_idx]
    valid_data = yes_examples[yes_split_idx:] + no_examples[no_split_idx:]
    
    # Shuffle final sets so YES/NO aren't grouped sequentially
    random.shuffle(train_data)
    random.shuffle(valid_data)
    
    print(f"Writing {len(train_data)} training examples to {TRAIN_FILE}")
    with open(TRAIN_FILE, 'w', encoding='utf-8') as f:
        f.writelines(train_data)
        
    print(f"Writing {len(valid_data)} validation examples to {VALID_FILE}")
    with open(VALID_FILE, 'w', encoding='utf-8') as f:
        f.writelines(valid_data)
        
    print("Data preparation complete!")

if __name__ == "__main__":
    prepare_data()
