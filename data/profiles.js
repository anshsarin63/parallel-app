// ===== PROFILE DATA =====
const PROFILES = [
  {
    id: 1,
    emoji: '👩‍💻',
    name: 'Priya S.',
    age: 27,
    stage: 'Corporate Professional',
    city: 'Delhi',
    s1: 85,
    s2: 92,
    tags: ['Remote Work', 'Café Culture', 'Growth Mindset'],
    bio: 'Product manager by day, building a side project on weekends. Looking for people who get the grind.',
    gradient: 'linear-gradient(135deg,#c4522a,#d4a853)'
  },
  {
    id: 2,
    emoji: '👨‍🎓',
    name: 'Arjun K.',
    age: 22,
    stage: 'University Student',
    city: 'Bangalore',
    s1: 78,
    s2: 88,
    tags: ['CAT Prep', 'Fitness', 'Tech'],
    bio: 'Final year BBA, prepping for CAT. Need study partners and people to explore Bangalore with.',
    gradient: 'linear-gradient(135deg,#5a8a6e,#3a6a8a)'
  },
  {
    id: 3,
    emoji: '👩‍🎨',
    name: 'Simran M.',
    age: 26,
    stage: 'Corporate Professional',
    city: 'Mumbai',
    s1: 90,
    s2: 94,
    tags: ['Design', 'Travel', 'Side Hustles'],
    bio: 'UX Designer at a fintech startup. Always up for museum visits, design talks, and late-night chai.',
    gradient: 'linear-gradient(135deg,#6b3a9a,#d4a853)'
  },
  {
    id: 4,
    emoji: '🧑‍💼',
    name: 'Rohan V.',
    age: 24,
    stage: 'Corporate Professional',
    city: 'Delhi',
    s1: 82,
    s2: 89,
    tags: ['Finance', 'Running', 'Books'],
    bio: 'Analyst at a consulting firm. Training for my first half-marathon. Book clubs and weekend hikes.',
    gradient: 'linear-gradient(135deg,#2a6aaa,#c4522a)'
  },
  {
    id: 5,
    emoji: '👩‍🔬',
    name: 'Ananya R.',
    age: 21,
    stage: 'University Student',
    city: 'Pune',
    s1: 88,
    s2: 91,
    tags: ['Research', 'Yoga', 'Podcasts'],
    bio: 'Physics student at Fergusson. Deep into research, mindfulness, and conversations that actually matter.',
    gradient: 'linear-gradient(135deg,#8a5a2a,#5a8a6e)'
  },
  {
    id: 6,
    emoji: '🧑‍🚀',
    name: 'Karan P.',
    age: 25,
    stage: 'Corporate Professional',
    city: 'Hyderabad',
    s1: 75,
    s2: 86,
    tags: ['Startups', 'Gaming', 'Cooking'],
    bio: 'SWE at a startup. Building a community for indie hackers. Love cooking experimental dishes.',
    gradient: 'linear-gradient(135deg,#1a5a9a,#8a2a4a)'
  }
];

// ===== CHAT PROMPTS =====
const PROMPTS = [
  "Ask what they're building this year 🏗️",
  "Share a recent life shift ✨",
  "Talk about your next big goal 🎯",
  "What's exciting you right now? ⚡"
];

// ===== AUTO-REPLIES =====
const AUTO_REPLIES = {
  1: [
    "Hey! 😊 So cool to connect — what kind of side project are you working on?",
    "That sounds amazing! I've been thinking about building something similar.",
    "Would love to grab a virtual coffee and chat more!"
  ],
  2: [
    "Hey! Another CAT aspirant 🙌 Which institutes are you targeting?",
    "Same! The preparation grind is real. What's your strategy?",
    "We should definitely form a study group!"
  ],
  3: [
    "Omg yes!! Design talk dates are the best kind of plans 🎨",
    "I've been wanting to visit the Chhatrapati Shivaji museum — you?",
    "Let's plan something soon!"
  ],
  4: [
    "Running buddies are hard to find! What's your pace target? 🏃",
    "Half marathons are so rewarding. I'm training too!",
    "We should run together sometime!"
  ],
  5: [
    "A fellow deep thinker! 🔭 What are you researching?",
    "Physics and mindfulness — what a combo. I'm into both.",
    "Would love to hear about your research!"
  ],
  6: [
    "Indie hacker community sounds amazing! Tell me more 🚀",
    "I've been trying to build in public. Any tips?",
    "Let's collaborate sometime!"
  ]
};

// ===== DEMO DATA (landing page phone mockup) =====
const DEMO_DATA = [
  { emoji: '👩‍💻', name: 'Priya S.', meta: 'REMOTE PROFESSIONAL · DELHI · 27', s1: 85, s2: 92, tags: ['Startup Life', 'Café Hopper', 'Growth'] },
  { emoji: '👨‍🎓', name: 'Arjun K.', meta: 'UNIVERSITY STUDENT · BANGALORE · 22', s1: 78, s2: 88, tags: ['CAT Prep', 'Fitness', 'Tech'] },
  { emoji: '👩‍🎨', name: 'Simran M.', meta: 'UX DESIGNER · MUMBAI · 26', s1: 90, s2: 94, tags: ['Design', 'Travel', 'Side Hustles'] }
];

module.exports = { PROFILES, PROMPTS, AUTO_REPLIES, DEMO_DATA };
