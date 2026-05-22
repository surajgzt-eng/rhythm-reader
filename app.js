/* ==========================================================================
   Rhythm Reader - Core Game Loop & Application Controller
   ========================================================================== */

import { curatedLibrary, generateSyncedWordQueue } from './library.js';

// --- 1. Global State Management ---
const gameState = {
  // Configs & Credentials (with default placeholders)
  config: {
    firebase: null, // loaded from localStorage if configured
    razorpayBtnMonthly: 'btn_H1a2b3c4d5',
    razorpayBtnYearly: 'btn_H5d4c3b2a1',
    paypalClientId: 'sb-paypal-sandbox-client-id',
    upiId: '9361409566@upi',
    bankName: 'State Bank of India',
    bankHolder: 'STEM Abacus Academy',
    bankAccount: '936140956612',
    bankIfsc: 'SBIN0001234',
    youtubeApiKey: ''
  },
  
  // User Authentication Info
  user: null, 
  isPremium: false,
  
  // Freemium Funnel Counters
  trial: {
    start: null,
    matchesPlayedToday: 0,
    lastPlayedDateStr: ''
  },

  // Active Session State
  isActive: false,
  mode: 'active', // 'active' or 'passive'
  wpm: 200,
  lap: 1,
  score: 0,
  combo: 1,
  maxCombo: 0,
  totalWordsRead: 0,
  laneHits: 0,
  laneAttempts: 0,
  startTime: null,
  elapsedTime: 0,
  
  // Words & Timing Arrays
  words: [],
  currentWordIndex: 0,
  timerInterval: null,
  rsvpTimeout: null,
  lapTimer: 30, // seconds per lap before WPM increase
  
  // Music & Synth Engine
  audioCtx: null,
  synthLoopId: null,
  synthTempoBPM: 100,
  synthVolume: 0.5,
  synthTrack: '',
  musicSource: 'youtube',
  youtubeSelectedVideo: null,
  lyrics: null,
  lyricsSource: null,
  syncedLyrics: null,       // raw LRC string with timestamps
  syncedWordQueue: [],       // parsed [{time, word, index}]
  syncMode: false,           // true = timestamp sync, false = fixed WPM
  syncPoller: null,          // requestAnimationFrame ID for sync loop
  ytPlayer: null,
  ytPlayerReady: false,
  lastYtTime: -1,
  ytTimeBase: 0,
  localTimeBase: 0,
  needsSyncReset: true,
  lyricsOffset: 0,           // manual offset in seconds (positive = show lyrics later)
  
  // Visuals & Gameplay Animation
  notes: [], // falling note coordinates
  animationFrameId: null,
  noteSpeed: 3.5, // vertical falling speed factor
  targetLineY: 215, // target hit baseline relative height
  orpColor: '#ff007f',
  stats: {
    lifetimeWords: 0,
    lifetimeSessions: 0,
    peakWPM: 0,
    lifetimeTimeSeconds: 0,
    history: []
  }
};

// Preset Texts
const textPresets = {
  scifi: `A blinding flash shattered the night. The warp engines hummed a deep melody, vibrating through the steel deck plates of the spaceship. Captain Leo gripped his pilot chair as the stars stretched into long neon threads. "Prepare for jump," he commanded, his voice echoing in the metallic cockpit. In three seconds, the ship leaped across the event horizon, vanishing into the deep cosmic sea of the galaxy. They had reached Warp Speed. A new cosmic horizon awaited them, filled with glowing nebula clouds, uncharted planets, and the mysterious whispers of ancient alien civilisations. Every crew member held their breath as the scanner screens lit up with coordinates. We were finally home.`,
  quotes: `Focus is the key to unlocking genius. "The beautiful thing about learning is that nobody can take it away from you." When you read, you expand your mind. Speed reading is not just about flashing letters, it is about training your brain to see phrases instead of characters. Keep your eye focused on the optimal red letters. Let your peripheral vision capture the prefix and suffix of each word. Breathe in sync with the rhythm. Accuracy comes first. Speed follows naturally. Keep training. Keep believing. Excel daily.`,
  fairytale: `Once upon a time, in an enchanted forest named Woraiyur, there lived a young wizard named Sam. Sam struggled with his arithmetic spells until he found a golden Soroban abacus buried under a giant banyan tree. The beads sparkled with amber magic. Whenever Sam slid a bead, a musical note played in the air, creating a beautiful rhythm that calmed the forest creatures. "One plus two equals three!" sang the birds. By aligning the beads to the rhythm, Sam was able to cast speed math spells faster than any wizard in the land. The abacus was not just a tool; it was a key to unlocking the power of his focus, memory, and concentration. He became the legendary Smart Memory Master of the kingdom, teaching everyone that learning is a fun and magical adventure.`
};

// --- 2. Initialize Application ---
document.addEventListener('DOMContentLoaded', () => {
  loadStoredSettings();
  setupFreemiumTrial();
  setupUIEventListeners();
  updateAuthUI();
  updateTrialStatusUI();
  initVisualizer();
  initHomePageListeners();
  renderHomePageSongs('all');

  // Register PWA Service Worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js')
      .then(reg => console.log('Service Worker registered successfully!', reg.scope))
      .catch(err => console.error('Service Worker registration failed:', err));
  }

  // PWA Install Prompt handling
  let deferredPrompt;
  const btnPwaInstall = document.getElementById('btn-pwa-install');
  
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (btnPwaInstall) {
      btnPwaInstall.classList.remove('hidden');
    }
  });

  if (btnPwaInstall) {
    btnPwaInstall.addEventListener('click', async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      console.log(`User response to the install prompt: ${outcome}`);
      deferredPrompt = null;
      btnPwaInstall.classList.add('hidden');
    });
  }

  window.addEventListener('appinstalled', (event) => {
    console.log('Rhythm Reader was successfully installed.');
    if (btnPwaInstall) {
      btnPwaInstall.classList.add('hidden');
    }
  });
});

// Load configs & settings
function loadStoredSettings() {
  const savedConfig = localStorage.getItem('rr_admin_config');
  if (savedConfig) {
    try {
      gameState.config = { ...gameState.config, ...JSON.parse(savedConfig) };
    } catch (e) {
      console.error("Error parsing admin config:", e);
    }
  }

  // Load general user settings
  const savedSettings = localStorage.getItem('rr_user_settings');
  if (savedSettings) {
    try {
      const settings = JSON.parse(savedSettings);
      document.getElementById('settings-font').value = settings.font || 'Space Grotesk';
      document.getElementById('settings-show-visualizer').checked = settings.showVisualizer !== false;
      document.getElementById('settings-orp-enabled').checked = settings.orpEnabled !== false;
      document.getElementById('settings-pause-punctuation').checked = settings.pausePunctuation !== false;
      gameState.orpColor = settings.orpColor || '#ff007f';
      
      // Update UI active color dot
      document.querySelectorAll('.color-dot').forEach(dot => {
        if (dot.dataset.color === gameState.orpColor) {
          dot.classList.add('active');
        } else {
          dot.classList.remove('active');
        }
      });
      applySettingsStyles();
    } catch (e) {
      console.error("Error loading user settings", e);
    }
  }

  // Load reading stats
  const savedStats = localStorage.getItem('rr_reading_stats');
  if (savedStats) {
    try {
      gameState.stats = { ...gameState.stats, ...JSON.parse(savedStats) };
    } catch (e) {
      console.error("Error parsing reading stats:", e);
    }
  } else {
    gameState.stats = {
      lifetimeWords: 0,
      lifetimeSessions: 0,
      peakWPM: 0,
      lifetimeTimeSeconds: 0,
      history: []
    };
  }
}

// Freemium Logic Tracker
function setupFreemiumTrial() {
  let trialStart = localStorage.getItem('rr_trial_start');
  if (!trialStart) {
    trialStart = Date.now();
    localStorage.setItem('rr_trial_start', trialStart);
  }
  gameState.trial.start = parseInt(trialStart);

  const todayStr = new Date().toDateString();
  gameState.trial.lastPlayedDateStr = localStorage.getItem('rr_trial_last_date') || todayStr;
  
  if (gameState.trial.lastPlayedDateStr !== todayStr) {
    // New day, reset match count
    gameState.trial.matchesPlayedToday = 0;
    localStorage.setItem('rr_trial_matches', 0);
    localStorage.setItem('rr_trial_last_date', todayStr);
  } else {
    gameState.trial.matchesPlayedToday = parseInt(localStorage.getItem('rr_trial_matches') || '0');
  }
}

// Check if limits are hit
function checkPlayAllowance() {
  if (gameState.isPremium) return true; // Premium bypasses all

  const hoursElapsed = (Date.now() - gameState.trial.start) / (1000 * 60 * 60);
  if (hoursElapsed <= 24) {
    return true; // Day 1: Unlimited play
  }

  // Day 2+: limit to 2 matches
  if (gameState.trial.matchesPlayedToday >= 2) {
    // Trigger Paywall Modal
    openModal('modal-subscription');
    return false;
  }
  return true;
}

// Increment match count
function recordPlayedMatch() {
  if (gameState.isPremium) return;

  const hoursElapsed = (Date.now() - gameState.trial.start) / (1000 * 60 * 60);
  if (hoursElapsed > 24) {
    gameState.trial.matchesPlayedToday++;
    localStorage.setItem('rr_trial_matches', gameState.trial.matchesPlayedToday);
    localStorage.setItem('rr_trial_last_date', new Date().toDateString());
    updateTrialStatusUI();
  }
}

// --- 3. UI Interactions & Event Listeners ---
function isPremiumOrDay1() {
  if (gameState.isPremium) return true;
  const hoursElapsed = (Date.now() - gameState.trial.start) / (1000 * 60 * 60);
  return hoursElapsed <= 24;
}

let currentWizardStep = 1;

function goToStep(step) {
  if (step < 1 || step > 3) return;
  currentWizardStep = step;
  
  for (let i = 1; i <= 3; i++) {
    const dot = document.getElementById(`step-dot-${i}`);
    const pane = document.getElementById(`wizard-pane-${i}`);
    if (i <= step) {
      dot.classList.add('active');
    } else {
      dot.classList.remove('active');
    }
    if (i === step) {
      pane.classList.add('active');
    } else {
      pane.classList.remove('active');
    }
  }
}

function setupUIEventListeners() {
  // Wizard dots click
  document.querySelectorAll('.wizard-step-dot').forEach(dot => {
    dot.addEventListener('click', () => {
      const step = parseInt(dot.dataset.step);
      goToStep(step);
    });
  });

  // Wizard Navigation Action Buttons
  document.querySelectorAll('.btn-next-step').forEach(btn => {
    btn.addEventListener('click', () => {
      const current = parseInt(btn.dataset.current);
      goToStep(current + 1);
    });
  });
  document.querySelectorAll('.btn-prev-step').forEach(btn => {
    btn.addEventListener('click', () => {
      const current = parseInt(btn.dataset.current);
      goToStep(current - 1);
    });
  });

  // Preset Texts Selection (Step 1)
  document.querySelectorAll('.wizard-option-btn[data-preset]').forEach(btn => {
    btn.addEventListener('click', () => {
      const preset = btn.dataset.preset;
      if (preset === 'custom') {
        if (!isPremiumOrDay1()) {
          openModal('modal-subscription');
          return;
        }
        document.querySelectorAll('.wizard-option-btn[data-preset]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('custom-text-input-container').classList.remove('hidden');
      } else {
        document.querySelectorAll('.wizard-option-btn[data-preset]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('custom-text-input-container').classList.add('hidden');
        // Auto-advance
        setTimeout(() => goToStep(2), 250);
      }
    });
  });

  // Soundtrack Selection (Step 2)
  document.querySelectorAll('.wizard-option-btn[data-track]').forEach(btn => {
    btn.addEventListener('click', () => {
      const track = btn.dataset.track;
      if (track === 'custom-search') {
        if (!isPremiumOrDay1()) {
          openModal('modal-subscription');
          return;
        }
        document.querySelectorAll('#wizard-pane-2 .wizard-option-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('custom-search-container').classList.remove('hidden');
      } else {
        document.querySelectorAll('#wizard-pane-2 .wizard-option-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        gameState.musicSource = 'presets';
        gameState.synthTrack = track;
        document.getElementById('custom-search-container').classList.add('hidden');
        // Clear active YouTube selections
        gameState.youtubeSelectedVideo = null;
        gameState.lyrics = null;
        document.getElementById('selected-yt-video-card').classList.add('hidden');
        // Auto-advance
        setTimeout(() => goToStep(3), 250);
      }
    });
  });

  // WPM Slider Adjust
  const wpmSlider = document.getElementById('input-wpm-slider');
  const wpmDisplay = document.getElementById('wpm-display');
  wpmSlider.addEventListener('input', () => {
    gameState.wpm = parseInt(wpmSlider.value);
    wpmDisplay.textContent = `${gameState.wpm} WPM`;
  });

  // Launch Game Session Button
  document.getElementById('btn-start-game').addEventListener('click', () => {
    if (!checkPlayAllowance()) return;
    launchGameSession();
  });

  // Settings Modal controls
  document.getElementById('btn-settings-toggle').addEventListener('click', () => openModal('modal-settings'));
  document.getElementById('btn-close-settings-modal').addEventListener('click', () => closeModal('modal-settings'));
  
  // Settings Apply
  document.getElementById('btn-save-settings').addEventListener('click', () => {
    const font = document.getElementById('settings-font').value;
    const showVisualizer = document.getElementById('settings-show-visualizer').checked;
    const orpEnabled = document.getElementById('settings-orp-enabled').checked;
    const pausePunctuation = document.getElementById('settings-pause-punctuation').checked;
    
    const settings = { font, showVisualizer, orpEnabled, pausePunctuation, orpColor: gameState.orpColor };
    localStorage.setItem('rr_user_settings', JSON.stringify(settings));
    
    applySettingsStyles();
    closeModal('modal-settings');
  });

  // Color Dot picker
  document.querySelectorAll('.color-dot').forEach(dot => {
    dot.addEventListener('click', () => {
      document.querySelectorAll('.color-dot').forEach(d => d.classList.remove('active'));
      dot.classList.add('active');
      gameState.orpColor = dot.dataset.color;
    });
  });

  // Subscription Modal Toggle
  document.getElementById('btn-close-sub-modal').addEventListener('click', () => closeModal('modal-subscription'));

  // Select Pricing Plan
  document.querySelectorAll('.select-plan-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const plan = btn.dataset.plan;
      const price = btn.dataset.price;
      
      document.getElementById('checkout-plan-name').textContent = plan === 'monthly' ? 'Monthly Pass' : 'Yearly Pass';
      document.getElementById('checkout-amount').textContent = price;
      
      // Update UPI link & QR Code dynamically
      generateUPIPayment(price, plan);
      
      document.getElementById('payment-gateways-box').classList.remove('hidden');
      document.getElementById('payment-gateways-box').scrollIntoView({ behavior: 'smooth' });
    });
  });

  // Payment Tabs Toggle
  document.querySelectorAll('.pay-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.pay-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      
      document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.remove('active'));
      document.getElementById(`pay-content-${tab.dataset.paymethod}`).classList.add('active');
    });
  });

  // Simulated Google Sign-In (Gmail account)
  document.getElementById('btn-google-login').addEventListener('click', () => {
    simulateGoogleLogin();
  });
  document.getElementById('btn-logout').addEventListener('click', () => {
    logoutUser();
  });

  // Sandbox Mode Success Checkout Bypass
  document.getElementById('btn-sandbox-pay-success').addEventListener('click', () => {
    upgradeUserSubscription();
  });

  // Simulated Payment Buttons
  document.getElementById('btn-simulate-razorpay').addEventListener('click', () => {
    alert("Razorpay checkout UI opened securely. Proceeding with simulator...");
    upgradeUserSubscription();
  });
  document.getElementById('btn-simulate-paypal').addEventListener('click', () => {
    alert("PayPal checkout overlay opened. Proceeding with simulator...");
    upgradeUserSubscription();
  });

  // Exit & Pause controllers
  document.getElementById('btn-game-pause').addEventListener('click', togglePauseGame);
  document.getElementById('btn-game-restart').addEventListener('click', restartSession);
  document.getElementById('btn-exit-game').addEventListener('click', exitSession);
  document.getElementById('btn-play-again').addEventListener('click', () => {
    document.getElementById('summary-screen').classList.add('hidden');
    stopSessionLoops();
    launchGameSession();
  });
  document.getElementById('btn-summary-gohome').addEventListener('click', () => {
    document.getElementById('summary-screen').classList.add('hidden');
    // FIX: same hidden-class fix for Home button
    const setupScreen = document.getElementById('setup-screen');
    setupScreen.classList.remove('hidden');
    setupScreen.classList.add('active');
  });

  // WPM Manual Adjustments in Game
  document.getElementById('btn-speed-up').addEventListener('click', () => adjustWPM(25));
  document.getElementById('btn-speed-down').addEventListener('click', () => adjustWPM(-25));

  // Lyrics Sync Offset (nudge words earlier or later vs song playback)
  function updateOffsetDisplay() {
    const el = document.getElementById('offset-display');
    if (el) {
      const sign = gameState.lyricsOffset >= 0 ? '+' : '';
      el.textContent = `Sync: ${sign}${gameState.lyricsOffset}s`;
      el.style.color = gameState.lyricsOffset !== 0 ? 'var(--color-pink)' : 'var(--color-cyan)';
    }
  }
  document.getElementById('btn-offset-plus').addEventListener('click', () => {
    gameState.lyricsOffset = Math.round((gameState.lyricsOffset + 1) * 10) / 10;
    gameState.needsSyncReset = true; // force re-calibration
    updateOffsetDisplay();
  });
  document.getElementById('btn-offset-minus').addEventListener('click', () => {
    gameState.lyricsOffset = Math.round((gameState.lyricsOffset - 1) * 10) / 10;
    gameState.needsSyncReset = true;
    updateOffsetDisplay();
  });

  // Volume slider adjust
  document.getElementById('input-volume-slider').addEventListener('input', (e) => {
    gameState.synthVolume = parseFloat(e.target.value);
    if (gameState.customAudio) {
      gameState.customAudio.volume = gameState.synthVolume;
    }
    if (gameState.ytPlayerReady && gameState.ytPlayer) {
      try {
        gameState.ytPlayer.setVolume(gameState.synthVolume * 100);
      } catch (err) {
        console.warn(err);
      }
    }
  });

  // Share Reddit Card Clipboard trigger
  document.getElementById('btn-share-reddit').addEventListener('click', copyRedditShareCard);

  // Admin Modal Panel Toggle
  document.getElementById('btn-admin-panel-toggle').addEventListener('click', () => openModal('modal-admin-panel'));
  document.getElementById('btn-close-admin-modal').addEventListener('click', () => closeModal('modal-admin-panel'));
  
  // Admin Tabs Toggle
  document.querySelectorAll('.admin-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      
      document.querySelectorAll('.admin-pane').forEach(pane => pane.classList.remove('active'));
      document.getElementById(`admin-pane-${tab.dataset.tab}`).classList.add('active');
    });
  });

  // Admin config save
  document.getElementById('form-admin-config').addEventListener('submit', (e) => {
    e.preventDefault();
    saveAdminConfig();
  });
  document.getElementById('btn-reset-admin-config').addEventListener('click', resetAdminConfig);

  // Admin User Database Search
  document.getElementById('btn-search-user').addEventListener('click', searchUserSubscription);
  document.getElementById('btn-save-user-sub').addEventListener('click', saveManualUserSubscription);



  const btnSearch = document.getElementById('btn-yt-search');
  const inputSearch = document.getElementById('input-yt-search');

  btnSearch.addEventListener('click', () => {
    performYoutubeSearch(inputSearch.value.trim());
  });

  inputSearch.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      performYoutubeSearch(inputSearch.value.trim());
    }
  });

  document.getElementById('btn-clear-yt-selection').addEventListener('click', () => {
    gameState.youtubeSelectedVideo = null;
    gameState.lyrics = null;
    gameState.lyricsSource = null;
    document.getElementById('selected-yt-video-card').classList.add('hidden');
  });

  const btnTogglePlayer = document.getElementById('btn-toggle-yt-player');
  const playerContainer = document.getElementById('yt-player-container');
  
  btnTogglePlayer.addEventListener('click', () => {
    const isMinimized = playerContainer.classList.contains('minimized');
    if (isMinimized) {
      playerContainer.classList.remove('minimized');
      btnTogglePlayer.innerHTML = '<i class="fa-solid fa-chevron-down"></i>';
    } else {
      playerContainer.classList.add('minimized');
      btnTogglePlayer.innerHTML = '<i class="fa-solid fa-chevron-up"></i>';
    }
  });

  // Local File Import handler
  const fileUpload = document.getElementById('input-file-upload');
  const customTextArea = document.getElementById('textarea-custom-text');
  const fileDropZone = document.querySelector('.file-import-zone');
  
  if (fileUpload && customTextArea) {
    fileUpload.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      
      const reader = new FileReader();
      reader.onload = (event) => {
        customTextArea.value = event.target.result;
        customTextArea.dispatchEvent(new Event('input'));
        alert(`Successfully imported text from "${file.name}"`);
      };
      reader.readAsText(file);
    });
  }

  if (fileDropZone && customTextArea) {
    // Prevent default drag behaviors
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
      fileDropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
      }, false);
    });

    // Highlight drop zone on dragenter/dragover
    ['dragenter', 'dragover'].forEach(eventName => {
      fileDropZone.addEventListener(eventName, () => {
        fileDropZone.style.borderColor = 'var(--accent-cyan)';
        fileDropZone.style.background = 'rgba(0, 240, 255, 0.08)';
        fileDropZone.style.boxShadow = '0 0 10px rgba(0, 240, 255, 0.15)';
      }, false);
    });

    // Remove highlight on dragleave/drop
    ['dragleave', 'drop'].forEach(eventName => {
      fileDropZone.addEventListener(eventName, () => {
        fileDropZone.style.borderColor = 'rgba(0, 240, 255, 0.25)';
        fileDropZone.style.background = 'rgba(0, 240, 255, 0.03)';
        fileDropZone.style.boxShadow = 'none';
      }, false);
    });

    // Handle file drop
    fileDropZone.addEventListener('drop', (e) => {
      const dt = e.dataTransfer;
      const file = dt.files[0];
      if (file && file.name.endsWith('.txt')) {
        const reader = new FileReader();
        reader.onload = (event) => {
          customTextArea.value = event.target.result;
          customTextArea.dispatchEvent(new Event('input'));
          alert(`Successfully imported text from "${file.name}"`);
        };
        reader.readAsText(file);
      } else {
        alert("Please drop a valid plain text file (.txt).");
      }
    });
  }

  // Stats Modal triggers
  const btnStatsToggle = document.getElementById('btn-stats-toggle');
  if (btnStatsToggle) {
    btnStatsToggle.addEventListener('click', () => {
      renderStatsModal();
      openModal('modal-stats');
    });
  }
  const btnCloseStatsModal = document.getElementById('btn-close-stats-modal');
  if (btnCloseStatsModal) {
    btnCloseStatsModal.addEventListener('click', () => closeModal('modal-stats'));
  }
  const btnCloseStats = document.getElementById('btn-close-stats');
  if (btnCloseStats) {
    btnCloseStats.addEventListener('click', () => closeModal('modal-stats'));
  }

  // Reset Stats handler
  const btnResetStats = document.getElementById('btn-reset-stats');
  if (btnResetStats) {
    btnResetStats.addEventListener('click', () => {
      if (confirm("Are you sure you want to permanently clear all your reading speed statistics and history logs?")) {
        gameState.stats = {
          lifetimeWords: 0,
          lifetimeSessions: 0,
          peakWPM: 0,
          lifetimeTimeSeconds: 0,
          history: []
        };
        localStorage.setItem('rr_reading_stats', JSON.stringify(gameState.stats));
        renderStatsModal();
        alert("Your statistics have been reset successfully.");
      }
    });
  }
}

// Function to open modals safely
function openModal(modalId) {
  document.getElementById(modalId).classList.add('active');
}

// Close modals
function closeModal(modalId) {
  document.getElementById(modalId).classList.remove('active');
}

// Apply settings styling
function applySettingsStyles() {
  const font = document.getElementById('settings-font').value;
  document.getElementById('rsvp-word-box').style.fontFamily = `"${font}", monospace`;
  
  // Update ORP highlight colors dynamically in stylesheet rules
  document.documentElement.style.setProperty('--color-pink', gameState.orpColor);
  document.documentElement.style.setProperty('--glow-pink', `0 0 15px ${gameState.orpColor}`);
}

// --- 4. Simulated authentication database (Google Sign-In / Firebase) ---
function simulateGoogleLogin() {
  // Trigger a standard text prompt to gather user Gmail (for sandbox simulation)
  const email = prompt("Enter your Gmail address to sign in:", "suraj.gzt@gmail.com");
  if (!email || !email.includes('@')) {
    alert("Invalid Gmail address!");
    return;
  }
  
  const name = email.split('@')[0];
  const avatarUrl = `https://api.dicebear.com/7.x/bottts/svg?seed=${name}`;
  
  gameState.user = { email, name, avatarUrl };
  
  // Check user subscription from Firestore/LocalStorage simulator
  const savedUserDb = JSON.parse(localStorage.getItem('rr_simulated_user_db') || '{}');
  if (savedUserDb[email]) {
    gameState.isPremium = savedUserDb[email].premium;
  } else {
    // Create new user profile in simulated database
    gameState.isPremium = false;
    savedUserDb[email] = { email, name, premium: false, planExpires: null };
    localStorage.setItem('rr_simulated_user_db', JSON.stringify(savedUserDb));
  }

  updateAuthUI();
  updateTrialStatusUI();
  alert(`Logged in successfully as: ${email}`);
}

function logoutUser() {
  gameState.user = null;
  gameState.isPremium = false;
  updateAuthUI();
  updateTrialStatusUI();
  alert("Logged out successfully.");
}

function updateAuthUI() {
  const btnLogin = document.getElementById('btn-google-login');
  const userProfile = document.getElementById('user-profile');
  const adminToggle = document.getElementById('btn-admin-panel-toggle');
  
  if (gameState.user) {
    btnLogin.classList.add('hidden');
    userProfile.classList.remove('hidden');
    
    document.getElementById('user-avatar').src = gameState.user.avatarUrl;
    document.getElementById('user-display-name').textContent = gameState.user.name;
    
    const subLabel = document.getElementById('user-sub-status');
    if (gameState.isPremium) {
      subLabel.textContent = "Premium Plan";
      subLabel.className = "sub-status premium";
    } else {
      subLabel.textContent = "Free Plan";
      subLabel.className = "sub-status free";
    }

    // Owner check: suraj.gzt@gmail.com unlocks Admin Panel gear icon!
    if (gameState.user.email.toLowerCase() === 'suraj.gzt@gmail.com') {
      adminToggle.classList.remove('hidden');
      loadAdminConfigUI();
    } else {
      adminToggle.classList.add('hidden');
    }
  } else {
    btnLogin.classList.remove('hidden');
    userProfile.classList.add('hidden');
    adminToggle.classList.add('hidden');
  }
}

function updateTrialStatusUI() {
  const badge = document.getElementById('trial-badge');
  const badgeText = document.getElementById('trial-badge-text');

  if (gameState.isPremium) {
    badge.className = "trial-badge status-day1";
    badgeText.innerHTML = '<i class="fa-solid fa-crown"></i> Unlimited Premium Active';
    return;
  }

  const hoursElapsed = (Date.now() - gameState.trial.start) / (1000 * 60 * 60);
  if (hoursElapsed <= 24) {
    badge.className = "trial-badge status-day1";
    badgeText.innerHTML = `<i class="fa-solid fa-clock"></i> Day 1: Unlimited Trial`;
  } else {
    const playsLeft = Math.max(0, 2 - gameState.trial.matchesPlayedToday);
    badge.className = playsLeft > 0 ? "trial-badge status-day1" : "trial-badge status-limit";
    badgeText.innerHTML = `<i class="fa-solid fa-ticket"></i> Day 2+: ${playsLeft} Free Matches Left`;
  }
}

// Upgrade User Premium Status on database
function upgradeUserSubscription() {
  if (!gameState.user) {
    // If not logged in, prompt to log in first
    alert("Please log in with your Google Account (Gmail) first to assign the premium subscription to your account!");
    simulateGoogleLogin();
    return;
  }
  
  gameState.isPremium = true;
  
  // Save to Simulated DB
  const email = gameState.user.email;
  const savedUserDb = JSON.parse(localStorage.getItem('rr_simulated_user_db') || '{}');
  
  // Expiration date (1 month from now by default for test button, or 1 year depending on plan selected)
  const plan = document.getElementById('checkout-plan-name').textContent.toLowerCase();
  const expireDate = new Date();
  if (plan.includes('year')) {
    expireDate.setFullYear(expireDate.getFullYear() + 1);
  } else {
    expireDate.setMonth(expireDate.getMonth() + 1);
  }

  savedUserDb[email] = {
    email,
    name: gameState.user.name,
    premium: true,
    planExpires: expireDate.toISOString().split('T')[0]
  };
  localStorage.setItem('rr_simulated_user_db', JSON.stringify(savedUserDb));
  
  updateAuthUI();
  updateTrialStatusUI();
  closeModal('modal-subscription');
  alert(`Subscription activated successfully for account: ${email}! Expiration Date: ${savedUserDb[email].planExpires}`);
}

// --- 5. UPI Payment URL & QR Generator ---
function generateUPIPayment(price, plan) {
  const upiId = gameState.config.upiId;
  const note = encodeURIComponent(`Rhythm Reader ${plan === 'monthly' ? 'Monthly' : 'Yearly'} Pass Upgrade`);
  const upiUrl = `upi://pay?pa=${upiId}&pn=${encodeURIComponent('Rhythm Reader')}&am=${price}&cu=INR&tn=${note}`;
  
  // Set link for Mobile launcher
  const deepLinkBtn = document.getElementById('btn-upi-deeplink');
  deepLinkBtn.href = upiUrl;
  
  // Generate scanable QR image (using qrserver API)
  const qrImage = document.getElementById('upi-qr-image');
  qrImage.src = `https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(upiUrl)}`;
  
  // Update bank text fields
  document.getElementById('bank-name-lbl').textContent = gameState.config.bankName;
  document.getElementById('bank-holder-lbl').textContent = gameState.config.bankHolder;
  document.getElementById('bank-account-lbl').textContent = gameState.config.bankAccount;
  document.getElementById('bank-ifsc-lbl').textContent = gameState.config.bankIfsc;
}

// --- 6. Admin Panel Functions (suraj.gzt@gmail.com dashboard) ---
function loadAdminConfigUI() {
  document.getElementById('cfg-firebase-api-key').value = gameState.config.firebase ? gameState.config.firebase.apiKey : '';
  document.getElementById('cfg-firebase-auth-domain').value = gameState.config.firebase ? gameState.config.firebase.authDomain : '';
  document.getElementById('cfg-firebase-project-id').value = gameState.config.firebase ? gameState.config.firebase.projectId : '';
  document.getElementById('cfg-firebase-app-id').value = gameState.config.firebase ? gameState.config.firebase.appId : '';
  
  document.getElementById('cfg-razorpay-btn-monthly').value = gameState.config.razorpayBtnMonthly;
  document.getElementById('cfg-razorpay-btn-yearly').value = gameState.config.razorpayBtnYearly;
  document.getElementById('cfg-paypal-client-id').value = gameState.config.paypalClientId;
  document.getElementById('cfg-upi-id').value = gameState.config.upiId;
  document.getElementById('cfg-youtube-api-key').value = gameState.config.youtubeApiKey || '';
  
  document.getElementById('cfg-bank-name').value = gameState.config.bankName;
  document.getElementById('cfg-bank-holder').value = gameState.config.bankHolder;
  document.getElementById('cfg-bank-account').value = gameState.config.bankAccount;
  document.getElementById('cfg-bank-ifsc').value = gameState.config.bankIfsc;
}

function saveAdminConfig() {
  const firebaseKey = document.getElementById('cfg-firebase-api-key').value;
  const firebaseDomain = document.getElementById('cfg-firebase-auth-domain').value;
  const firebaseProjectId = document.getElementById('cfg-firebase-project-id').value;
  const firebaseAppId = document.getElementById('cfg-firebase-app-id').value;
  
  if (firebaseKey && firebaseDomain && firebaseProjectId && firebaseAppId) {
    gameState.config.firebase = {
      apiKey: firebaseKey,
      authDomain: firebaseDomain,
      projectId: firebaseProjectId,
      appId: firebaseAppId
    };
  } else {
    gameState.config.firebase = null;
  }

  gameState.config.razorpayBtnMonthly = document.getElementById('cfg-razorpay-btn-monthly').value;
  gameState.config.razorpayBtnYearly = document.getElementById('cfg-razorpay-btn-yearly').value;
  gameState.config.paypalClientId = document.getElementById('cfg-paypal-client-id').value;
  gameState.config.upiId = document.getElementById('cfg-upi-id').value;
  gameState.config.youtubeApiKey = document.getElementById('cfg-youtube-api-key').value.trim();
  
  gameState.config.bankName = document.getElementById('cfg-bank-name').value;
  gameState.config.bankHolder = document.getElementById('cfg-bank-holder').value;
  gameState.config.bankAccount = document.getElementById('cfg-bank-account').value;
  gameState.config.bankIfsc = document.getElementById('cfg-bank-ifsc').value;

  localStorage.setItem('rr_admin_config', JSON.stringify(gameState.config));
  alert("System configuration successfully saved to local database!");
  closeModal('modal-admin-panel');
}

function resetAdminConfig() {
  if (confirm("Are you sure you want to reset credentials back to academy defaults?")) {
    localStorage.removeItem('rr_admin_config');
    gameState.config = {
      firebase: null,
      razorpayBtnMonthly: 'btn_H1a2b3c4d5',
      razorpayBtnYearly: 'btn_H5d4c3b2a1',
      paypalClientId: 'sb-paypal-sandbox-client-id',
      upiId: '9361409566@upi',
      bankName: 'State Bank of India',
      bankHolder: 'STEM Abacus Academy',
      bankAccount: '936140956612',
      bankIfsc: 'SBIN0001234',
      youtubeApiKey: ''
    };
    loadAdminConfigUI();
    alert("Configuration reset.");
  }
}

// Search users
function searchUserSubscription() {
  const searchEmail = document.getElementById('input-search-user-email').value.trim().toLowerCase();
  if (!searchEmail) {
    alert("Please enter a valid Gmail address to search!");
    return;
  }

  const savedUserDb = JSON.parse(localStorage.getItem('rr_simulated_user_db') || '{}');
  const userRecord = savedUserDb[searchEmail];

  const editorBox = document.getElementById('user-editor-box');
  const searchStatus = document.getElementById('user-search-status');

  if (userRecord) {
    searchStatus.classList.add('hidden');
    editorBox.classList.remove('hidden');
    
    document.getElementById('lbl-result-user-email').textContent = userRecord.email;
    document.getElementById('lbl-result-user-name').textContent = userRecord.name;
    document.getElementById('select-user-tier').value = userRecord.premium ? 'premium' : 'free';
    
    const expireInput = document.getElementById('input-user-expire-date');
    expireInput.value = userRecord.planExpires || '';
  } else {
    editorBox.classList.add('hidden');
    searchStatus.classList.remove('hidden');
    searchStatus.innerHTML = `<i class="fa-solid fa-circle-exclamation" style="color: var(--color-red);"></i> No account found under: <strong>${searchEmail}</strong>. Make sure they have logged in at least once in the app first.`;
  }
}

// Modify subscriptions manually
function saveManualUserSubscription() {
  const email = document.getElementById('lbl-result-user-email').textContent;
  const tier = document.getElementById('select-user-tier').value;
  const expireDate = document.getElementById('input-user-expire-date').value;

  const savedUserDb = JSON.parse(localStorage.getItem('rr_simulated_user_db') || '{}');
  
  if (savedUserDb[email]) {
    savedUserDb[email].premium = (tier === 'premium');
    savedUserDb[email].planExpires = expireDate || null;
    
    localStorage.setItem('rr_simulated_user_db', JSON.stringify(savedUserDb));
    
    // If the active user updated their own record, sync it
    if (gameState.user && gameState.user.email.toLowerCase() === email.toLowerCase()) {
      gameState.isPremium = savedUserDb[email].premium;
      updateAuthUI();
      updateTrialStatusUI();
    }
    
    alert(`Account subscription state updated successfully for ${email}!`);
    closeModal('modal-admin-panel');
  }
}

// --- 7. RSVP Reader Engine & Text Parser ---
function parseTextToWords(text) {
  // Clean newlines and separate words
  const rawWords = text.trim().replace(/\n/g, ' ').split(/\s+/);
  
  gameState.words = rawWords.map((word, index) => {
    // Determine punctuation weight
    let extraDelay = 1.0;
    if (document.getElementById('settings-pause-punctuation').checked) {
      if (word.endsWith('.') || word.endsWith('?') || word.endsWith('!')) {
        extraDelay = 1.8;
      } else if (word.endsWith(',') || word.endsWith(';') || word.endsWith(':')) {
        extraDelay = 1.4;
      }
    }
    
    // Clean string for display calculation
    const cleanWord = word.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"'']/g, "");
    
    // Optimal Recognition Point (ORP) math - typically 30-40% into the word
    let orpIndex = 0;
    if (cleanWord.length > 1) {
      if (cleanWord.length <= 5) orpIndex = 1;
      else if (cleanWord.length <= 9) orpIndex = 2;
      else orpIndex = 3;
    }
    
    // Construct word blocks
    const prefix = word.substring(0, orpIndex);
    const focus = word.charAt(orpIndex);
    const suffix = word.substring(orpIndex + 1);

    // Map lane index randomly/cyclically (0, 1, 2)
    const lane = index % 3;

    return { raw: word, prefix, focus, suffix, extraDelay, lane };
  });
}

// Speed adjust
function adjustWPM(delta) {
  gameState.wpm = Math.max(150, Math.min(800, gameState.wpm + delta));
  document.getElementById('hud-wpm').textContent = gameState.wpm;
}

// --- 8. Rhythm Gameplay Notes Controller ---
// Keyboard keydowns listeners
window.addEventListener('keydown', (e) => {
  // Spacebar to play/pause
  if (e.key === ' ' && gameState.isActive) {
    e.preventDefault();
    togglePauseGame();
  }
  // 'R' to restart session
  if ((e.key === 'r' || e.key === 'R') && gameState.isActive) {
    e.preventDefault();
    restartSession();
  }
});

// --- 9. Music / Audio Synth Generator (Web Audio API) ---
function initAudio() {
  if (gameState.audioCtx) return;
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  gameState.audioCtx = new AudioContext();
}

function startSynthLoop() {
  if (!gameState.audioCtx) return;
  if (gameState.audioCtx.state === 'suspended') {
    gameState.audioCtx.resume();
  }

  let beatCount = 0;
  const intervalTime = (60 / gameState.synthTempoBPM) * 1000; // time in ms per beat
  
  // Procedural synthesizer loops
  gameState.synthLoopId = setInterval(() => {
    if (!gameState.isActive) return;
    
    // Play synthetic beat track
    playProceduralTrackBeat(beatCount);
    beatCount = (beatCount + 1) % 16; // 16-step grid
  }, intervalTime);
}

function stopSynthLoop() {
  if (gameState.synthLoopId) {
    clearInterval(gameState.synthLoopId);
    gameState.synthLoopId = null;
  }
}

// Generates procedural Synthwave or LoFi drums & synth notes
function playProceduralTrackBeat(step) {
  const ctx = gameState.audioCtx;
  const volume = gameState.synthVolume;
  if (!ctx || volume <= 0) return;

  const time = ctx.currentTime;
  
  // Equalizer viz triggers
  triggerVisualizerPulse();

  if (gameState.musicSource === 'youtube') {
    return; // Mute procedural synthesis, run visualizer pulses only
  }

  // 1. Kick Drum (Step 0, 4, 8, 12)
  if (step % 4 === 0) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.frequency.setValueAtTime(150, time);
    osc.frequency.exponentialRampToValueAtTime(0.01, time + 0.3);
    
    gain.gain.setValueAtTime(volume * 0.8, time);
    gain.gain.exponentialRampToValueAtTime(0.01, time + 0.3);
    
    osc.start(time);
    osc.stop(time + 0.3);
  }

  // 2. Snare Drum (Step 4, 12)
  if (step % 8 === 4) {
    // white noise filter snare
    const bufferSize = ctx.sampleRate * 0.15;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1000;
    
    const gain = ctx.createGain();
    
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    
    gain.gain.setValueAtTime(volume * 0.4, time);
    gain.gain.exponentialRampToValueAtTime(0.01, time + 0.15);
    
    noise.start(time);
    noise.stop(time + 0.15);
  }

  // 3. Hi-hats (every odd step)
  if (step % 2 !== 0) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(8000, time);
    
    gain.gain.setValueAtTime(volume * 0.1, time);
    gain.gain.exponentialRampToValueAtTime(0.01, time + 0.05);
    
    osc.start(time);
    osc.stop(time + 0.05);
  }

  // 4. Bassline / Chords (Arpeggiation)
  // Shift notes depending on theme track selected
  let baseFreq = 110; // A2
  if (gameState.synthTrack === 'lofi') baseFreq = 87.3; // F2 (Mellow chord)
  else if (gameState.synthTrack === 'ambient') baseFreq = 73.4; // D2 (Deep drone)

  const chordProgression = [1, 1.2, 1.5, 1.8]; // Minor scales multipliers
  const scaleIdx = Math.floor(step / 4) % chordProgression.length;
  const frequency = baseFreq * chordProgression[scaleIdx] * (1 + (step % 3) * 0.5);

  const synthOsc = ctx.createOscillator();
  const synthGain = ctx.createGain();
  synthOsc.connect(synthGain);
  synthGain.connect(ctx.destination);

  synthOsc.type = gameState.synthTrack === 'lofi' ? 'triangle' : 'sawtooth';
  synthOsc.frequency.setValueAtTime(frequency, time);
  
  synthGain.gain.setValueAtTime(volume * 0.18, time);
  synthGain.gain.exponentialRampToValueAtTime(0.001, time + 0.4);

  synthOsc.start(time);
  synthOsc.stop(time + 0.4);
}

// Perfect/Good hit sound chirp
function playSynthFeedback(isSuccess) {
  const ctx = gameState.audioCtx;
  const volume = gameState.synthVolume;
  if (!ctx || volume <= 0) return;

  const time = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);

  if (isSuccess) {
    osc.frequency.setValueAtTime(500, time);
    osc.frequency.exponentialRampToValueAtTime(900, time + 0.08);
    gain.gain.setValueAtTime(volume * 0.15, time);
  } else {
    osc.frequency.setValueAtTime(180, time);
    osc.frequency.setValueAtTime(120, time + 0.05);
    gain.gain.setValueAtTime(volume * 0.25, time);
  }
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.12);

  osc.start(time);
  osc.stop(time + 0.12);
}

/// --- 10. Core Session Loop (RSVP word flash controller) ---
function launchGameSession() {
  if (!gameState.selectedMission) {
    alert("Please select a mission first.");
    return;
  }

  initAudio();

  // Reset sync state
  gameState.syncMode = true;
  gameState.lastYtTime = -1;
  gameState.ytTimeBase = 0;
  gameState.localTimeBase = performance.now();
  gameState.needsSyncReset = true;
  if (gameState.syncPoller) {
    cancelAnimationFrame(gameState.syncPoller);
    gameState.syncPoller = null;
  }

  const initialWpm = parseInt(document.getElementById('input-wpm-slider').value) || 200;
  gameState.wpm = initialWpm;
  gameState.synthTempoBPM = Math.min(180, Math.max(80, Math.floor(initialWpm / 2)));
  
  gameState.syncedWordQueue = generateSyncedWordQueue(gameState.selectedMission, gameState.wpm);
  let readingTitle = `\u26a1 ${gameState.selectedMission.title}`;

  // Update Game Reading Title UI
  const readingTitleEl = document.getElementById('game-reading-title');
  if (readingTitleEl) {
    readingTitleEl.textContent = readingTitle;
  }

  // Setup initial counters
  gameState.isActive = true;
  gameState.currentWordIndex = -1;
  gameState.score = 0;
  gameState.combo = 1;
  gameState.maxCombo = 1;
  gameState.totalWordsRead = 0;
  gameState.laneHits = 0;
  gameState.laneAttempts = 0;
  gameState.lap = 1;
  gameState.elapsedTime = 0;
  gameState.lapTimer = 30;
  gameState.notes = [];

  // Setup UI visibility
  document.getElementById('setup-screen').classList.remove('active');
  document.getElementById('setup-screen').classList.add('hidden');
  document.getElementById('game-screen').classList.remove('hidden');

  // Reset lyrics offset for this session
  gameState.lyricsOffset = 0;
  const offsetDisplay = document.getElementById('offset-display');
  if (offsetDisplay) offsetDisplay.textContent = 'Sync: 0s';
  const offsetControl = document.getElementById('lyrics-offset-control');
  if (offsetControl) offsetControl.classList.remove('hidden');

  // Update HUD
  const totalWordCount = gameState.syncedWordQueue.length;
  document.getElementById('hud-wpm').textContent = '\u266b SYNC';
  document.getElementById('hud-lap').textContent = '\uD83C\uDFB5 Live';
  document.getElementById('hud-timer').textContent = '0:00';
  document.getElementById('progress-bar-fill').style.width = '0%';
  document.getElementById('hud-word-counter').textContent = `Word 0 / ${totalWordCount}`;

  gameState.startTime = Date.now();

  // Hide YouTube Container just in case
  const ytContainer = document.getElementById('yt-player-container');
  if (ytContainer) ytContainer.classList.add('yt-hidden');

  // Launch audio loops
  gameState.synthTrack = gameState.selectedMission.audioSource;
  startSynthLoop(); 
  startTimers();    
  startSyncLoop();  
}


function startTimers() {
  gameState.timerInterval = setInterval(() => {
    if (!gameState.isActive) return;
    
    gameState.elapsedTime++;

    // Only run lap countdown and speed boosts in WPM mode
    // In sync mode, the HUD timer is updated directly by the sync loop
    if (!gameState.syncMode) {
      gameState.lapTimer--;
      document.getElementById('hud-timer').textContent = `${gameState.lapTimer}s`;

      if (gameState.lapTimer <= 0) {
        triggerLapSpeedBoost();
      }
    }
  }, 1000);
}

function triggerLapSpeedBoost() {
  gameState.lap++;
  gameState.lapTimer = 30;
  
  // Speed Increase (increase WPM by 50, maximum limit of 800 WPM)
  const WpmIncrement = 50;
  gameState.wpm = Math.min(800, gameState.wpm + WpmIncrement);
  gameState.synthTempoBPM = Math.min(180, Math.max(80, Math.floor(gameState.wpm / 2)));
  
  // Update UI HUD
  document.getElementById('hud-wpm').textContent = gameState.wpm;
  document.getElementById('hud-lap').textContent = `Lap ${gameState.lap}`;
  
  // Restart Synth Loop with new speed (BPM)
  stopSynthLoop();
  startSynthLoop();
  
  // Trigger overlay announcement animation
  const annBox = document.getElementById('speed-up-announcement');
  const annTitle = document.getElementById('ann-title');
  const annSubtitle = document.getElementById('ann-subtitle');
  
  annTitle.textContent = `LAP ${gameState.lap}: SPEED UP!`;
  annSubtitle.textContent = `Target speed: ${gameState.wpm} WPM`;
  annBox.classList.add('active');
  
  setTimeout(() => {
    annBox.classList.remove('active');
  }, 1800);
}

// RSVP loop controller
function triggerRsvpWordFlash() {
  if (!gameState.isActive) return;

  if (gameState.currentWordIndex >= gameState.words.length) {
    // End of text block - loop / complete session
    endGameSession(true);
    return;
  }

  const wordObj = gameState.words[gameState.currentWordIndex];
  
  // Display word on screen with highlighted Optimal Recognition Point (ORP)
  const rsvpBox = document.getElementById('rsvp-word-box');
  const orpEnabled = document.getElementById('settings-orp-enabled').checked;
  
  if (orpEnabled && wordObj.focus !== '') {
    rsvpBox.innerHTML = `
      <span class="rsvp-prefix">${wordObj.prefix}</span><span class="rsvp-focus">${wordObj.focus}</span><span class="rsvp-suffix">${wordObj.suffix}</span>
    `;
  } else {
    rsvpBox.innerHTML = `<span class="rsvp-prefix"></span><span class="rsvp-focus">${wordObj.raw}</span><span class="rsvp-suffix"></span>`;
  }

  gameState.totalWordsRead++;
  
  // Update progress count & bar
  document.getElementById('hud-word-counter').textContent = `Word ${gameState.currentWordIndex + 1} / ${gameState.words.length}`;
  
  // Calculate Progress Fill percentage
  const pct = ((gameState.currentWordIndex + 1) / gameState.words.length) * 100;
  document.getElementById('progress-bar-fill').style.width = `${pct}%`;

  // Calculate timing interval (ms per word)
  const baseInterval = (60 / gameState.wpm) * 1000;
  const nextWordDelay = baseInterval * wordObj.extraDelay;

  gameState.currentWordIndex++;

  // Set timeout for next word
  gameState.rsvpTimeout = setTimeout(triggerRsvpWordFlash, nextWordDelay);
}

// --- LRC Parser: Convert timestamped lyrics to a flat per-word queue ---
function parseLrcToWordQueue(lrcText) {
  const lines = lrcText.split('\n');
  const parsedLines = [];

  for (const line of lines) {
    // Match [mm:ss.xx] or [mm:ss] timestamp at start of line
    const match = line.match(/^\[(\d+):(\d+(?:\.\d+)?)\](.*)/);
    if (!match) continue;

    const minutes = parseInt(match[1]);
    const seconds = parseFloat(match[2]);
    const text = match[3].trim();

    // Skip empty lines and metadata like [ar:Artist]
    if (isNaN(minutes) || isNaN(seconds) || !text) continue;

    const timeInSeconds = minutes * 60 + seconds;
    const words = text.split(/\s+/).filter(w => w.length > 0);

    if (words.length > 0) {
      parsedLines.push({ time: timeInSeconds, words });
    }
  }

  // Sort by time (should already be in order, but be safe)
  parsedLines.sort((a, b) => a.time - b.time);

  // Build flat word queue — distribute each line's duration across its words
  const wordQueue = [];
  for (let i = 0; i < parsedLines.length; i++) {
    const line = parsedLines[i];
    const nextLineTime = (i + 1 < parsedLines.length) ? parsedLines[i + 1].time : line.time + 4.0;
    const lineDuration = Math.max(0.5, nextLineTime - line.time);
    
    // Cap the word interval to make sure lyrics are sung at a realistic speed,
    // rather than stretched over long instrumental breaks.
    const maxWordInterval = 0.42; // 0.42s max per word (~143 WPM)
    const wordInterval = Math.min(lineDuration / line.words.length, maxWordInterval);

    line.words.forEach((word, wi) => {
      wordQueue.push({
        time: line.time + wi * wordInterval,
        word: word,
        index: wordQueue.length
      });
    });
  }

  console.log(`Parsed ${parsedLines.length} LRC lines into ${wordQueue.length} words`);
  return wordQueue;
}

// --- Sync Mode Loop: polls YouTube currentTime via requestAnimationFrame (~60fps) ---
function startSyncLoop() {
  if (gameState.syncPoller) {
    cancelAnimationFrame(gameState.syncPoller);
    gameState.syncPoller = null;
  }

  gameState.localTimeBase = performance.now();

  function syncTick() {
    if (!gameState.isActive || !gameState.syncMode) return;

    const now = performance.now();
    let estimatedTime = (now - gameState.localTimeBase) / 1000;

    // Apply manual lyrics offset and the global +215ms fix
    const GLOBAL_SYNC_OFFSET_MS = 0.215;
    const adjustedTime = estimatedTime - gameState.lyricsOffset - GLOBAL_SYNC_OFFSET_MS;

    const queue = gameState.syncedWordQueue;

    // Find the active word index using adjustedTime (offset-corrected)
    let activeIndex = -1;
    for (let i = 0; i < queue.length; i++) {
      if (adjustedTime >= queue[i].start && adjustedTime <= queue[i].end) {
        activeIndex = i;
        break;
      }
    }

    if (activeIndex !== -1 && activeIndex !== gameState.currentWordIndex) {
      gameState.currentWordIndex = activeIndex;
      const wordObj = queue[activeIndex];
      displaySyncWord(wordObj.word);
      spawnLaneNote(wordObj.word, activeIndex);
      
      gameState.totalWordsRead++;
      document.getElementById('hud-word-counter').textContent = `Word ${gameState.totalWordsRead} / ${queue.length}`;
      const progressPct = (gameState.totalWordsRead / queue.length) * 100;
      document.getElementById('progress-bar-fill').style.width = `${progressPct}%`;
      
    } else if (activeIndex === -1 && gameState.currentWordIndex !== -1) {
      // Clear word if we are in a pause between words
      const lastActiveWord = queue[gameState.currentWordIndex];
      if (lastActiveWord && adjustedTime > lastActiveWord.end) {
        document.getElementById('rsvp-word-box').innerHTML = '';
        gameState.currentWordIndex = -1;
      }
    }

    // Update HUD timer
    const hudTimer = document.getElementById('hud-timer');
    if (hudTimer) {
      const mins = Math.floor(Math.max(0, estimatedTime) / 60);
      const secs = Math.floor(Math.max(0, estimatedTime) % 60).toString().padStart(2, '0');
      hudTimer.textContent = `${mins}:${secs}`;
    }

    // End session if passed last word
    if (queue.length > 0 && adjustedTime > queue[queue.length - 1].end + 2) {
      endGameSession(true);
      return;
    }

    gameState.syncPoller = requestAnimationFrame(syncTick);
  }

  gameState.syncPoller = requestAnimationFrame(syncTick);
}

// --- Display a word in the RSVP box with ORP highlighting ---
function displaySyncWord(wordStr) {
  const rsvpBox = document.getElementById('rsvp-word-box');
  const orpEnabled = document.getElementById('settings-orp-enabled').checked;

  // Calculate ORP index on the clean word (without punctuation)
  const cleanWord = wordStr.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?\"'']/g, '');
  let orpIndex = 0;
  if (cleanWord.length > 1) {
    if (cleanWord.length <= 5) orpIndex = 1;
    else if (cleanWord.length <= 9) orpIndex = 2;
    else orpIndex = 3;
  }

  const prefix = wordStr.substring(0, orpIndex);
  const focus = wordStr.charAt(orpIndex);
  const suffix = wordStr.substring(orpIndex + 1);

  if (orpEnabled && focus !== '') {
    rsvpBox.innerHTML = `<span class="rsvp-prefix">${prefix}</span><span class="rsvp-focus">${focus}</span><span class="rsvp-suffix">${suffix}</span>`;
  } else {
    rsvpBox.innerHTML = `<span class="rsvp-prefix"></span><span class="rsvp-focus">${wordStr}</span><span class="rsvp-suffix"></span>`;
  }
}


function togglePauseGame() {
  const pauseBtn = document.getElementById('btn-game-pause');
  
  if (gameState.isActive) {
    // Pause
    gameState.isActive = false;
    pauseBtn.innerHTML = '<i class="fa-solid fa-play"></i> Resume';
    
    // Stop sync loop if running
    if (gameState.syncPoller) {
      cancelAnimationFrame(gameState.syncPoller);
      gameState.syncPoller = null;
    }

    if (gameState.musicSource === 'presets' && gameState.synthTrack === 'custom') {
      if (gameState.customAudio) gameState.customAudio.pause();
    } else {
      stopSynthLoop();
    }

    if (gameState.musicSource === 'youtube' && gameState.ytPlayerReady && gameState.ytPlayer) {
      try {
        gameState.ytPlayer.pauseVideo();
      } catch (err) {
        console.warn(err);
      }
    }
  } else {
    // Resume
    gameState.isActive = true;
    pauseBtn.innerHTML = '<i class="fa-solid fa-pause"></i> Pause';
    
    if (gameState.musicSource === 'presets' && gameState.synthTrack === 'custom') {
      if (gameState.customAudio) gameState.customAudio.play();
    } else {
      startSynthLoop();
    }
    
    if (gameState.musicSource === 'youtube' && gameState.ytPlayerReady && gameState.ytPlayer) {
      try {
        gameState.ytPlayer.playVideo();
        // In sync mode: startSyncLoop() will be re-triggered by onStateChange -> PLAYING
      } catch (err) {
        console.warn(err);
      }
    }

    // In WPM mode, restart the word flash loop
    if (!gameState.syncMode) {
      triggerRsvpWordFlash();
    }
    // In sync mode, the YouTube onStateChange handler will restart startSyncLoop()
  }
}

function restartSession() {
  stopSessionLoops();
  launchGameSession();
}

function exitSession() {
  if (confirm("Are you sure you want to end this training session?")) {
    stopSessionLoops();
    document.getElementById('game-screen').classList.add('hidden');
    document.getElementById('summary-screen').classList.add('hidden');
    // FIX: setup-screen uses 'hidden' class during game — must REMOVE hidden, not just add active
    const setupScreen = document.getElementById('setup-screen');
    setupScreen.classList.remove('hidden');
    setupScreen.classList.add('active');
  }
}

function stopSessionLoops() {
  gameState.isActive = false;

  // Stop sync loop if running
  if (gameState.syncPoller) {
    cancelAnimationFrame(gameState.syncPoller);
    gameState.syncPoller = null;
  }

  if (gameState.customAudio) {
    gameState.customAudio.pause();
    gameState.customAudio.currentTime = 0;
  }
  stopSynthLoop();
  if (gameState.timerInterval) clearInterval(gameState.timerInterval);
  if (gameState.rsvpTimeout) clearTimeout(gameState.rsvpTimeout);
  if (gameState.animationFrameId) cancelAnimationFrame(gameState.animationFrameId);

  if (gameState.ytPlayerReady && gameState.ytPlayer) {
    try {
      gameState.ytPlayer.stopVideo();
    } catch (err) {
      console.warn(err);
    }
  }
  document.getElementById('yt-player-container').classList.add('yt-hidden');
}

function endGameSession(completed = true) {
  stopSessionLoops();
  recordPlayedMatch();
  
  // Update lifetime stats
  gameState.stats.lifetimeWords += gameState.totalWordsRead;
  gameState.stats.lifetimeSessions++;
  if (!gameState.syncMode) {
    gameState.stats.peakWPM = Math.max(gameState.stats.peakWPM, gameState.wpm);
  }
  gameState.stats.lifetimeTimeSeconds += gameState.elapsedTime;
  
  // Add to session log history
  const materialType = gameState.syncMode ? 'YouTube Sync' : (document.querySelector('.wizard-option-btn[data-preset].active')?.dataset.preset === 'custom' ? 'Custom Text' : 'Preset Story');
  const formattedDate = new Date().toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
  const durationMinSec = `${Math.floor(gameState.elapsedTime / 60)}:${String(gameState.elapsedTime % 60).padStart(2, '0')}`;
  
  gameState.stats.history.unshift({
    date: formattedDate,
    material: materialType,
    wpm: gameState.syncMode ? 'Sync' : `${gameState.wpm} WPM`,
    words: gameState.totalWordsRead,
    duration: durationMinSec
  });
  
  // Cap log history to last 20
  if (gameState.stats.history.length > 20) {
    gameState.stats.history.pop();
  }
  
  // Save to local storage
  localStorage.setItem('rr_reading_stats', JSON.stringify(gameState.stats));

  // Update stats summary UI
  document.getElementById('stat-peak-wpm').textContent = gameState.syncMode ? 'Sync Mode' : `${gameState.wpm} WPM`;
  document.getElementById('stat-words-read').textContent = gameState.totalWordsRead;
  
  // Calculate formatted elapsed duration
  const min = Math.floor(gameState.elapsedTime / 60);
  const sec = gameState.elapsedTime % 60;
  document.getElementById('stat-duration').textContent = `${min}:${String(sec).padStart(2, '0')}`;

  document.getElementById('game-screen').classList.add('hidden');
  document.getElementById('summary-screen').classList.remove('hidden');
}

// Generate share text for Reddit
function copyRedditShareCard() {
  const wpm = gameState.wpm;
  const words = gameState.totalWordsRead;
  const modeText = `Passive RSVP Mode`;
  
  const shareText = `🚀 I just trained my speed reading WPM with Rhythm Reader!
  
* **Peak WPM Speed:** ${wpm} WPM (Lap ${gameState.lap})
* **Words Read:** ${words} Words
* **Game Mode:** ${modeText}

Improve your reading focus, vocabulary retention, and reading speed using synchronized music beats!

Play it free on GitHub Pages: https://surajgzt-eng.github.io/rhythm-reader/`;

  navigator.clipboard.writeText(shareText).then(() => {
    alert("Reddit Share Card markdown copied to clipboard! Paste it on Reddit communities like r/speedreading, r/selfimprovement, or r/indiegames.");
  }, (err) => {
    console.error("Clipboard error:", err);
  });
}

// --- 11. Audio-Reactive visualizer background canvas ---
let canvas, ctx, animationId;
let pulseFactor = 1.0;

function initVisualizer() {
  canvas = document.getElementById('bg-visualizer');
  ctx = canvas.getContext('2d');
  
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
  
  // Start canvas loop
  drawVisualizerFrame();
}

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

function triggerVisualizerPulse() {
  pulseFactor = 1.35;
}

function drawVisualizerFrame() {
  const showViz = document.getElementById('settings-show-visualizer').checked;
  
  if (!showViz) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    requestAnimationFrame(drawVisualizerFrame);
    return;
  }

  // Slow decay of pulse factor
  pulseFactor += (1.0 - pulseFactor) * 0.08;

  // Visualizer drawing
  ctx.fillStyle = 'rgba(8, 9, 14, 0.15)'; // trails effect
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  const baseRadius = Math.min(canvas.width, canvas.height) * 0.28 * pulseFactor;

  // Draw concentric glow rings
  const ringGrad = ctx.createRadialGradient(centerX, centerY, baseRadius * 0.8, centerX, centerY, baseRadius * 1.5);
  const strokeGlowColor = gameState.orpColor === '#ff007f' ? 'rgba(255, 0, 127, 0.03)' : 'rgba(0, 240, 255, 0.03)';
  
  ringGrad.addColorStop(0, 'rgba(8, 9, 14, 0)');
  ringGrad.addColorStop(0.5, strokeGlowColor);
  ringGrad.addColorStop(1, 'rgba(8, 9, 14, 0)');
  
  ctx.fillStyle = ringGrad;
  ctx.beginPath();
  ctx.arc(centerX, centerY, baseRadius * 1.5, 0, Math.PI * 2);
  ctx.fill();

  // Draw neon lines pulsing
  ctx.strokeStyle = gameState.orpColor;
  ctx.lineWidth = 1.5;
  ctx.shadowColor = gameState.orpColor;
  ctx.shadowBlur = 10;
  
  ctx.beginPath();
  ctx.arc(centerX, centerY, baseRadius, 0, Math.PI * 2);
  ctx.stroke();
  
  ctx.shadowBlur = 0; // reset glow

  // Draw simulated equalizer audio spectrum bars
  const barsCount = 32;
  const barWidth = (canvas.width / barsCount);
  
  ctx.fillStyle = 'rgba(189, 0, 255, 0.05)';
  for (let i = 0; i < barsCount; i++) {
    // Generate organic sine waves for simulated music peaks
    const timeFactor = Date.now() * 0.002;
    const waveValue = Math.sin(i * 0.2 + timeFactor) * Math.cos(i * 0.1 - timeFactor * 0.5);
    const height = Math.max(10, (waveValue + 1.2) * 50 * pulseFactor);

    ctx.fillRect(i * barWidth, canvas.height - height, barWidth - 4, height);
    ctx.fillRect(i * barWidth, 0, barWidth - 4, height * 0.6); // mirror top
  }

  requestAnimationFrame(drawVisualizerFrame);
}

// --- 12. YouTube IFrame Player & Fallback Search API Integration ---

function initYouTubeAPI() {
  window.onYouTubeIframeAPIReady = function() {
    const originUrl = window.location.origin && window.location.origin.startsWith('http') ? window.location.origin : '';
    
    gameState.ytPlayer = new YT.Player('youtube-player', {
      height: '100%',
      width: '100%',
      videoId: '',
      playerVars: {
        autoplay: 0,
        controls: 0,
        rel: 0,
        disablekb: 1,
        modestbranding: 1,
        origin: originUrl
      },
      events: {
        onReady: (event) => {
          gameState.ytPlayerReady = true;
          event.target.setVolume(gameState.synthVolume * 100);
          // If session is already active and youtube is selected, play it now!
          if (gameState.isActive && gameState.musicSource === 'youtube' && gameState.youtubeSelectedVideo) {
            try {
              event.target.stopVideo();
              event.target.loadVideoById({
                videoId: gameState.youtubeSelectedVideo.id,
                suggestedQuality: 'small'
              });
              event.target.playVideo();
            } catch (err) {
              console.warn("Error starting queued YouTube video onReady:", err);
            }
          }
        },
        onStateChange: (event) => {
          // YT.PlayerState: ENDED=0, PLAYING=1, PAUSED=2, BUFFERING=3
          if (event.data === 1) {
            // Song started or resumed playing
            if (gameState.isActive && gameState.syncMode) {
              gameState.needsSyncReset = true;
              if (!gameState.syncPoller) {
                startSyncLoop();
              }
            }
          } else if (event.data === 0) {
            // Song ended naturally
            if (gameState.syncPoller) {
              cancelAnimationFrame(gameState.syncPoller);
              gameState.syncPoller = null;
            }
            if (gameState.isActive && gameState.syncMode) {
              setTimeout(() => endGameSession(true), 1500);
            }
          } else if (event.data === 2) {
            // Song paused externally
            if (gameState.syncPoller) {
              cancelAnimationFrame(gameState.syncPoller);
              gameState.syncPoller = null;
            }
          }
        }
      }
    });
  };

  const tag = document.createElement('script');
  tag.src = "https://www.youtube.com/iframe_api";
  const firstScriptTag = document.getElementsByTagName('script')[0];
  firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
}

function extractYoutubeVideoId(url) {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : null;
}

async function performYoutubeSearch(query) {
  if (!query) return;

  const resultsContainer = document.getElementById('yt-search-results');
  resultsContainer.classList.remove('hidden');
  resultsContainer.innerHTML = '<div class="admin-notice text-center"><i class="fa-solid fa-spinner fa-spin"></i> Searching YouTube...</div>';

  const videoId = extractYoutubeVideoId(query);
  if (videoId) {
    try {
      const videoInfo = await fetchVideoDetails(videoId);
      displaySearchResults([videoInfo]);
    } catch (e) {
      console.warn("Could not fetch details, displaying fallback URL card", e);
      displaySearchResults([{
        id: videoId,
        title: `YouTube Video (Direct Link)`,
        channel: `ID: ${videoId}`,
        thumb: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`
      }]);
    }
    return;
  }

  try {
    const results = await searchYoutubeVideos(query);
    if (results && results.length > 0) {
      displaySearchResults(results);
    } else {
      resultsContainer.innerHTML = '<div class="admin-notice text-center text-danger"><i class="fa-solid fa-triangle-exclamation"></i> No videos found.</div>';
    }
  } catch (err) {
    console.error("Search failed:", err);
    resultsContainer.innerHTML = `<div class="admin-notice text-center text-danger"><i class="fa-solid fa-triangle-exclamation"></i> Search failed. Check connection or settings.</div>`;
  }
}

async function searchYoutubeVideos(query) {
  const apiKey = gameState.config.youtubeApiKey;
  
  if (apiKey) {
    try {
      const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=5&q=${encodeURIComponent(query)}&type=video&key=${apiKey}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Official API response not OK");
      const data = await res.json();
      return data.items.map(item => ({
        id: item.id.videoId,
        title: item.snippet.title,
        channel: item.snippet.channelTitle,
        thumb: item.snippet.thumbnails.default.url
      }));
    } catch (e) {
      console.warn("Official YouTube search failed, falling back to Invidious", e);
    }
  }

  const invidiousInstances = [
    'https://yewtu.be',
    'https://vid.puffyan.us',
    'https://invidious.projectsegfau.lt',
    'https://inv.tux.im',
    'https://invidious.nerdvpn.de'
  ];

  for (const instance of invidiousInstances) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);
      const searchUrl = `${instance}/api/v1/search?q=${encodeURIComponent(query)}&type=video`;
      const res = await fetch(searchUrl, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!res.ok) continue;
      const data = await res.json();
      if (Array.isArray(data)) {
        return data.slice(0, 5).map(item => ({
          id: item.videoId,
          title: item.title,
          channel: item.author,
          thumb: item.videoThumbnails && item.videoThumbnails[0] ? item.videoThumbnails[0].url : `https://img.youtube.com/vi/${item.videoId}/hqdefault.jpg`
        }));
      }
    } catch (err) {
      console.warn(`Invidious search instance ${instance} failed, trying next...`, err);
    }
  }

  throw new Error("All search options failed");
}

async function fetchVideoDetails(videoId) {
  const apiKey = gameState.config.youtubeApiKey;
  if (apiKey) {
    try {
      const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}&key=${apiKey}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Official API details failed");
      const data = await res.json();
      if (data.items && data.items[0]) {
        const item = data.items[0];
        return {
          id: videoId,
          title: item.snippet.title,
          channel: item.snippet.channelTitle,
          thumb: item.snippet.thumbnails.default.url
        };
      }
    } catch (e) {
      console.warn("Official YouTube details failed, trying Invidious", e);
    }
  }

  const invidiousInstances = [
    'https://yewtu.be',
    'https://vid.puffyan.us',
    'https://invidious.projectsegfau.lt',
    'https://inv.tux.im',
    'https://invidious.nerdvpn.de'
  ];

  for (const instance of invidiousInstances) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);
      const url = `${instance}/api/v1/videos/${videoId}`;
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (!res.ok) continue;
      const data = await res.json();
      return {
        id: videoId,
        title: data.title,
        channel: data.author,
        thumb: data.videoThumbnails && data.videoThumbnails[0] ? data.videoThumbnails[0].url : `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`
      };
    } catch (err) {
      console.warn(`Invidious details instance ${instance} failed...`);
    }
  }

  throw new Error("Could not fetch details from any service");
}

function displaySearchResults(videos) {
  const resultsContainer = document.getElementById('yt-search-results');
  resultsContainer.innerHTML = '';
  resultsContainer.classList.remove('hidden');

  videos.forEach(video => {
    const item = document.createElement('div');
    item.className = 'yt-result-item';
    item.innerHTML = `
      <img src="${video.thumb}" alt="thumbnail" onerror="this.src='https://img.youtube.com/vi/${video.id}/hqdefault.jpg'">
      <div class="yt-result-info">
        <span class="yt-result-title">${video.title}</span>
        <span class="yt-result-channel">${video.channel}</span>
      </div>
    `;
    item.addEventListener('click', () => {
      selectYoutubeVideo(video);
      resultsContainer.classList.add('hidden');
    });
    resultsContainer.appendChild(item);
  });
}

function selectYoutubeVideo(video) {
  gameState.youtubeSelectedVideo = video;
  gameState.musicSource = 'youtube';
  
  const selectedCard = document.getElementById('selected-yt-video-card');
  const selectedThumb = document.getElementById('selected-yt-thumb');
  const selectedTitle = document.getElementById('selected-yt-title');
  const selectedChannel = document.getElementById('selected-yt-channel');
  const lyricsStatus = document.getElementById('selected-yt-lyrics-status');
  
  selectedThumb.src = video.thumb;
  selectedThumb.onerror = function() { this.src = `https://img.youtube.com/vi/${video.id}/hqdefault.jpg`; };
  selectedTitle.textContent = video.title;
  selectedChannel.textContent = video.channel;
  
  selectedCard.classList.remove('hidden');
  
  // Set the search custom option as active if the selected video isn't one of the rendered preset buttons
  let isPreset = false;
  document.querySelectorAll('#youtube-preset-hits-container .wizard-option-btn').forEach(b => {
    if (b.dataset.videoId === video.id) {
      b.classList.add('active');
      isPreset = true;
    } else {
      b.classList.remove('active');
    }
  });

  // Remove active class from procedural options when YouTube video is selected
  document.querySelectorAll('#wizard-pane-2 .wizard-option-btn[data-track]').forEach(b => {
    if (b.dataset.track !== 'custom-search') {
      b.classList.remove('active');
    }
  });

  if (!isPreset) {
    const customSearchBtn = document.getElementById('btn-option-custom-search');
    if (customSearchBtn) customSearchBtn.classList.add('active');
  } else {
    const customSearchBtn = document.getElementById('btn-option-custom-search');
    if (customSearchBtn) customSearchBtn.classList.remove('active');
  }

  if (lyricsStatus) {
    lyricsStatus.style.color = 'var(--color-cyan)';
    lyricsStatus.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Fetching song lyrics...';
  }
  
  fetchLyricsForVideo(video).then(() => {
    if (lyricsStatus) {
      if (gameState.syncedLyrics) {
        lyricsStatus.style.color = '#10b981'; // Green
        lyricsStatus.innerHTML = `<i class="fa-solid fa-music"></i> Synced! Words will match the song perfectly.`;
      } else if (gameState.lyrics) {
        lyricsStatus.style.color = '#f59e0b'; // Amber
        lyricsStatus.innerHTML = `<i class="fa-solid fa-circle-info"></i> Plain lyrics only — won't perfectly sync to song.`;
      } else {
        lyricsStatus.style.color = '#ef4444'; // Red
        lyricsStatus.innerHTML = `<i class="fa-solid fa-circle-xmark"></i> Lyrics not found. Using preset reading text.`;
      }
    }
  });
}

function escapeHTML(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function cleanSongTitleForLyrics(title) {
  if (!title) return '';
  return title
    .replace(/\(Official\s*(Video|Audio|Music\s*Video|Lyrics|Lyric\s*Video)?\)/gi, '')
    .replace(/\[Official\s*(Video|Audio|Music\s*Video|Lyrics|Lyric\s*Video)?\]/gi, '')
    .replace(/\(feat\..*?\)/gi, '')
    .replace(/\[feat\..*?\]/gi, '')
    .replace(/\(ft\..*?\)/gi, '')
    .replace(/\[ft\..*?\]/gi, '')
    .replace(/\(Lyrical\)/gi, '')
    .replace(/\bvideo\b/gi, '')
    .replace(/\baudio\b/gi, '')
    .replace(/\blyrics\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function getArtistAndTitle(videoTitle, channelName) {
  let artist = "";
  let track = "";
  
  const title = cleanSongTitleForLyrics(videoTitle);
  
  const splitters = [/\s+-\s+/, /\s+–\s+/, /\s+—\s+/, /\s+\|\s+/, /\s+:\s+/];
  let parts = null;
  for (const regex of splitters) {
    if (regex.test(title)) {
      parts = title.split(regex);
      break;
    }
  }
  
  if (parts && parts.length >= 2) {
    artist = parts[0].trim();
    track = parts[1].trim();
  } else {
    artist = (channelName || "").replace(/\s*(VEVO|Official|Topic|Music)\s*/gi, "").trim();
    track = title.trim();
  }
  
  artist = artist.replace(/^['"“]+|['"”]+$/g, "").trim();
  track = track.replace(/^['"“]+|['"”]+$/g, "").trim();
  
  return { artist, track };
}

async function fetchLyricsForVideo(video) {
  const { artist, track } = getArtistAndTitle(video.title, video.channel);
  const cleanTitle = cleanSongTitleForLyrics(video.title);
  
  gameState.lyrics = null;
  gameState.syncedLyrics = null;
  gameState.lyricsSource = null;

  const searchQueries = [];

  if (artist && track) {
    searchQueries.push({
      url: `https://lrclib.net/api/search?artist_name=${encodeURIComponent(artist)}&track_name=${encodeURIComponent(track)}`,
      label: `artist_name="${artist}" & track_name="${track}"`
    });
  }

  let combinedQuery = cleanTitle;
  const channelNameCleaned = (video.channel || '').replace(/\s*(VEVO|Official|Topic|Music)\s*/gi, '').trim();
  if (channelNameCleaned && !cleanTitle.toLowerCase().includes(channelNameCleaned.toLowerCase())) {
    combinedQuery = `${cleanTitle} ${channelNameCleaned}`;
  }
  searchQueries.push({
    url: `https://lrclib.net/api/search?q=${encodeURIComponent(combinedQuery)}`,
    label: `q="${combinedQuery}"`
  });

  if (artist && track) {
    searchQueries.push({
      url: `https://lrclib.net/api/search?artist_name=${encodeURIComponent(track)}&track_name=${encodeURIComponent(artist)}`,
      label: `swapped artist_name="${track}" & track_name="${artist}"`
    });
  }

  searchQueries.push({
    url: `https://lrclib.net/api/search?q=${encodeURIComponent(cleanTitle)}`,
    label: `q="${cleanTitle}"`
  });

  for (const queryObj of searchQueries) {
    try {
      const res = await fetch(queryObj.url);
      if (!res.ok) continue;
      const data = await res.json();
      if (data && data.length > 0) {
        // Prefer synced lyrics (timestamped LRC) for perfect audio sync; fall back to plain
        const syncedMatch = data.find(item => item.syncedLyrics);
        const plainMatch = data.find(item => item.plainLyrics);
        const match = syncedMatch || plainMatch;
        if (match) {
          gameState.syncedLyrics = match.syncedLyrics || null;
          gameState.lyrics = match.plainLyrics || null;
          gameState.lyricsSource = `${match.artistName} - ${match.trackName}`;
          console.log(`Lyrics fetched via: ${queryObj.label} | Synced timestamps: ${!!match.syncedLyrics}`);
          return;
        }
      }
    } catch (err) {
      console.warn(`Query style failed: ${queryObj.label}`, err);
    }
  }

  console.warn("All lyrics queries failed for video:", video.title);
}

// ─── Home Page: YouTube Music-Style Song List ──────────────────────────────

function initHomeGreeting() {
  const el = document.getElementById('home-greeting');
  if (!el) return;
  const h = new Date().getHours();
  el.textContent = h < 12 ? 'Good morning ☀️' : h < 17 ? 'Good afternoon 🎵' : h < 21 ? 'Good evening 🌆' : 'Good night 🌙';
}

function renderHomePageSongs(genreFilter = 'all') {
  const container = document.getElementById('home-song-list');
  if (!container) return;

  let songs = curatedLibrary;
  if (genreFilter !== 'all') {
    songs = songs.filter(s => s.genre === genreFilter);
  }

  container.innerHTML = '';

  if (songs.length === 0) {
    container.innerHTML = '<div class="home-song-loading">No missions in this category yet.</div>';
    return;
  }

  songs.forEach(song => {
    const card = document.createElement('div');
    card.className = 'home-song-card';
    card.dataset.videoId = song.id;
    card.innerHTML = `
      <img class="home-song-thumb" src="${song.thumb}" alt="${escapeHTML(song.title)}" loading="lazy">
      <div class="home-song-info">
        <span class="home-song-title">${escapeHTML(song.title)}</span>
        <span class="home-song-meta">${escapeHTML(song.artist)} &bull; ${song.genre}</span>
        <span class="home-song-caption-tag">&#9889; Curated Mission</span>
      </div>
      <button class="home-song-play-btn" aria-label="Select ${escapeHTML(song.title)}">
        <i class="fa-solid fa-play"></i>
      </button>
    `;
    card.addEventListener('click', () => {
      document.querySelectorAll('.home-song-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      selectMission(song);
      const bar = document.getElementById('selected-yt-video-card');
      if (bar) bar.classList.remove('hidden');
    });
    container.appendChild(card);
  });
}

function selectMission(mission) {
  gameState.selectedMission = mission;
  gameState.musicSource = 'presets'; // Use built-in synth engine
  gameState.synthTrack = mission.audioSource;
  
  const selectedCard = document.getElementById('selected-yt-video-card');
  const selectedThumb = document.getElementById('selected-yt-thumb');
  const selectedTitle = document.getElementById('selected-yt-title');
  const selectedChannel = document.getElementById('selected-yt-channel');
  const lyricsStatus = document.getElementById('selected-yt-lyrics-status');
  
  selectedThumb.src = mission.thumb;
  selectedTitle.textContent = mission.title;
  selectedChannel.textContent = mission.artist;
  if (lyricsStatus) lyricsStatus.textContent = "";
  
  selectedCard.classList.remove('hidden');
}

function initHomePageListeners() {
  // Genre filter chips
  document.querySelectorAll('.home-genre-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.home-genre-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      renderHomePageSongs(chip.dataset.genre);
    });
  });

  // Speed chips in the bottom bar
  document.querySelectorAll('.home-speed-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.home-speed-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      const wpm = parseInt(chip.dataset.wpm) || 200;
      gameState.wpm = wpm;
      const slider = document.getElementById('input-wpm-slider');
      const display = document.getElementById('wpm-display');
      if (slider) slider.value = wpm;
      if (display) display.textContent = `${wpm} WPM`;
    });
  });

  // Custom search toggle
  const searchBtn = document.getElementById('btn-option-custom-search');
  const searchDrawer = document.getElementById('custom-search-container');
  if (searchBtn && searchDrawer) {
    searchBtn.addEventListener('click', () => {
      const isOpen = !searchDrawer.classList.contains('hidden');
      searchDrawer.classList.toggle('hidden', isOpen);
      if (!isOpen) {
        const inp = document.getElementById('input-yt-search');
        if (inp) inp.focus();
      }
    });
  }

  // Initialize greeting
  initHomeGreeting();
}

async function loadTrendingYoutubeSongs() {
  const container = document.getElementById('youtube-preset-hits-container');
  if (!container) return;

  // Immediately render the curated fallback list so the user sees songs at once
  renderYoutubePresetHits(defaultYoutubePresetHits);

  // Then attempt dynamic fetch in background to augment
  try {
    const songs = await searchYoutubeVideos('top hits songs 2025 lyrics');
    if (songs && songs.length > 0) {
      // Prepend dynamic results as a "Fresh Hits" category
      const freshCategory = { genre: '\uD83D\uDD25 Fresh Hits', songs };
      renderGenreSection(freshCategory, container, true);
    }
  } catch (err) {
    console.warn('Dynamic trending YouTube songs fetch failed, using curated fallbacks only:', err);
  }
}

// Curated song library with genre categories — chosen for high LRC sync coverage
const defaultYoutubePresetHits = [
  // ── POP ────────────────────────────────────────────────────────────────────
  { genre: '\u{1F3B5} Pop', id: '4NRXx6U8ABQ', title: 'Blinding Lights', channel: 'The Weeknd', thumb: 'https://img.youtube.com/vi/4NRXx6U8ABQ/hqdefault.jpg' },
  { genre: '\u{1F3B5} Pop', id: 'DyDfgMOUUA8', title: 'bad guy', channel: 'Billie Eilish', thumb: 'https://img.youtube.com/vi/DyDfgMOUUA8/hqdefault.jpg' },
  { genre: '\u{1F3B5} Pop', id: 'kTJczUoc26U', title: 'Shape of You', channel: 'Ed Sheeran', thumb: 'https://img.youtube.com/vi/kTJczUoc26U/hqdefault.jpg' },
  { genre: '\u{1F3B5} Pop', id: 'OPf0YbXqDm0', title: 'Mark Ronson - Uptown Funk ft. Bruno Mars', channel: 'Mark Ronson', thumb: 'https://img.youtube.com/vi/OPf0YbXqDm0/hqdefault.jpg' },
  { genre: '\u{1F3B5} Pop', id: 'hLQl3WQQoQ0', title: 'Adele - Someone Like You', channel: 'Adele', thumb: 'https://img.youtube.com/vi/hLQl3WQQoQ0/hqdefault.jpg' },
  { genre: '\u{1F3B5} Pop', id: 'fJ9rUzIMcZQ', title: 'Bohemian Rhapsody', channel: 'Queen', thumb: 'https://img.youtube.com/vi/fJ9rUzIMcZQ/hqdefault.jpg' },
  // ── HIP-HOP / RAP ──────────────────────────────────────────────────────────
  { genre: '\uD83C\uDFAE Hip-Hop', id: 'uelHwf8o7_U', title: 'Eminem - Lose Yourself', channel: 'Eminem', thumb: 'https://img.youtube.com/vi/uelHwf8o7_U/hqdefault.jpg' },
  { genre: '\uD83C\uDFAE Hip-Hop', id: 'CEvDPmoswiU', title: 'Drake - One Dance', channel: 'Drake', thumb: 'https://img.youtube.com/vi/CEvDPmoswiU/hqdefault.jpg' },
  { genre: '\uD83C\uDFAE Hip-Hop', id: '09R8_2nJtjg', title: 'Maroon 5 - Sugar', channel: 'Maroon 5', thumb: 'https://img.youtube.com/vi/09R8_2nJtjg/hqdefault.jpg' },
  { genre: '\uD83C\uDFAE Hip-Hop', id: 'SC4xMk98Pdc', title: 'Post Malone - Sunflower', channel: 'Post Malone', thumb: 'https://img.youtube.com/vi/SC4xMk98Pdc/hqdefault.jpg' },
  // ── INDIE / ROCK ───────────────────────────────────────────────────────────
  { genre: '\uD83C\uDF1F Indie', id: 'pBkHLP7VVDE', title: 'Imagine Dragons - Radioactive', channel: 'Imagine Dragons', thumb: 'https://img.youtube.com/vi/pBkHLP7VVDE/hqdefault.jpg' },
  { genre: '\uD83C\uDF1F Indie', id: 'QjvzCTqkBDQ', title: 'Coldplay - Yellow', channel: 'Coldplay', thumb: 'https://img.youtube.com/vi/QjvzCTqkBDQ/hqdefault.jpg' },
  { genre: '\uD83C\uDF1F Indie', id: 'S6IIgBMfG7Q', title: 'Arctic Monkeys - Do I Wanna Know', channel: 'Arctic Monkeys', thumb: 'https://img.youtube.com/vi/S6IIgBMfG7Q/hqdefault.jpg' },
  { genre: '\uD83C\uDF1F Indie', id: 'YqeW9_5kURI', title: 'Linkin Park - Numb', channel: 'Linkin Park', thumb: 'https://img.youtube.com/vi/YqeW9_5kURI/hqdefault.jpg' },
  // ── CHILL / LOFI ───────────────────────────────────────────────────────────
  { genre: '\u2728 Chill', id: 'jfKfPfyJRdk', title: 'Lofi Hip Hop Radio - Beats to Relax/Study to', channel: 'Lofi Girl', thumb: 'https://img.youtube.com/vi/jfKfPfyJRdk/hqdefault.jpg' },
  { genre: '\u2728 Chill', id: '4xDzrJKXOOY', title: 'Synthwave Radio - Chill Retro Beats', channel: 'Lofi Girl Synthwave', thumb: 'https://img.youtube.com/vi/4xDzrJKXOOY/hqdefault.jpg' },
  { genre: '\u2728 Chill', id: 'h5DZgfMB5ig', title: 'Get Lucky ft. Pharrell Williams', channel: 'Daft Punk', thumb: 'https://img.youtube.com/vi/h5DZgfMB5ig/hqdefault.jpg' },
];

// Build genre → songs map for grouped rendering
function groupSongsByGenre(songs) {
  const map = new Map();
  songs.forEach(song => {
    const genre = song.genre || '\uD83C\uDFB5 Songs';
    if (!map.has(genre)) map.set(genre, []);
    map.get(genre).push(song);
  });
  return map;
}

function renderGenreSection(genreData, container, prepend = false) {
  // genreData = { genre: string, songs: [{id, title, channel, thumb}] }
  const section = document.createElement('div');
  section.className = 'genre-song-section';

  const genreLabel = document.createElement('h5');
  genreLabel.className = 'song-genre-label';
  genreLabel.textContent = genreData.genre;
  section.appendChild(genreLabel);

  genreData.songs.forEach(song => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'wizard-option-btn';
    btn.dataset.videoId = song.id;

    btn.innerHTML = `
      <div class="option-thumbnail">
        <img src="${song.thumb}" alt="thumbnail" onerror="this.src='https://img.youtube.com/vi/${song.id}/hqdefault.jpg'">
      </div>
      <div class="option-text">
        <strong>${escapeHTML(song.title)}</strong>
        <span>${escapeHTML(song.channel)}</span>
      </div>
    `;

    btn.addEventListener('click', () => {
      gameState.musicSource = 'youtube';
      selectYoutubeVideo({ id: song.id, title: song.title, channel: song.channel, thumb: song.thumb });
      document.querySelectorAll('#wizard-pane-2 .wizard-option-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('custom-search-container').classList.add('hidden');
      setTimeout(() => goToStep(3), 250);
    });

    section.appendChild(btn);
  });

  if (prepend && container.firstChild) {
    container.insertBefore(section, container.firstChild);
  } else {
    container.appendChild(section);
  }
}

function renderYoutubePresetHits(songs) {
  const container = document.getElementById('youtube-preset-hits-container');
  if (!container) return;

  container.innerHTML = '';

  // Check if songs have genre property (curated list) or are flat (dynamic search results)
  const hasGenres = songs.some(s => s.genre);
  if (hasGenres) {
    const genreMap = groupSongsByGenre(songs);
    genreMap.forEach((genreSongs, genre) => {
      renderGenreSection({ genre, songs: genreSongs }, container);
    });
  } else {
    // Dynamic search results — render as flat list under a single label
    renderGenreSection({ genre: '\uD83D\uDD0D Search Results', songs }, container);
  }

  // Auto-select the first song by default if no selection exists
  if (gameState.youtubeSelectedVideo === null && songs.length > 0) {
    const firstSong = songs[0];
    selectYoutubeVideo({ id: firstSong.id, title: firstSong.title, channel: firstSong.channel, thumb: firstSong.thumb });
  }
}

// Render Stats modal values dynamically
function renderStatsModal() {
  document.getElementById('stats-total-sessions').textContent = gameState.stats.lifetimeSessions;
  document.getElementById('stats-total-words').textContent = gameState.stats.lifetimeWords;
  document.getElementById('stats-peak-wpm').textContent = gameState.stats.peakWPM ? `${gameState.stats.peakWPM} WPM` : '0 WPM';
  
  const totalMin = Math.round(gameState.stats.lifetimeTimeSeconds / 60);
  document.getElementById('stats-total-time').textContent = `${totalMin} min`;
  
  const tableBody = document.getElementById('history-table-body');
  if (!tableBody) return;
  tableBody.innerHTML = '';
  
  if (gameState.stats.history.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 15px;">No training sessions logged yet. Complete a session to see history!</td></tr>`;
  } else {
    gameState.stats.history.forEach(session => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${session.date}</td>
        <td><span class="text-cyan">${session.material}</span></td>
        <td><strong>${session.wpm}</strong></td>
        <td>${session.words}</td>
        <td>${session.duration}</td>
      `;
      tableBody.appendChild(tr);
    });
  }
}
