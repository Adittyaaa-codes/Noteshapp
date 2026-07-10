"""
Generate training dataset + train the educational classifier model.
Run this from the studylens/backend directory:
    python scripts/build_model.py
"""

import os, pickle, random
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.feature_extraction.text import HashingVectorizer
from sklearn.linear_model import SGDClassifier
from sklearn.pipeline import Pipeline
from sklearn.metrics import precision_recall_fscore_support, accuracy_score

# ── Paths ─────────────────────────────────────────────────────────────────────
BASE_DIR  = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODEL_DIR = os.path.join(BASE_DIR, "models")
MODEL_PATH = os.path.join(MODEL_DIR, "educational_classifier.pkl")

# ── Dataset ───────────────────────────────────────────────────────────────────
YES = [
    # Computer Science & AI
    "explain how neural networks work",
    "what is an AI agent and how does it work",
    "difference between supervised and unsupervised learning",
    "how does backpropagation work in deep learning",
    "what is the transformer architecture in NLP",
    "explain gradient descent optimization",
    "what are large language models",
    "how does reinforcement learning work",
    "explain the attention mechanism in transformers",
    "what is the difference between CNN and RNN",
    "how does a decision tree algorithm work",
    "explain k-means clustering",
    "what is overfitting in machine learning",
    "how does random forest improve on decision trees",
    "explain LSTM networks and why they help with sequences",
    "what is transfer learning in deep learning",
    "how does BERT work for NLP tasks",
    "explain the concept of embeddings in machine learning",
    "what is federated learning",
    "how does a convolutional neural network detect images",
    "explain recursion with examples in Python",
    "what is a hash table and how does it work",
    "explain binary search trees",
    "what is dynamic programming",
    "how does quicksort algorithm work",
    "explain Big O notation",
    "what is a linked list vs array",
    "how do database indexes work",
    "what is SQL vs NoSQL",
    "explain REST API design principles",
    "what is object-oriented programming",
    "explain polymorphism and inheritance",
    "how does garbage collection work in Python",
    "what is the difference between process and thread",
    "explain how TCP IP protocol works",
    "what is DNS and how does domain resolution work",
    "explain public key cryptography",
    "what is a blockchain",
    "how do operating systems manage memory",
    "explain the OSI model layers",
    "what is docker and containerization",
    "how does kubernetes orchestration work",
    "explain microservices architecture",
    "what is CI/CD pipeline",
    "how does git version control work",

    # Mathematics & Statistics
    "explain the central limit theorem",
    "what is Bayes theorem and its applications",
    "how do eigenvalues and eigenvectors work",
    "explain linear regression mathematically",
    "what is a p-value in statistics",
    "explain hypothesis testing",
    "what is the difference between mean median and mode",
    "how does Fourier transform work",
    "explain matrix multiplication",
    "what is calculus used for in machine learning",
    "explain probability distributions",
    "what is a confidence interval",
    "how to solve differential equations",
    "explain the Pythagorean theorem",
    "what is a derivative in calculus",
    "explain integration and its applications",
    "what are prime numbers",
    "explain modular arithmetic",
    "what is set theory",
    "explain Boolean algebra",

    # Physics, Chemistry, Biology
    "explain Newton's laws of motion",
    "what is quantum entanglement",
    "how does nuclear fusion work",
    "explain the photoelectric effect",
    "what is the Heisenberg uncertainty principle",
    "how does an MRI machine work",
    "explain the theory of relativity",
    "what is entropy in thermodynamics",
    "how do semiconductors work",
    "explain how lasers work",
    "what is DNA replication",
    "explain how CRISPR gene editing works",
    "how does the immune system fight viruses",
    "what is photosynthesis",
    "explain cell mitosis and meiosis",
    "how do vaccines work",
    "what is natural selection and evolution",
    "explain the periodic table",
    "what is a chemical bond",
    "how does osmosis work",

    # History, Economics, Social Sciences
    "explain the causes of World War 1",
    "what were the effects of the Industrial Revolution",
    "explain the French Revolution and its significance",
    "what is the Cold War",
    "how did the Roman Empire fall",
    "explain supply and demand in economics",
    "what is GDP and how is it measured",
    "explain inflation and its causes",
    "what is monetary policy",
    "how does the stock market work",
    "explain opportunity cost in economics",
    "what is game theory",
    "explain the concept of democracy",
    "what is the United Nations",
    "how do central banks control inflation",

    # Study-focused AI chat patterns
    "help me understand this concept I am studying",
    "can you explain this topic for my exam",
    "I am learning about machine learning explain",
    "summarize this research paper on neural networks",
    "help me understand the lecture notes on algorithms",
    "I need help with my programming assignment",
    "explain this concept I read about in my textbook",
    "what are the key points I should know for my physics exam",
    "quiz me on the topics I have been studying",
    "create flashcards for these study notes",
    "explain this mathematical formula step by step",
    "help me solve this coding problem",
    "I am preparing for a technical interview explain",
    "summarize the key concepts in computer networks",
    "explain how to implement this algorithm",
    "what is the time complexity of this solution",
    "debug this Python code for me",
    "help me understand this error in my program",
    "explain the difference between these two approaches",
    "write a study guide on machine learning fundamentals",
]

NO = [
    # Sports
    "world cup 2026 schedule",
    "who won the cricket match today",
    "IPL 2025 highlights",
    "NBA finals predictions",
    "FIFA rankings latest",
    "how many goals did messi score",
    "world cup 2026 fixtures and results",
    "cricket score live update",
    "tennis grand slam winner 2025",
    "football transfer news today",
    "who is the best player in the world cup",
    "Olympic gold medal results",
    "Premier League table standings",
    "India vs Pakistan match result",
    "who is winning the ICC world cup",

    # Entertainment
    "best movies releasing this weekend",
    "new Bollywood song download",
    "latest Netflix series recommendations",
    "who won the Oscars this year",
    "new album by Taylor Swift",
    "celebrity gossip news today",
    "which actor is dating whom",
    "box office collection this week",
    "best comedy show to watch tonight",
    "new music video by BTS",
    "top 10 memes of the week",
    "funniest TikTok videos compilation",
    "best reels to watch on Instagram",
    "viral video trending today",
    "latest episode recap of the series",

    # Food & Lifestyle
    "best biryani recipe",
    "how to make pasta at home",
    "top restaurants in Delhi",
    "best diet plan for weight loss",
    "healthy breakfast ideas",
    "best street food in Mumbai",
    "how to make chocolate cake",
    "restaurant recommendation near me",
    "what to cook for dinner tonight",
    "how to make chai at home",

    # Travel & Shopping
    "cheap flights to Goa",
    "best hotels in Jaipur",
    "travel guide for Thailand",
    "how to plan a trip to Europe",
    "things to do in Dubai",
    "best deals on Amazon today",
    "Flipkart sale offers",
    "best budget smartphone to buy",
    "how to get discount on Myntra",
    "new product launch Apple iPhone",

    # Casual / Social
    "today weather forecast",
    "what is my horoscope today",
    "Virgo zodiac predictions 2025",
    "funny jokes to tell friends",
    "best WhatsApp status ideas",
    "what should I watch tonight",
    "write a birthday wish for my friend",
    "suggest a gift for my girlfriend",
    "plan a birthday party for me",
    "write a wedding speech",
    "best prank ideas for April fools",
    "write a funny caption for Instagram",
    "what are trending hashtags today",
    "suggest a name for my pet dog",
    "write a roast for my friend",

    # Finance / Crypto (non-educational)
    "bitcoin price today",
    "should I buy dogecoin now",
    "stock market today news",
    "which crypto will moon next",
    "latest share price of Reliance",
    "how to make quick money online",
    "best lottery to play today",
    "fantasy cricket team for today",

    # News / Politics (non-educational)
    "latest political news today",
    "election results 2025",
    "PM Modi speech today",
    "breaking news India",
    "who won the election",
    "political party manifesto 2025",
]

# ── Build DataFrame ───────────────────────────────────────────────────────────

def augment(samples, n=3):
    """Simple augmentation: repeat with minor word shuffles."""
    augmented = list(samples)
    prefixes  = ["explain ", "what is ", "tell me about ", "describe ", "how does ", "I want to know about "]
    for s in samples:
        for _ in range(n):
            prefix = random.choice(prefixes)
            augmented.append(prefix + s.lower())
    return augmented

random.seed(42)
yes_aug = augment(YES, n=4)
no_aug  = augment(NO,  n=4)

data = (
    [{"text": t, "label": "YES"} for t in yes_aug] +
    [{"text": t, "label": "NO"}  for t in no_aug]
)
random.shuffle(data)
df = pd.DataFrame(data)
df["text"] = df["text"].str.replace(r"\s+", " ", regex=True).str.strip()

print(f"Dataset: {len(df)} samples  ({(df.label=='YES').sum()} YES, {(df.label=='NO').sum()} NO)")

# ── Train / Val Split ─────────────────────────────────────────────────────────
X_train, X_val, y_train, y_val = train_test_split(
    df["text"], df["label"], test_size=0.15, stratify=df["label"], random_state=42
)
print(f"Train: {len(X_train)}  Val: {len(X_val)}")

# ── Pipeline ──────────────────────────────────────────────────────────────────
pipeline = Pipeline([
    ("vec", HashingVectorizer(ngram_range=(1, 2), n_features=2**17, alternate_sign=False)),
    ("clf", SGDClassifier(loss="log_loss", penalty="l2", alpha=1e-4, max_iter=50, random_state=42)),
])

print("Training...")
pipeline.fit(X_train, y_train)

# ── Evaluate ──────────────────────────────────────────────────────────────────
y_pred = pipeline.predict(X_val)
acc    = accuracy_score(y_val, y_pred)
p, r, f1, _ = precision_recall_fscore_support(y_val, y_pred, pos_label="YES", average="binary")

print(f"\n=== Validation Results ===")
print(f"Accuracy:  {acc:.4f}")
print(f"Precision: {p:.4f}")
print(f"Recall:    {r:.4f}")
print(f"F1 Score:  {f1:.4f}")

# ── Save Model ────────────────────────────────────────────────────────────────
os.makedirs(MODEL_DIR, exist_ok=True)
with open(MODEL_PATH, "wb") as f:
    pickle.dump(pipeline, f)
size_mb = os.path.getsize(MODEL_PATH) / (1024 * 1024)
print(f"\nModel saved → {MODEL_PATH} ({size_mb:.2f} MB)")

# ── Sanity Checks ─────────────────────────────────────────────────────────────
print("\n=== Sanity Checks ===")
checks = [
    ("what is an AI agent",               "YES"),
    ("explain machine learning",           "YES"),
    ("how does backpropagation work",      "YES"),
    ("world cup 2026 schedule",            "NO"),
    ("who won the cricket match today",    "NO"),
    ("best Bollywood movie this year",     "NO"),
    ("how do neural networks learn",       "YES"),
    ("bitcoin price today",                "NO"),
    ("explain the French Revolution",      "YES"),
    ("funny memes compilation",            "NO"),
    ("what is DNA replication",            "YES"),
    ("recipe for chocolate cake",          "NO"),
]

classes = pipeline.classes_
all_pass = True
for text, expected in checks:
    pred  = pipeline.predict([text])[0]
    probs = pipeline.predict_proba([text])[0]
    conf  = probs[list(classes).index(pred)]
    icon  = "✓" if pred == expected else "✗ FAIL"
    if pred != expected:
        all_pass = False
    print(f"  {icon}  [{pred:3s}] {conf:.0%}  {text}")

print(f"\n{'All checks passed!' if all_pass else 'Some checks failed — review dataset.'}")
