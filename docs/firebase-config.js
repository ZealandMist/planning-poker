// ============================================================================
// Firebase project config — fill this in with YOUR project's values.
// ============================================================================
//
// 1. Go to https://console.firebase.google.com and create a free project
//    (no credit card required).
// 2. In the project, go to Build → Realtime Database → Create Database.
//    - Choose any region.
//    - Start in "test mode" (open read/write). See the security note below.
// 3. Go to Project settings (gear icon) → General → "Your apps" → click the
//    </> (web) icon to register a new web app → copy the firebaseConfig
//    object it gives you and paste the values below.
//
// SECURITY NOTE: "test mode" database rules allow anyone with your database
// URL to read and write all sessions. That's fine for a casual internal team
// tool, but it does mean this isn't hardened against abuse. Firebase Realtime
// Database rules can be tightened later (e.g. requiring Firebase Anonymous
// Auth) — ask if you want help with that. Also set an expiry date on test
// mode rules or replace them, since Firebase auto-locks the database down
// after ~30 days in test mode.
//
// This file is intentionally separate from app.js so you only ever need to
// touch this one file to configure your own deployment.
// ============================================================================

// Your web app's Firebase configuration.
// This must be exposed on window.FIREBASE_CONFIG so app.js can validate it and
// initialize Firebase once using the compat SDK loaded in index.html.
window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyApcSV3zsmDSzUbqCn39ohUspSdg5y0oJs",
  authDomain: "planning-poker-44568.firebaseapp.com",
  databaseURL: "https://planning-poker-44568-default-rtdb.firebaseio.com",
  projectId: "planning-poker-44568",
  storageBucket: "planning-poker-44568.firebasestorage.app",
  messagingSenderId: "426044042897",
  appId: "1:426044042897:web:5a4858a5a9b4b043a0d930",
  measurementId: "G-B0DRFRP6C5"
};

window.firebaseConfig = window.FIREBASE_CONFIG;
