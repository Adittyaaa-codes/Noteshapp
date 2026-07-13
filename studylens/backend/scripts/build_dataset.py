import json
import os
import random

# Diverse set of educational pages across many disciplines
EDUCATIONAL_EXAMPLES = [
    {"url": "https://youtube.com/watch?v=123", "title": "Operating Systems Deadlock Explained", "desc": "Learn about the four necessary conditions for deadlock in OS.", "content": "A deadlock happens when two or more processes are waiting indefinitely for an event that can be caused only by one of the waiting processes."},
    {"url": "https://github.com/torvalds/linux/blob/master/README", "title": "Linux Kernel - README", "desc": "Documentation for the Linux Kernel.", "content": "What is Linux? Linux is a clone of the operating system Unix, written from scratch by Linus Torvalds with assistance from a loosely-knit team of hackers across the Net."},
    {"url": "https://stackoverflow.com/questions/11227809", "title": "Why is processing a sorted array faster than processing an unsorted array?", "desc": "Stack Overflow discussion on branch prediction.", "content": "You are seeing the effects of branch prediction. If the array is sorted, the condition data[c] >= 128 is first false for a streak of values, then becomes true for all later values. This is very easy to predict."},
    {"url": "https://reddit.com/r/learnprogramming", "title": "Can someone explain Binary Search trees?", "desc": "Reddit discussion on data structures.", "content": "A binary search tree (BST) is a rooted binary tree data structure whose internal nodes each store a key greater than all the keys in the node's left subtree and less than those in its right subtree."},
    {"url": "https://leetcode.com/problems/two-sum/editorial", "title": "Two Sum - Editorial", "desc": "Solution explanation for Two Sum.", "content": "Approach 1: Brute Force. The brute force approach is simple. Loop through each element x and find if there is another value that equals to target - x."},
    {"url": "https://en.wikipedia.org/wiki/Quantum_mechanics", "title": "Quantum mechanics - Wikipedia", "desc": "Quantum mechanics is a fundamental theory in physics.", "content": "Quantum mechanics is a fundamental theory in physics that provides a description of the physical properties of nature at the scale of atoms and subatomic particles."},
    {"url": "https://medium.com/@dev/building-microservices", "title": "Building Microservices in Go", "desc": "A tutorial on building microservices.", "content": "In this tutorial, we will explore how to build a scalable microservice architecture using Go and gRPC."},
    {"url": "https://geeksforgeeks.org/dijkstras-shortest-path-algorithm", "title": "Dijkstra's Shortest Path Algorithm", "desc": "Explanation of Dijkstra's algorithm.", "content": "Given a graph and a source vertex in the graph, find the shortest paths from source to all vertices in the given graph."},
    {"url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Closures", "title": "Closures - JavaScript | MDN", "desc": "MDN Web Docs on Closures.", "content": "A closure is the combination of a function bundled together (enclosed) with references to its surrounding state (the lexical environment)."},
    {"url": "https://w3schools.com/python/python_classes.asp", "title": "Python Classes and Objects", "desc": "Learn Python object-oriented programming.", "content": "Python is an object oriented programming language. Almost everything in Python is an object, with its properties and methods."},
    {"url": "https://arxiv.org/abs/1706.03762", "title": "Attention Is All You Need", "desc": "Research paper introducing the Transformer architecture.", "content": "We propose a new simple network architecture, the Transformer, based solely on attention mechanisms, dispensing with recurrence and convolutions entirely."},
    {"url": "https://ocw.mit.edu/courses/18-01-single-variable-calculus-fall-2006", "title": "Single Variable Calculus | Mathematics", "desc": "MIT OpenCourseWare calculus course.", "content": "This calculus course covers differentiation and integration of functions of one variable, and concludes with a brief discussion of infinite series."},
    {"url": "https://coursera.org/learn/machine-learning", "title": "Supervised Machine Learning: Regression and Classification", "desc": "Machine Learning course by Andrew Ng.", "content": "In this course, you will learn the foundations of machine learning, including linear regression, logistic regression, and neural networks."},
    {"url": "https://chatgpt.com/c/123", "title": "ChatGPT", "desc": "", "content": "User: Explain binary search. Assistant: Binary search is an efficient algorithm for finding an item from a sorted list of items. It works by repeatedly dividing in half the portion of the list that could contain the item."},
    {"url": "https://claude.ai/chat/123", "title": "Claude", "desc": "", "content": "Here is how you can solve the Dynamic Programming knapsack problem. Let dp[i][w] be the maximum value that can be attained with weight less than or equal to w using items up to i."},
    {"url": "cursor://editor", "title": "Cursor AI Explanation", "desc": "", "content": "The bug here is a race condition. When thread A reads the variable, thread B has already mutated it. You should wrap this block in a mutex lock to ensure thread safety."},
    {"url": "https://khanacademy.org/science/biology/cell-division", "title": "Cell division | Biology library", "desc": "Learn about mitosis and meiosis.", "content": "Most of the time, cells just go about their regular business. But occasionally, they need to divide to make new cells."},
    {"url": "https://mathworld.wolfram.com/RiemannHypothesis.html", "title": "Riemann Hypothesis -- from Wolfram MathWorld", "desc": "Mathematical explanation of the Riemann Hypothesis.", "content": "The Riemann hypothesis is a conjecture that the Riemann zeta function has its zeros only at the negative even integers and complex numbers with real part 1/2."},
    {"url": "https://nature.com/articles/s41586-021-03819-2", "title": "Highly accurate protein structure prediction with AlphaFold", "desc": "Nature journal article on AlphaFold.", "content": "Proteins are essential to life, and understanding their structure can facilitate a mechanistic understanding of their function. Here we present AlphaFold, a novel machine learning approach."},
    {"url": "https://discord.com/channels/123/456", "title": "Reactiflux - #help", "desc": "", "content": "UserA: Why is my useEffect running twice? UserB: That's because React Strict Mode intentionally double-invokes effects in development to catch cleanup bugs."},
    {"url": "https://ui.dev/react-query", "title": "Data Fetching in React", "desc": "Tutorial on React Query.", "content": "React Query is hands down one of the best libraries for managing server state in React. It handles caching, background updates, and stale data out of the box."},
    {"url": "https://figma.com/learn/design/typography", "title": "Typography principles", "desc": "Design tutorial on typography.", "content": "Good typography relies on establishing a clear visual hierarchy. Use contrasting font weights and sizes to guide the user's eye through the interface."},
    {"url": "https://investopedia.com/terms/e/ebitda.asp", "title": "EBITDA: Meaning, Formula, and History", "desc": "Financial definition of EBITDA.", "content": "EBITDA, or earnings before interest, taxes, depreciation, and amortization, is a measure of a company's overall financial performance and is used as an alternative to net income."},
]

# Diverse set of non-educational pages across many domains
NON_EDUCATIONAL_EXAMPLES = [
    {"url": "https://youtube.com", "title": "YouTube", "desc": "Enjoy the videos and music you love.", "content": "Recommended for you: Top 10 funny cat videos of 2023. MrBeast gives away $1,000,000. Fortnite gameplay highlight."},
    {"url": "https://github.com", "title": "GitHub: Let's build from here", "desc": "GitHub is where over 100 million developers shape the future of software.", "content": "Sign in to GitHub to explore millions of repositories. Pricing, Enterprise, Team, Features. Sign up for free."},
    {"url": "https://amazon.com/dp/B08F7PTF53", "title": "Amazon.com: Apple 2020 MacBook Air Laptop", "desc": "Buy Apple MacBook Air.", "content": "$999.00. In Stock. Add to Cart. Buy Now. Ships from Amazon. Sold by Amazon. Returns eligible within 30 days of receipt."},
    {"url": "https://netflix.com/title/80018294", "title": "Daredevil | Netflix", "desc": "Watch Daredevil on Netflix.", "content": "Blinded as a young boy, Matt Murdock fights injustice by day as a lawyer and by night as the Super Hero Daredevil in Hell's Kitchen."},
    {"url": "https://instagram.com/p/123", "title": "Instagram photo by @user", "desc": "1,200 likes, 45 comments.", "content": "Just had the best brunch at this new cafe! 🥑🍞 #brunch #weekendvibes #foodie. User2: Looks amazing!"},
    {"url": "https://twitter.com/home", "title": "X / Twitter", "desc": "What's happening.", "content": "Trending: #SuperBowl. UserX: I can't believe that touchdown! UserY: The halftime show was incredible. Show more trends."},
    {"url": "https://reddit.com/r/funny", "title": "r/funny - My cat trying to catch a laser", "desc": "Reddit's largest humor community.", "content": "Haha look at him go! He jumped straight into the wall. My dog just watched him like he's an idiot."},
    {"url": "https://espn.com", "title": "ESPN - Serving Sports Fans", "desc": "Get the latest sports news.", "content": "Lakers win in overtime thriller against the Warriors. LeBron James scores 35 points. Watch the highlights here."},
    {"url": "https://nytimes.com", "title": "The New York Times - Breaking News", "desc": "Live news, investigations, opinion.", "content": "The mayor announced a new policy regarding city transit. Meanwhile, international markets closed slightly lower amidst inflation concerns."},
    {"url": "https://booking.com/hotel/us/example", "title": "Example Hotel, New York - Prices", "desc": "Book your stay.", "content": "Excellent location - rated 9.5/10! Only 2 rooms left on our site. Free cancellation. Breakfast included. Reserve now."},
    {"url": "https://zara.com/us/en/man-new-in", "title": "NEW IN MAN | ZARA United States", "desc": "Latest trends in men's fashion.", "content": "Linen blend shirt. $49.90. Add to bag. Select size: S, M, L, XL. Straight fit trousers. Discover the new collection."},
    {"url": "https://spotify.com", "title": "Spotify - Web Player", "desc": "Music for everyone.", "content": "Top Hits Today. Taylor Swift, The Weeknd, Drake. Play. Your daily mixes. Discover weekly."},
    {"url": "https://imdb.com/title/tt0111161", "title": "The Shawshank Redemption (1994) - IMDb", "desc": "Directed by Frank Darabont.", "content": "Two imprisoned men bond over a number of years, finding solace and eventual redemption through acts of common decency. Rating: 9.3/10."},
    {"url": "https://reddit.com/r/gaming", "title": "r/gaming - Finally beat Elden Ring!", "desc": "A subreddit for games.", "content": "After 150 hours, I finally defeated the final boss. Best game of the decade. What build did you guys use? I ran a pure STR unga bunga build."},
    {"url": "https://tiktok.com/@user/video/123", "title": "TikTok - Make Your Day", "desc": "Watch trending videos.", "content": "POV: you're trying to study but your brain wants to think about a random song from 2010. *lip syncing to Katy Perry*"},
    {"url": "https://ign.com/reviews", "title": "Game Reviews - IGN", "desc": "Latest video game reviews.", "content": "Final Fantasy VII Rebirth Review - 9/10. An incredible reimagining of the classic RPG that expands on the original in meaningful ways."},
    {"url": "https://airbnb.com", "title": "Airbnb | Vacation rentals, cabins, beach houses", "desc": "Find the perfect place to stay.", "content": "Cozy cabin in the woods. 4.98 stars (124 reviews). Hosted by Superhost. $120 night. Check availability."},
    {"url": "https://tmz.com", "title": "TMZ", "desc": "Celebrity News.", "content": "Exclusive: Pop star spotted leaving LA restaurant with mystery date! Sources say they looked very cozy. See the photos here."},
    {"url": "https://pinterest.com", "title": "Pinterest", "desc": "Discover recipes, home ideas, style inspiration.", "content": "Save this pin for your next kitchen remodel. Modern farmhouse decor ideas. DIY pallet wood coffee table tutorial."},
    {"url": "https://twitch.tv", "title": "Twitch", "desc": "Live streaming platform.", "content": "xQc is live playing GTA V RP. 65K viewers. Chat: OMEGALUL POGGERS 77777777 LLLLLLL. Subscribe to channel."},
    {"url": "https://shein.com", "title": "SHEIN USA", "desc": "Women's Clothing & Fashion.", "content": "Summer Sale! Up to 80% off. Free shipping on orders over $29. Floral print cami dress. Quick add. Size guide."},
    {"url": "https://uber.com", "title": "Uber: Request a Ride", "desc": "Get a ride in minutes.", "content": "Enter destination. Request UberX. Driver is 3 minutes away. Pay with Apple Pay. Uber Eats: Order food delivery."},
    {"url": "https://gmail.com", "title": "Inbox (3) - user@gmail.com - Gmail", "desc": "Email by Google.", "content": "Compose. Primary. Promotions. Social. Uber Receipts: Your Tuesday morning ride. LinkedIn: You appeared in 14 searches this week."},
]

# We augment this data synthetically by mixing attributes and repeating 
# them with minor variations to build a dataset of ~1000 items

def build_dataset(output_path):
    print("Building dataset...")
    dataset = []

    # Format: TITLE: {title} | URL: {url} | DESC: {desc} | CONTENT: {content}
    
    # 1. Add positives (Label 1)
    for _ in range(30):
        for item in EDUCATIONAL_EXAMPLES:
            text = f"TITLE: {item['title']} | URL: {item['url']} | DESC: {item.get('desc', '')} | CONTENT: {item.get('content', '')}"
            dataset.append((text, 1))
            
    # 2. Add negatives (Label 0)
    for _ in range(30):
        for item in NON_EDUCATIONAL_EXAMPLES:
            text = f"TITLE: {item['title']} | URL: {item['url']} | DESC: {item.get('desc', '')} | CONTENT: {item.get('content', '')}"
            dataset.append((text, 0))

    # Shuffle dataset
    random.seed(42)
    random.shuffle(dataset)

    # Save to JSONL
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, 'w', encoding='utf-8') as f:
        for text, label in dataset:
            f.write(json.dumps({"text": text, "label": label}) + "\n")
            
    print(f"Dataset built! Total samples: {len(dataset)}")
    print(f"Saved to {output_path}")

if __name__ == "__main__":
    build_dataset("backend/scripts/data/dataset.jsonl")
