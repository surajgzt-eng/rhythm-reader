/* ==========================================================================
   Rhythm Reader - Core Game Loop & Application Controller
   ========================================================================== */

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
  ytPlayer: null,
  ytPlayerReady: false,
  
  // Visuals & Gameplay Animation
  notes: [], // falling note coordinates
  animationFrameId: null,
  noteSpeed: 3.5, // vertical falling speed factor
  targetLineY: 215, // target hit baseline relative height
  orpColor: '#ff007f'
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
  initYouTubeAPI();
  loadTrendingYoutubeSongs();
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
    document.getElementById('setup-screen').classList.remove('active'); // resets WPM selection
    document.getElementById('setup-screen').classList.add('active');
    goToStep(1);
  });
  document.getElementById('btn-summary-gohome').addEventListener('click', () => {
    document.getElementById('summary-screen').classList.add('hidden');
    document.getElementById('setup-screen').classList.add('active');
    goToStep(1);
  });

  // WPM Manual Adjustments in Game
  document.getElementById('btn-speed-up').addEventListener('click', () => adjustWPM(25));
  document.getElementById('btn-speed-down').addEventListener('click', () => adjustWPM(-25));

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

// --- 10. Core Session Loop (RSVP word flash controller) ---
function launchGameSession() {
  if (gameState.musicSource === 'youtube' && !gameState.youtubeSelectedVideo) {
    alert("Please search and select a YouTube song first, or switch back to Built-in Beats.");
    return;
  }

  initAudio();
  
  // Read configured inputs
  let selectedText = "";
  let readingTitle = "";

  if (gameState.musicSource === 'youtube') {
    if (gameState.lyrics) {
      selectedText = gameState.lyrics;
      readingTitle = `"${gameState.youtubeSelectedVideo.title}" (Lyrics)`;
    } else {
      // Fallback
      const presetBtn = document.querySelector('.wizard-option-btn[data-preset].active');
      const customTextArea = document.getElementById('textarea-custom-text');
      if (presetBtn && presetBtn.dataset.preset === 'custom') {
        selectedText = customTextArea.value.trim() || textPresets.scifi;
        readingTitle = `Custom Text (Lyrics not found for "${gameState.youtubeSelectedVideo.title}")`;
      } else if (presetBtn) {
        selectedText = textPresets[presetBtn.dataset.preset];
        readingTitle = `${presetBtn.querySelector('strong')?.textContent || 'Preset'} (Lyrics not found)`;
      } else {
        selectedText = textPresets.scifi;
        readingTitle = `Sci-Fi (Lyrics not found)`;
      }
    }
  } else {
    const presetBtn = document.querySelector('.wizard-option-btn[data-preset].active');
    const customTextArea = document.getElementById('textarea-custom-text');
    if (presetBtn && presetBtn.dataset.preset === 'custom') {
      selectedText = customTextArea.value.trim() || textPresets.scifi;
      readingTitle = `Custom Text`;
    } else if (presetBtn) {
      selectedText = textPresets[presetBtn.dataset.preset];
      readingTitle = presetBtn.querySelector('strong')?.textContent || 'Preset';
    } else {
      selectedText = textPresets.scifi;
      readingTitle = `Sci-Fi Story`;
    }
    
    // Add procedural track context
    const activeTrackBtn = document.querySelector('#wizard-pane-2 .wizard-option-btn.active');
    const trackName = activeTrackBtn ? (activeTrackBtn.querySelector('strong')?.textContent || 'Procedural Beats') : 'Procedural Beats';
    readingTitle = `${readingTitle} (${trackName})`;
  }

  // Update Game Reading Title UI
  const readingTitleEl = document.getElementById('game-reading-title');
  if (readingTitleEl) {
    readingTitleEl.textContent = readingTitle;
  }

  // Parse text
  parseTextToWords(selectedText);
  if (gameState.words.length === 0) {
    alert("Empty text material!");
    return;
  }

  // Setup initial counters
  gameState.isActive = true;
  gameState.currentWordIndex = 0;
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

  // Setup speeds
  const initialWpm = parseInt(document.getElementById('input-wpm-slider').value);
  gameState.wpm = initialWpm;
  gameState.synthTempoBPM = Math.min(180, Math.max(80, Math.floor(initialWpm / 2))); // BPM proportional to WPM speed

  // Setup UI visibility
  document.getElementById('setup-screen').classList.add('hidden');
  document.getElementById('game-screen').classList.remove('hidden');

  // Update HUD
  document.getElementById('hud-wpm').textContent = gameState.wpm;
  document.getElementById('hud-lap').textContent = `Lap ${gameState.lap}`;
  document.getElementById('hud-timer').textContent = `${gameState.lapTimer}s`;
  document.getElementById('progress-bar-fill').style.width = '0%';
  document.getElementById('hud-word-counter').textContent = `Word 0 / ${gameState.words.length}`;

  gameState.startTime = Date.now();
  
  // Launch loops
  if (gameState.musicSource === 'presets' && gameState.synthTrack === 'custom') {
    if (gameState.customAudio) {
      gameState.customAudio.currentTime = 0;
      gameState.customAudio.play();
    }
  } else {
    startSynthLoop();
  }
  startTimers();
  triggerRsvpWordFlash();

  // Start YouTube player
  if (gameState.musicSource === 'youtube') {
    const ytContainer = document.getElementById('yt-player-container');
    ytContainer.classList.remove('yt-hidden');
    if (gameState.ytPlayerReady && gameState.ytPlayer) {
      try {
        gameState.ytPlayer.stopVideo();
        gameState.ytPlayer.loadVideoById({
          videoId: gameState.youtubeSelectedVideo.id,
          suggestedQuality: 'small'
        });
        gameState.ytPlayer.setVolume(gameState.synthVolume * 100);
        gameState.ytPlayer.playVideo();
      } catch (err) {
        console.warn("Error starting YouTube video:", err);
      }
    }
  } else {
    document.getElementById('yt-player-container').classList.add('yt-hidden');
  }
}

function startTimers() {
  gameState.timerInterval = setInterval(() => {
    if (!gameState.isActive) return;
    
    gameState.elapsedTime++;
    gameState.lapTimer--;
    document.getElementById('hud-timer').textContent = `${gameState.lapTimer}s`;

    // Lap Completion speed boost
    if (gameState.lapTimer <= 0) {
      triggerLapSpeedBoost();
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

function togglePauseGame() {
  const pauseBtn = document.getElementById('btn-game-pause');
  
  if (gameState.isActive) {
    // Pause
    gameState.isActive = false;
    pauseBtn.innerHTML = '<i class="fa-solid fa-play"></i> Resume';
    
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
    
    triggerRsvpWordFlash();

    if (gameState.musicSource === 'youtube' && gameState.ytPlayerReady && gameState.ytPlayer) {
      try {
        gameState.ytPlayer.playVideo();
      } catch (err) {
        console.warn(err);
      }
    }
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
    document.getElementById('setup-screen').classList.remove('hidden');
    document.getElementById('setup-screen').classList.add('active');
  }
}

function stopSessionLoops() {
  gameState.isActive = false;
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
  
  // Update stats summary UI
  document.getElementById('stat-peak-wpm').textContent = `${gameState.wpm} WPM`;
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
          // Keep synced if needed
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
      if (gameState.lyrics) {
        lyricsStatus.style.color = '#10b981'; // Green
        lyricsStatus.innerHTML = `<i class="fa-solid fa-circle-check"></i> Lyrics synchronized & loaded!`;
      } else {
        lyricsStatus.style.color = '#f59e0b'; // Amber
        lyricsStatus.innerHTML = `<i class="fa-solid fa-circle-info"></i> Lyrics not found. Defaulting to selected text.`;
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
        const match = data.find(item => item.plainLyrics);
        if (match) {
          gameState.lyrics = match.plainLyrics;
          gameState.lyricsSource = `${match.artistName} - ${match.trackName}`;
          console.log(`Lyrics fetched successfully using query style: ${queryObj.label}`);
          return;
        }
      }
    } catch (err) {
      console.warn(`Query style failed: ${queryObj.label}`, err);
    }
  }

  console.warn("All lyrics queries failed for video:", video.title);
}

async function loadTrendingYoutubeSongs() {
  const container = document.getElementById('youtube-preset-hits-container');
  if (!container) return;

  try {
    const songs = await searchYoutubeVideos("latest hit songs 2026");
    if (songs && songs.length > 0) {
      renderYoutubePresetHits(songs);
      return;
    }
  } catch (err) {
    console.warn("Dynamic trending YouTube songs fetch failed, using fallbacks:", err);
  }

  renderYoutubePresetHits(defaultYoutubePresetHits);
}

const defaultYoutubePresetHits = [
  {
    id: "4NRXx6U8ABQ",
    title: "The Weeknd - Blinding Lights (Official Audio)",
    channel: "The Weeknd",
    thumb: "https://img.youtube.com/vi/4NRXx6U8ABQ/hqdefault.jpg"
  },
  {
    id: "h5DZgfMB5ig",
    title: "Daft Punk - Get Lucky (Official Audio) ft. Pharrell Williams",
    channel: "Daft Punk",
    thumb: "https://img.youtube.com/vi/h5DZgfMB5ig/hqdefault.jpg"
  },
  {
    id: "DyDfgMOUUA8",
    title: "Billie Eilish - bad guy (Official Audio)",
    channel: "Billie Eilish",
    thumb: "https://img.youtube.com/vi/DyDfgMOUUA8/hqdefault.jpg"
  },
  {
    id: "jfKfPfyJRdk",
    title: "Lofi Hip Hop Radio - Beats to Relax/Study to",
    channel: "Lofi Girl",
    thumb: "https://img.youtube.com/vi/jfKfPfyJRdk/hqdefault.jpg"
  },
  {
    id: "4xDzrJKXOOY",
    title: "Synthwave Radio - Chill synth / retro beats",
    channel: "Lofi Girl Synthwave",
    thumb: "https://img.youtube.com/vi/4xDzrJKXOOY/hqdefault.jpg"
  }
];

function renderYoutubePresetHits(songs) {
  const container = document.getElementById('youtube-preset-hits-container');
  if (!container) return;
  
  container.innerHTML = '';
  
  songs.forEach(song => {
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
      selectYoutubeVideo({
        id: song.id,
        title: song.title,
        channel: song.channel,
        thumb: song.thumb
      });
      
      document.querySelectorAll('#wizard-pane-2 .wizard-option-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('custom-search-container').classList.add('hidden');
      
      // Auto-advance
      setTimeout(() => goToStep(3), 250);
    });
    
    container.appendChild(btn);
  });

  // Auto-select the first trending song by default if no selection exists
  if (gameState.youtubeSelectedVideo === null && songs.length > 0) {
    const firstSong = songs[0];
    selectYoutubeVideo({
      id: firstSong.id,
      title: firstSong.title,
      channel: firstSong.channel,
      thumb: firstSong.thumb
    });
  }
}
