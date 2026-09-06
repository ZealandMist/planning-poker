# Table Stakes — Planning Poker

A small multiplayer planning-poker tool: a poker-chip countdown timer, generative
background music while voting is open, and real-time sync across everyone at the
table via Firebase.

## Files

- `index.html` — page structure
- `styles.css` — all styling
- `app.js` — all app logic (session handling, timer, voting, music)
- `firebase-config.js` — the only file you need to edit to point this at your own Firebase project
- `database.rules.json` — the security rules to paste into your Firebase project

## 1. Set up Firebase (~10 minutes, free)

1. Go to <https://console.firebase.google.com> and create a new project (no credit
   card required).
2. Go to **Build → Authentication → Get started**, and enable the **Anonymous**
   sign-in provider. This app uses anonymous auth purely so the security rules
   can tell participants apart — there's no login screen or password, it just
   gives each browser tab a verifiable identity.
3. Go to **Build → Realtime Database → Create Database**.
   - Any region is fine.
   - Start in **test mode** for the initial save (Firebase requires picking
     something to begin with) — you'll replace these rules in the next step.
4. Go to the **Rules** tab of your Realtime Database, delete what's there, and
   paste in the contents of `database.rules.json` from this folder. Click
   **Publish**.
5. Go to **Project settings** (gear icon) → **General** → scroll to "Your apps" →
   click the `</>` (web) icon to register a new web app.
6. Copy the `firebaseConfig` object it shows you and paste the values into
   `firebase-config.js`.

### About the config values and "exposed keys"

The values in `firebase-config.js` (`apiKey`, `authDomain`, etc.) are **not
secret credentials** — Firebase's web config is designed to be public and
shipped in client-side code. It only tells the SDK which project to talk to;
it doesn't grant access to your data. Pushing this file to a public GitHub
repo is fine and expected. What actually protects your data is:

- **`database.rules.json`** — enforces exactly who can read/write what. In
  this setup: anyone can read a session if they know its code (that's the
  intended sharing model, like an unlisted link); only the host can change
  the story/timer; a player can only write their own name and vote; the host
  can remove other players (the "kick" button).
- **Anonymous auth** — gives every participant a real, verifiable identity
  (`auth.uid`) that the rules check against, instead of trusting a
  self-reported ID from the client.

The one Firebase credential that *is* a real secret is a **service account /
Admin SDK key** (a downloadable JSON file with a `private_key` field) — this
app never uses one, and you should never put one in client-side code.

**Optional extra hardening:** in the [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
for this project, you can add an "HTTP referrer" restriction to the API key so
it only works from your `github.io` domain (and `localhost` for testing).
This doesn't protect your data — the rules already do that — but it stops
someone else from copy-pasting your key into an unrelated site and running up
your project's usage quota.

## 2. Deploy to GitHub Pages

1. Push this folder to a GitHub repo (as the repo root, or inside a `/docs` folder).
2. In the repo, go to **Settings → Pages**, set the source to your branch and the
   folder you used, and save.
3. Your app will be live at `https://yourusername.github.io/reponame/`.

## Testing locally

You still need a real Firebase project even for local testing (there's no
built-in offline mode) — the good news is the same config works identically
locally and once deployed. Serve the folder with any static server, e.g.:

```
npx serve .
```

Then open the printed `http://localhost:...` URL in two windows to test
hosting and joining.

## How it works

- Whoever clicks **Host a session** creates a session document in Firebase and
  gets a shareable code (e.g. `TS-A1B2C3`) plus a "Copy invite link" button.
- Everyone else enters that code (or opens the link) to join from their own device.
- The host controls the timer (start/pause/duration/reveal) and sets the story;
  everyone votes for themselves by picking a card.
- If the host's tab closes, their session's `hostId` is automatically cleared
  (via Firebase's `onDisconnect`), and a **Become host** button appears for
  anyone still at the table to take over.
- Each person's browser plays the table music locally, so muting it doesn't
  affect anyone else.

This syncs through Firebase's Realtime Database over plain HTTPS/WebSocket
rather than peer-to-peer WebRTC, so it works reliably through VPNs, corporate
networks, and browsers that restrict WebRTC.