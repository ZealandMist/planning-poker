(function(){
  const DECK = ["0","1","2","3","5","8","13","21","?","☕"];
  const CIRC = 2 * Math.PI * 96;

  // ---------- DOM refs ----------
  const setupBanner = document.getElementById('setupBanner');
  const lobbyCard = document.getElementById('lobbyCard');
  const roleTabs = document.getElementById('roleTabs');
  const nameInput = document.getElementById('nameInput');
  const joinCodeField = document.getElementById('joinCodeField');
  const codeInput = document.getElementById('codeInput');
  const lobbySubmit = document.getElementById('lobbySubmit');
  const lobbyError = document.getElementById('lobbyError');
  const lobbyNote = document.getElementById('lobbyNote');

  const sessionBar = document.getElementById('sessionBar');
  const connCountLabel = document.getElementById('connCountLabel');
  const codeDisplay = document.getElementById('codeDisplay');
  const copyLinkBtn = document.getElementById('copyLinkBtn');
  const roleBadgeSelf = document.getElementById('roleBadgeSelf');
  const claimHostBtn = document.getElementById('claimHostBtn');
  const leaveBtn = document.getElementById('leaveBtn');

  const appMain = document.getElementById('appMain');
  const storyInput = document.getElementById('storyInput');
  const playersGrid = document.getElementById('playersGrid');
  const deckFan = document.getElementById('deckFan');
  const currentVoterEl = document.getElementById('currentVoter');
  const timerDigits = document.getElementById('timerDigits');
  const timerState = document.getElementById('timerState');
  const chipProgress = document.getElementById('chipProgress');
  const chipWrap = document.getElementById('chipWrap');
  const startBtn = document.getElementById('startBtn');
  const pauseBtn = document.getElementById('pauseBtn');
  const revealBtn = document.getElementById('revealBtn');
  const hostButtonsWrap = document.getElementById('hostButtonsWrap');
  const guestWaitingNote = document.getElementById('guestWaitingNote');
  const musicToggle = document.getElementById('musicToggle');
  const vinylIcon = document.getElementById('vinylIcon');
  const musicLabel = document.getElementById('musicLabel');
  const resultsBox = document.getElementById('results');
  const resultsList = document.getElementById('resultsList');
  const avgBadge = document.getElementById('avgBadge');
  const consensusFlag = document.getElementById('consensusFlag');
  const durationSelect = document.getElementById('durationSelect');

  // ---------- Firebase ----------
  let db = null;
  let auth = null;
  let authReady = false;
  const configLooksReal = window.FIREBASE_CONFIG &&
    window.FIREBASE_CONFIG.apiKey && !window.FIREBASE_CONFIG.apiKey.startsWith('YOUR_') &&
    window.FIREBASE_CONFIG.databaseURL && !window.FIREBASE_CONFIG.databaseURL.includes('YOUR_PROJECT_ID');

  if (!configLooksReal){
    setupBanner.classList.remove('hidden');
    lobbySubmit.disabled = true;
    lobbyNote.textContent = "Fill in firebase-config.js first — see the banner above.";
  } else {
    firebase.initializeApp(window.FIREBASE_CONFIG);
    db = firebase.database();
    auth = firebase.auth();
    lobbySubmit.disabled = true;
    lobbySubmit.textContent = "Connecting…";
    auth.signInAnonymously().catch(err => {
      console.error('[table-stakes] anonymous sign-in failed:', err);
      lobbyNote.textContent = "Couldn't authenticate with Firebase. Check that Anonymous sign-in is enabled (Build → Authentication → Sign-in method) in your Firebase console.";
    });
    auth.onAuthStateChanged(user => {
      if (user){
        authReady = true;
        lobbySubmit.disabled = false;
        lobbySubmit.textContent = lobbyRole === 'host' ? 'Start hosting' : 'Join session';
      }
    });
  }

  // ---------- Session state ----------
  let myId = null;          // Firebase anonymous auth uid — stable, verifiable by security rules
  let myName = "";
  let isHost = false;
  let sessionCode = null;
  let sessionRef = null;
  let presenceRef = null;   // this player's node, for onDisconnect cleanup
  let hostRef = null;       // sessions/{code}/hostId, for onDisconnect + claiming

  // ---------- Local mirror of the shared state ----------
  let state = {
    hostId: null,
    story: "",
    players: {},          // id -> {name, vote}
    durationSecs: 60,
    running: false,
    endAt: null,
    remainingMs: null,
    revealed: false
  };

  function uid(len){
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    let s = '';
    for (let i=0;i<len;i++) s += chars[Math.floor(Math.random()*chars.length)];
    return s;
  }

  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  // ================= LOBBY =================
  let lobbyRole = 'host';
  roleTabs.addEventListener('click', e => {
    const btn = e.target.closest('button');
    if (!btn) return;
    lobbyRole = btn.getAttribute('data-role');
    [...roleTabs.children].forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    if (lobbyRole === 'join'){
      joinCodeField.style.display = 'block';
      lobbySubmit.textContent = 'Join session';
      lobbyNote.textContent = "Ask the host for their session code, or use the link they shared.";
    } else {
      joinCodeField.style.display = 'none';
      lobbySubmit.textContent = 'Start hosting';
      lobbyNote.textContent = "You'll get a session code to share. Anyone with the link or code can join from their own device.";
    }
  });

  // Pre-fill from ?session=CODE in the URL
  const urlParams = new URLSearchParams(location.search);
  const urlSession = urlParams.get('session');
  if (urlSession){
    lobbyRole = 'join';
    [...roleTabs.children].forEach(b => b.classList.toggle('active', b.getAttribute('data-role') === 'join'));
    joinCodeField.style.display = 'block';
    codeInput.value = urlSession;
    lobbySubmit.textContent = 'Join session';
    lobbyNote.textContent = "Ask the host for their session code, or use the link they shared.";
  }

  lobbySubmit.addEventListener('click', () => {
    if (!db || !authReady){ lobbyError.textContent = "Still connecting to Firebase — try again in a second."; return; }
    const name = nameInput.value.trim();
    if (!name){ lobbyError.textContent = "Enter a name first."; nameInput.focus(); return; }
    myName = name;
    myId = auth.currentUser.uid;
    lobbyError.textContent = "";
    lobbySubmit.disabled = true;
    lobbySubmit.textContent = "Connecting…";
    ensureAudioStarted(); // unlock audio context on this user gesture

    if (lobbyRole === 'host') startHosting();
    else {
      const code = codeInput.value.trim().toUpperCase();
      if (!code){ lobbyError.textContent = "Enter a session code."; lobbySubmit.disabled = false; lobbySubmit.textContent = "Join session"; return; }
      joinSession(code);
    }
  });

  function lobbyFail(msg){
    lobbyError.textContent = msg;
    lobbySubmit.disabled = false;
    lobbySubmit.textContent = lobbyRole === 'host' ? 'Start hosting' : 'Join session';
  }

  function showApp(){
    lobbyCard.classList.add('hidden');
    sessionBar.classList.remove('hidden');
    appMain.classList.remove('hidden');
    codeDisplay.textContent = sessionCode;
  }

  // ================= HOST =================
  function startHosting(attempt){
    attempt = attempt || 0;
    sessionCode = 'TS-' + uid(6);
    sessionRef = db.ref('sessions/' + sessionCode);

    sessionRef.get().then(snap => {
      if (snap.exists() && attempt < 3){
        startHosting(attempt + 1); // extremely unlikely collision — try a fresh code
        return;
      }
      myId = auth.currentUser.uid;
      isHost = true;

      const initial = {
        hostId: myId,
        story: "",
        durationSecs: 60,
        running: false,
        endAt: null,
        remainingMs: null,
        revealed: false,
        players: { [myId]: { name: myName, vote: null } }
      };
      sessionRef.set(initial).then(() => {
        hostRef = sessionRef.child('hostId');
        hostRef.onDisconnect().remove();
        presenceRef = sessionRef.child('players/' + myId);
        presenceRef.onDisconnect().remove();
        attachListener();
        showApp();
      }).catch(err => {
        console.error('[table-stakes] failed to create session:', err);
        lobbyFail("Couldn't create a session — check your Firebase config and database rules.");
      });
    }).catch(err => {
      console.error('[table-stakes] failed to reach Firebase:', err);
      lobbyFail("Couldn't reach Firebase — check your config and internet connection.");
    });
  }

  // ================= GUEST =================
  function joinSession(code){
    sessionCode = code;
    sessionRef = db.ref('sessions/' + code);

    sessionRef.get().then(snap => {
      if (!snap.exists()){
        lobbyFail("No session found with that code. Double-check it with the host.");
        return;
      }
      myId = auth.currentUser.uid;
      isHost = false;
      presenceRef = sessionRef.child('players/' + myId);
      presenceRef.set({ name: myName, vote: null }).then(() => {
        presenceRef.onDisconnect().remove();
        attachListener();
        showApp();
      }).catch(err => {
        console.error('[table-stakes] failed to join:', err);
        lobbyFail("Couldn't join that session — check your Firebase database rules.");
      });
    }).catch(err => {
      console.error('[table-stakes] failed to reach Firebase:', err);
      lobbyFail("Couldn't reach Firebase — check your config and internet connection.");
    });
  }

  function attachListener(){
    sessionRef.on('value', snap => {
      const val = snap.val();
      if (!val){
        // host's record vanished (session ended / never existed anymore)
        alert("This session no longer exists.");
        location.href = location.pathname;
        return;
      }
      state.hostId = val.hostId || null;
      state.story = val.story || "";
      state.durationSecs = val.durationSecs || 60;
      state.running = !!val.running;
      state.endAt = val.endAt || null;
      state.remainingMs = (val.remainingMs != null) ? val.remainingMs : null;
      state.revealed = !!val.revealed;
      state.players = val.players || {};
      isHost = (state.hostId === myId);
      render();
    }, err => {
      console.error('[table-stakes] realtime listener error:', err);
    });
  }

  // ================= Claim host (if host disconnected) =================
  claimHostBtn.addEventListener('click', () => {
    if (!sessionRef) return;
    sessionRef.child('hostId').transaction(current => {
      if (current === null || current === undefined){
        return myId; // only take it if it's genuinely empty
      }
      return; // abort — someone already has it
    }).then(result => {
      if (result.committed){
        isHost = true;
        hostRef = sessionRef.child('hostId');
        hostRef.onDisconnect().remove();
        render();
      }
    });
  });

  // ================= Leave / copy link =================
  leaveBtn.addEventListener('click', () => {
    if (isHost && Object.keys(state.players).length > 1){
      if (!confirm("Leaving will let someone else claim host. Continue?")) return;
    }
    cleanupAndLeave();
  });

  function cleanupAndLeave(){
    if (presenceRef) presenceRef.remove();
    if (isHost && hostRef) hostRef.remove();
    if (sessionRef) sessionRef.off();
    location.href = location.pathname;
  }

  window.addEventListener('beforeunload', () => {
    // Best-effort synchronous-ish cleanup; onDisconnect() handles the rest
    // if the tab closes before this fires.
    if (presenceRef) presenceRef.remove();
    if (isHost && hostRef) hostRef.remove();
  });

  copyLinkBtn.addEventListener('click', () => {
    const url = location.origin + location.pathname + '?session=' + encodeURIComponent(sessionCode);
    navigator.clipboard.writeText(url).then(() => {
      const original = copyLinkBtn.textContent;
      copyLinkBtn.textContent = 'Copied!';
      setTimeout(() => copyLinkBtn.textContent = original, 1500);
    }).catch(() => {
      prompt("Copy this invite link:", url);
    });
  });

  // ================= Story (host edits, writes straight to DB) =================
  let storyDebounce = null;
  storyInput.addEventListener('input', () => {
    if (!isHost) return;
    clearTimeout(storyDebounce);
    storyDebounce = setTimeout(() => {
      sessionRef.child('story').set(storyInput.value);
    }, 300);
  });

  // ================= Rendering =================
  function render(){
    const count = Object.keys(state.players).length;
    connCountLabel.textContent = count + (count === 1 ? ' at the table' : ' at the table');
    roleBadgeSelf.textContent = isHost ? "★ You're hosting" : "Playing as " + myName;
    roleBadgeSelf.classList.toggle('host', isHost);
    hostButtonsWrap.classList.toggle('hidden', !isHost);
    guestWaitingNote.classList.toggle('hidden', isHost);
    claimHostBtn.classList.toggle('hidden', !!state.hostId || isHost);
    [...durationSelect.children].forEach(b => b.disabled = !isHost);

    if (document.activeElement !== storyInput) storyInput.value = state.story || "";
    storyInput.disabled = !isHost;
    storyInput.placeholder = isHost
      ? "What are we estimating? (e.g. JIRA-142: refactor auth)"
      : "Waiting for the host to set a story…";

    renderPlayers();
    renderDeck();
    renderVoterLabel();
    renderTimerButtons();
    if (state.revealed) showResults(); else resultsBox.classList.remove('show');
    syncMusicToState();
  }

  function renderPlayers(){
    playersGrid.innerHTML = "";
    Object.keys(state.players).forEach(id => {
      const p = state.players[id];
      const card = document.createElement('div');
      card.className = 'player-card' + (id === myId ? ' is-you' : '');
      const isThatHost = id === state.hostId;
      card.innerHTML = `
        <div class="player-name">${escapeHtml(p.name)}${isThatHost ? '<span class="host-star">★</span>' : ''}</div>
        <div class="mini-card ${miniCardClass(p)}">${state.revealed && p.vote ? p.vote : ''}</div>
      `;
      if (isHost && id !== myId){
        const rm = document.createElement('button');
        rm.className = 'player-remove';
        rm.title = 'Remove player';
        rm.textContent = '✕';
        rm.addEventListener('click', () => {
          sessionRef.child('players/' + id).remove();
        });
        card.appendChild(rm);
      }
      playersGrid.appendChild(card);
    });
  }

  function miniCardClass(p){
    if (state.revealed && p.vote) return 'revealed';
    if (p.vote) return 'hidden-back';
    return 'empty';
  }

  function renderVoterLabel(){
    currentVoterEl.innerHTML = state.revealed
      ? "Round revealed — the host can start another."
      : `Voting as <strong>${escapeHtml(myName)}</strong>`;
  }

  function renderDeck(){
    deckFan.innerHTML = "";
    const me = state.players[myId];
    DECK.forEach(val => {
      const btn = document.createElement('button');
      btn.className = 'estimate-card';
      btn.textContent = val;
      btn.setAttribute('data-val', val);
      if (state.revealed || !me) btn.classList.add('disabled');
      if (me && me.vote === val) btn.classList.add('selected');
      btn.addEventListener('click', () => {
        if (state.revealed || !state.players[myId]) return;
        castVote(val);
      });
      deckFan.appendChild(btn);
    });
  }

  function castVote(val){
    sessionRef.child('players/' + myId + '/vote').set(val);
  }

  // ================= Timer (host-authoritative, synced via Firebase) =================
  setInterval(tick, 250);

  function formatTime(s){
    s = Math.max(0, Math.round(s));
    const m = Math.floor(s/60).toString().padStart(2,'0');
    const sec = (s%60).toString().padStart(2,'0');
    return `${m}:${sec}`;
  }

  function tick(){
    if (!sessionRef) return; // not connected yet
    let remaining;
    if (state.running && state.endAt){
      remaining = (state.endAt - Date.now()) / 1000;
    } else if (state.remainingMs != null){
      remaining = state.remainingMs / 1000;
    } else {
      remaining = state.durationSecs;
    }
    remaining = Math.max(0, remaining);

    timerDigits.textContent = formatTime(remaining);
    const frac = state.durationSecs ? remaining / state.durationSecs : 0;
    chipProgress.style.strokeDashoffset = CIRC * (1 - frac);
    chipWrap.classList.toggle('pulsing', !!state.running);

    if (state.running && remaining <= 0.05){
      timerState.textContent = "Time!";
      if (isHost && !state.revealed){
        sessionRef.update({ running: false, revealed: true });
      }
    } else if (state.revealed){
      timerState.textContent = "Revealed";
    } else if (state.running){
      timerState.textContent = "Voting…";
    } else if (state.remainingMs != null){
      timerState.textContent = "Paused";
    } else {
      timerState.textContent = "Ready";
    }
  }

  function renderTimerButtons(){
    if (!isHost) return;
    startBtn.disabled = !!state.running;
    startBtn.textContent = (state.remainingMs != null && !state.running) ? "Resume" : "Start Round";
    pauseBtn.disabled = !state.running;
    revealBtn.disabled = state.revealed;
    [...durationSelect.children].forEach(b => {
      b.classList.toggle('active', parseInt(b.getAttribute('data-secs'),10) === state.durationSecs);
    });
  }

  startBtn.addEventListener('click', () => {
    if (!isHost || state.running) return;
    if (startBtn.textContent === "Resume" && state.remainingMs != null){
      sessionRef.update({
        running: true,
        endAt: Date.now() + state.remainingMs,
        remainingMs: null
      });
    } else {
      // fresh round: clear votes, reset reveal
      const clearedVotes = {};
      Object.keys(state.players).forEach(id => clearedVotes[id + '/vote'] = null);
      sessionRef.child('players').update(clearedVotes);
      sessionRef.update({
        running: true,
        revealed: false,
        endAt: Date.now() + state.durationSecs * 1000,
        remainingMs: null
      });
    }
  });

  pauseBtn.addEventListener('click', () => {
    if (!isHost || !state.running) return;
    sessionRef.update({
      running: false,
      remainingMs: Math.max(0, state.endAt - Date.now()),
      endAt: null
    });
  });

  revealBtn.addEventListener('click', () => {
    if (!isHost || state.revealed) return;
    sessionRef.update({ running: false, revealed: true });
  });

  durationSelect.addEventListener('click', e => {
    const btn = e.target.closest('button');
    if (!btn || !isHost) return;
    const secs = parseInt(btn.getAttribute('data-secs'), 10);
    const updates = { durationSecs: secs };
    if (!state.running) updates.remainingMs = null;
    sessionRef.update(updates);
  });

  chipWrap.addEventListener('dblclick', () => {
    if (!isHost || state.revealed) return;
    sessionRef.update({ running: false, revealed: true });
  });

  function showResults(){
    const players = Object.values(state.players);
    const voted = players.filter(p => p.vote && p.vote !== '?' && p.vote !== '☕');
    resultsList.innerHTML = "";
    players.forEach(p => {
      const chip = document.createElement('div');
      chip.className = 'result-chip';
      chip.innerHTML = `${escapeHtml(p.name)} <b>${p.vote ? p.vote : '—'}</b>`;
      resultsList.appendChild(chip);
    });
    if (voted.length){
      const nums = voted.map(p => parseFloat(p.vote)).filter(n => !isNaN(n));
      const avg = nums.length ? (nums.reduce((a,b)=>a+b,0) / nums.length) : null;
      avgBadge.textContent = avg !== null ? `avg ${avg.toFixed(1)}` : "";
      const allSame = voted.every(p => p.vote === voted[0].vote) && voted.length === players.length;
      consensusFlag.textContent = allSame && players.length > 1
        ? "Consensus reached — everyone's aligned."
        : "Spread the estimates and talk through the gap before locking it in.";
    } else {
      avgBadge.textContent = "";
      consensusFlag.textContent = "No votes cast this round.";
    }
    resultsBox.classList.add('show');
  }

  // ================= Audio: generative table music + chime =================
  let audioStarted = false;
  let musicLoop = null;
  let padSynth = null;
  let plinkSynth = null;
  let musicOn = true;
  let musicPlaying = false;

  function ensureAudioStarted(){
    if (audioStarted) return;
    if (typeof Tone === 'undefined') return;
    Tone.start();
    audioStarted = true;
    padSynth = new Tone.PolySynth(Tone.FMSynth, {
      volume: -18,
      envelope: { attack: 1.2, decay: 0.6, sustain: 0.6, release: 2.2 }
    }).toDestination();
    plinkSynth = new Tone.PluckSynth({
      volume: -22,
      attackNoise: 0.6,
      dampening: 3500,
      resonance: 0.85
    }).toDestination();
  }

  const chordPool = [
    ["C3","E3","G3","B3"],
    ["A2","C3","E3","G3"],
    ["F2","A2","C3","E3"],
    ["G2","B2","D3","F3"]
  ];
  const pluckNotes = ["C5","D5","E5","G5","A5"];

  function startMusic(){
    if (typeof Tone === 'undefined' || !audioStarted || musicPlaying) return;
    musicPlaying = true;
    let chordIdx = 0;
    musicLoop = new Tone.Loop(time => {
      const chord = chordPool[chordIdx % chordPool.length];
      padSynth.triggerAttackRelease(chord, "2n", time);
      chordIdx++;
      if (Math.random() > 0.4){
        const note = pluckNotes[Math.floor(Math.random()*pluckNotes.length)];
        plinkSynth.triggerAttack(note, time + 0.5);
      }
    }, "2n").start(0);
    Tone.Transport.bpm.value = 78;
    Tone.Transport.start();
    vinylIcon.classList.add('spinning');
  }

  function stopMusic(){
    if (!musicPlaying) return;
    musicPlaying = false;
    if (musicLoop){ musicLoop.stop(); musicLoop.dispose(); musicLoop = null; }
    if (typeof Tone !== 'undefined') Tone.Transport.stop();
    vinylIcon.classList.remove('spinning');
  }

  function playChime(){
    if (typeof Tone === 'undefined' || !audioStarted) return;
    const bell = new Tone.MetalSynth({
      volume: -10,
      envelope: { attack: 0.001, decay: 1.2, release: 0.4 },
      harmonicity: 5.1,
      modulationIndex: 16,
      resonance: 2000,
      octaves: 1.2
    }).toDestination();
    const now = Tone.now();
    bell.triggerAttack("C5", now);
    bell.triggerAttack("E5", now + 0.15);
    bell.triggerAttack("G5", now + 0.3);
    setTimeout(() => bell.dispose(), 3000);
  }

  let wasRunning = false;
  function syncMusicToState(){
    if (state.running && musicOn) startMusic();
    else stopMusic();
    if (wasRunning && !state.running && state.revealed) playChime();
    wasRunning = state.running;
  }

  musicToggle.addEventListener('click', () => {
    musicOn = !musicOn;
    musicLabel.textContent = musicOn ? "Table music: on" : "Table music: off";
    if (!musicOn) stopMusic();
    else if (state.running) startMusic();
  });

})();