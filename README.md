# Rhythm Reader ⚡

Rhythm Reader is a premium, gamified speed-reading application designed to improve cognitive processing speed and accuracy. 
It combines **Rapid Serial Visual Presentation (RSVP)** reading overlays with **rhythm game mechanics** (falling notes synced to beat tempos) and a procedural Web Audio synthesizer.

Live demo / static build designed to run 100% free on **GitHub Pages**!

---

## 🎮 How to Play / Train

1.  **Game Launch:**
    *   Choose from preloaded text templates or write your own text (Premium feature).
    *   Select your background rhythm beat track (Neon Synth, Mellow Lofi, space ambient).
    *   Select **Active Game** (interact with lanes) or **Passive Trainer** (simply read visual flash overlays).
    *   Adjust your starting speed (Words Per Minute) slider and click **Launch Rhythm Session**.
2.  **Gameplay (Active Mode):**
    *   Words will flash one by one in the center focus zone, highlighting the **Optimal Recognition Point (ORP)** letter in red.
    *   Simultaneously, words will cascade down three vertical lanes.
    *   Press the corresponding lane trigger buttons **A** (Left Lane), **S** (Center Lane), or **D** (Right Lane) exactly when the falling word crosses the baseline to score points and build multipliers.
3.  **Speed Escalation (Laps):**
    *   Every **30 seconds** of reading, you enter a new **Lap**.
    *   The reading speed automatically increases (WPM increments +50) and the background synthesizer beats speed up!
4.  **End of Session:**
    *   Get a detailed report card showing your Peak WPM, Total Words Read, Rhythm Accuracy %, highest combo streak, and final score.
    *   Copy a custom **Reddit Share Card** markdown to share your training achievements online!

---

## 💳 Freemium Funnel & User Accounts

*   **Day 1 (Trial):** Unlimited gameplay, no login required.
*   **Day 2+ (Limited):** Restricted to **2 free matches per day**.
*   **Google Sign-In (Gmail):** Integrated using Firebase Authentication. Users log in with their Google accounts to link their subscriptions to their Gmail ID.
*   **Free Cloud Database:** Uses Firebase Firestore (Free Tier - ₹0/year) to store user credentials and subscription details.
*   **Admin Panel:** Locked to the administrator Gmail (`suraj.gzt@gmail.com`). Accessible via the settings cog. Allows the admin to search users by Gmail and manually active/extend subscription plans!

---

## 🛠️ Stripe, Razorpay & PayPal Setup

This static site uses No-Code payment checkouts to ensure security without exposing API keys:

1.  **Razorpay Buttons:**
    *   Go to your Razorpay Dashboard -> **Payment Buttons** or **Subscription Buttons**.
    *   Create buttons for ₹59 (Monthly) and ₹599 (Yearly).
    *   Copy the generated Button IDs (e.g. `btn_H1a2b3c4d5`).
    *   Log in as `suraj.gzt@gmail.com` in the app, click the Admin gear, and paste your button IDs in the fields.
2.  **PayPal Buttons:**
    *   Go to PayPal Developer Console, get your Sandbox/Live Client ID, and paste it into the Admin settings panel.
3.  **Direct UPI:**
    *   Paste your UPI ID (e.g. `9361409566@upi`) and direct bank account coordinates in the Admin settings panel to generate instant scanable QR codes for your users.

---

## 📦 Deployment Instructions (GitHub Pages)

To publish this website online 100% free:

1.  Create a new **public** repository named `rhythm-reader` on your GitHub account (`surajgzt-eng`).
2.  Run the following commands in the terminal of this folder to push the code:
    ```bash
    git remote add origin https://github.com/surajgzt-eng/rhythm-reader.git
    git push -u origin main
    ```
3.  On your GitHub repository page: Go to **Settings** -> **Pages**.
4.  Set Build/Deployment source to **Deploy from a branch**.
5.  Select **main** branch, `/ (root)` folder, and click **Save**.
6.  In a few minutes, your game is online at: `https://surajgzt-eng.github.io/rhythm-reader/`!
