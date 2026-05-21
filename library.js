// Rhythm Reader - Curated Offline Library
// This library provides 100% reliable, pre-synced "Missions" that run perfectly offline.

const curatedLibrary = [
  {
    id: "mission-01",
    title: "Mission 1: The Awakening",
    artist: "Neon Synth (110 BPM)",
    genre: "🚀 Sci-Fi",
    thumb: "https://images.unsplash.com/photo-1550684848-fac1c5b4e853?auto=format&fit=crop&w=300&q=80",
    audioSource: "synthwave", // Tells the engine to use the procedural synth
    bpm: 110,
    text: `The year is 3042. Humanity has reached the edges of the Andromeda galaxy. 
You are the commander of the starship Horizon. 
Suddenly, a bright anomaly appears on the radar. 
It pulses with an unknown energy, defying all laws of physics. 
Your crew looks to you for orders. 
Do you engage the hyper-drive, or investigate the unknown? 
The choice will shape the future of our species.`
  },
  {
    id: "mission-02",
    title: "Mission 2: Deep Focus",
    artist: "Chill Lofi (85 BPM)",
    genre: "✨ Chill",
    thumb: "https://images.unsplash.com/photo-1518609878373-06d740f60d8b?auto=format&fit=crop&w=300&q=80",
    audioSource: "lofi",
    bpm: 85,
    text: `Breathe in deeply. Hold it. And exhale slowly. 
Focus is not about forcing your mind to work. 
It is about letting go of the distractions around you. 
Like a calm river, your thoughts flow naturally. 
When a distraction arises, acknowledge it, and let it pass. 
You are in control of your attention. 
Your mind is sharp, calm, and ready to absorb knowledge.`
  },
  {
    id: "mission-03",
    title: "Mission 3: The Magic Soroban",
    artist: "Space Ambient (70 BPM)",
    genre: "📚 Tale",
    thumb: "https://images.unsplash.com/photo-1532012197267-da84d127e765?auto=format&fit=crop&w=300&q=80",
    audioSource: "ambient",
    bpm: 70,
    text: `Long ago, in a village nestled between misty mountains, lived a young student. 
He possessed an ancient abacus, carved from dark cherry wood. 
When he moved the beads, they did not just calculate numbers. 
They calculated the movements of the stars themselves. 
One night, under a lunar eclipse, the beads began to glow. 
A hidden equation was unlocking the secrets of the cosmos.`
  },
  {
    id: "mission-04",
    title: "Mission 4: Cybernetic Run",
    artist: "Neon Synth (110 BPM)",
    genre: "🚀 Sci-Fi",
    thumb: "https://images.unsplash.com/photo-1526304640581-d334cdbbf45e?auto=format&fit=crop&w=300&q=80",
    audioSource: "synthwave",
    bpm: 110,
    text: `Neon lights reflect in the rain-soaked streets of Neo-Tokyo. 
You are carrying the encrypted data drive. 
Corporate drones are scanning the grid, hunting for your signal. 
You dive into a narrow alleyway, boots splashing in puddles. 
A hover-car sweeps past overhead, its searchlight narrowly missing you. 
You have sixty seconds to reach the extraction point. 
Run.`
  },
  {
    id: "mission-05",
    title: "Mission 5: Stoic Meditations",
    artist: "Chill Lofi (85 BPM)",
    genre: "✨ Chill",
    thumb: "https://images.unsplash.com/photo-1499209974431-9dddcece7f88?auto=format&fit=crop&w=300&q=80",
    audioSource: "lofi",
    bpm: 85,
    text: `You have power over your mind, not outside events. 
Realize this, and you will find strength. 
The happiness of your life depends upon the quality of your thoughts. 
Waste no more time arguing what a good person should be. Be one. 
If it is not right, do not do it. 
If it is not true, do not say it. 
Stand straight, not held straight.`
  },
  {
    id: "mission-06",
    title: "Mission 6: The Quantum Realm",
    artist: "Space Ambient (70 BPM)",
    genre: "🚀 Sci-Fi",
    thumb: "https://images.unsplash.com/photo-1635070041078-e363dbe005cb?auto=format&fit=crop&w=300&q=80",
    audioSource: "ambient",
    bpm: 70,
    text: `As the subatomic shrink-drive engages, the macroscopic world vanishes. 
You are now smaller than a photon. 
Around you, the fabric of reality boils with quantum foam. 
Time loses its linear meaning here. 
Past, present, and future exist simultaneously in a vibrating haze. 
To navigate this space, you must rely on pure intuition. 
Welcome to the foundational layer of the universe.`
  }
];

// Helper to mathematically sync text to a BPM track
function generateSyncedWordQueue(mission, targetWpm) {
  const queue = [];
  const words = mission.text.split(/\\s+/).filter(w => w.trim().length > 0);
  
  // Example calculation: 
  // If targetWpm is 200, each word takes (60/200) = 0.3 seconds.
  const secondsPerWord = 60 / targetWpm;
  
  let currentTimestamp = 0.5; // Start half a second in
  
  words.forEach((word, index) => {
    queue.push({
      word: word,
      start: currentTimestamp,
      end: currentTimestamp + secondsPerWord - 0.05,
      index: index
    });
    
    // Add extra pause for punctuation
    let delay = secondsPerWord;
    if (word.match(/[.,!?]/)) delay += secondsPerWord * 0.5;
    
    currentTimestamp += delay;
  });
  
  return queue;
}
