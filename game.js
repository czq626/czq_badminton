(() => {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const leftScoreEl = document.getElementById("leftScore");
  const rightScoreEl = document.getElementById("rightScore");
  const startScreen = document.getElementById("startScreen");
  const gameStage = document.getElementById("gameStage");
  const overlay = document.getElementById("overlay");
  const overlayText = document.getElementById("overlayText");
  const startButton = document.getElementById("startButton");
  const overlayActionButton = document.getElementById("overlayActionButton");
  const modeButton = document.getElementById("modeButton");
  const assistButton = document.getElementById("assistButton");
  const soundButton = document.getElementById("soundButton");
  const pauseButton = document.getElementById("pauseButton");
  const resetButton = document.getElementById("resetButton");
  const modeLabel = document.getElementById("modeLabel");
  const statusStrip = document.getElementById("statusStrip");
  const startSummary = document.getElementById("startSummary");
  const matchModeButtons = [...document.querySelectorAll("[data-match-mode]")];
  const difficultyButtons = [...document.querySelectorAll("[data-difficulty]")];
  const targetScoreButtons = [...document.querySelectorAll("[data-target-score]")];
  const styleButtons = [...document.querySelectorAll("[data-style]")];
  const onlinePanel = document.getElementById("onlinePanel");
  const onlineStatus = document.getElementById("onlineStatus");
  const createRoomButton = document.getElementById("createRoomButton");
  const acceptAnswerButton = document.getElementById("acceptAnswerButton");
  const joinRoomButton = document.getElementById("joinRoomButton");
  const resetOnlineButton = document.getElementById("resetOnlineButton");
  const hostOfferOutput = document.getElementById("hostOfferOutput");
  const hostAnswerInput = document.getElementById("hostAnswerInput");
  const guestOfferInput = document.getElementById("guestOfferInput");
  const guestAnswerOutput = document.getElementById("guestAnswerOutput");
  const touchButtons = [...document.querySelectorAll("[data-hold], [data-tap]")];

  const W = canvas.width;
  const H = canvas.height;
  const netX = W / 2;
  const ground = 462;
  const court = {
    left: 36,
    right: W - 36,
    top: 174,
    apronTop: 158,
    serviceY: 304,
    nearServiceLeft: 212,
    nearServiceRight: W - 212,
  };
  const netTop = 321;

  const keys = new Set();
  const taps = new Set();
  const inputBuffer = new Map();
  const remoteKeys = new Set();
  const remoteTaps = new Set();
  const remoteInputBuffer = new Map();
  const settingsKey = "stick-badminton-settings";

  const state = {
    running: false,
    paused: false,
    matchMode: "solo",
    singlePlayer: true,
    difficulty: "easy",
    targetScore: 7,
    playStyle: "standard",
    winner: null,
    rallyPause: 0,
    readyTimer: 0,
    serveDelay: 0,
    serveSide: "left",
    score: { left: 0, right: 0 },
    shake: 0,
    hitStop: 0,
    rallyHits: 0,
    bestRally: 0,
    rallyHeat: 0,
    assist: true,
    demoTime: 0,
    message: "",
    messageTimer: 0,
    pendingServer: null,
    particles: [],
    audioReady: false,
    audio: null,
    muted: false,
  };

  const online = {
    rtcSupported: "RTCPeerConnection" in window && "RTCSessionDescription" in window,
    peerConnection: null,
    dataChannel: null,
    roomChannel: null,
    transport: "invite",
    role: null,
    connected: false,
    roomCode: "",
    clientId: Math.random().toString(36).slice(2, 10),
    peerId: "",
    snapshotSeq: 0,
    lastSnapshotSeq: 0,
    lastSnapshot: 0,
    lastSnapshotReceived: 0,
    lastInputSent: 0,
    lastHudUpdate: 0,
    lastScoreLeft: 0,
    lastScoreRight: 0,
    lastWinner: null,
    lastRallyHits: 0,
    lastBirdTouched: null,
    lastBirdServed: false,
    lastNetSound: 0,
    pendingInputTaps: new Set(),
  };

  const difficulty = {
    easy: { label: "休闲", aiSpeed: 0.74, aiError: 56, aiReact: 0.18 },
    normal: { label: "普通", aiSpeed: 0.9, aiError: 34, aiReact: 0.11 },
    hard: { label: "高手", aiSpeed: 1.04, aiError: 16, aiReact: 0.04 },
  };

  const playStyles = {
    standard: { label: "标准", wind: 0, wallBounce: 0.64, netBounce: -0.38 },
    fun: { label: "趣味", wind: 95, wallBounce: 0.78, netBounce: -0.52 },
  };

  const shotTuning = {
    perfectWindow: 0.68,
    hitWindow: 72,
    netRiskY: netTop + 18,
    smashRecovery: 0.18,
    inputBuffer: 0.16,
  };

  const onlineTuning = {
    inputInterval: 1000 / 45,
    snapshotInterval: 1000 / 30,
    remotePlayerBlend: 0.5,
    localPlayerBlend: 0.18,
    birdBlend: 0.62,
    hudInterval: 220,
  };

  const pixelArt = loadPixelArt({
    court: "assets/generated/images/pixel-court-selected.png",
    shuttle: "assets/generated/images/pixel-shuttlecock-cutout.png",
    smash: "assets/generated/images/pixel-smash-burst-selected.png",
  });

  const left = makePlayer("left", 186, "#35b8ff");
  const right = makePlayer("right", 774, "#ff5f69");
  const bird = makeBird();

  function loadPixelArt(defs) {
    return Object.fromEntries(
      Object.entries(defs).map(([key, src]) => {
        const image = new Image();
        const asset = { image, loaded: false, failed: false };
        image.onload = () => {
          asset.loaded = true;
          render();
        };
        image.onerror = () => {
          asset.failed = true;
        };
        image.src = src;
        return [key, asset];
      })
    );
  }

  function makePlayer(side, x, color) {
    return {
      side,
      x,
      y: ground,
      vx: 0,
      vy: 0,
      width: 42,
      height: 116,
      color,
      facing: side === "left" ? 1 : -1,
      swing: 0,
      smash: 0,
      scoop: 0,
      charge: 0,
      recovery: 0,
      foot: 0,
      onGround: true,
      lastHit: 0,
      aiThink: 0,
      aiTargetX: x,
      aiShot: "clear",
      aiPlan: "neutral",
    };
  }

  function makeBird() {
    return {
      x: netX - 148,
      y: 210,
      vx: 0,
      vy: 0,
      r: 8,
      angle: 0,
      spin: 0,
      trail: [],
      served: false,
      server: "left",
      lastTouched: null,
    };
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function sideBounds(side) {
    return side === "left" ? [court.left + 28, netX - 48] : [netX + 48, court.right - 28];
  }

  function isOnlineGuest() {
    return state.matchMode === "online" && online.role === "guest";
  }

  function controlledByAi(player) {
    return player.side === "right" && state.matchMode === "solo";
  }

  function resetMatch() {
    if (isOnlineGuest()) {
      setOnlineStatus("等待房主开局和同步比赛。");
      return;
    }
    if (state.matchMode === "online" && !online.role) {
      setOnlineStatus("请先创建邀请，或粘贴邀请码加入对战。");
      return;
    }
    if (state.matchMode === "online" && online.role === "guest") {
      setOnlineStatus("等待房主开始比赛。");
      return;
    }
    if (state.matchMode === "online" && online.role === "host" && !online.connected) {
      setOnlineStatus("等待对手连接后再开局。");
      return;
    }
    state.score.left = 0;
    state.score.right = 0;
    state.winner = null;
    state.running = true;
    state.paused = false;
    state.rallyPause = 0;
    state.readyTimer = 0;
    state.serveDelay = 0;
    state.pendingServer = null;
    state.message = "";
    state.messageTimer = 0;
    state.hitStop = 0;
    state.rallyHits = 0;
    state.bestRally = 0;
    state.rallyHeat = 0;
    state.particles = [];
    state.serveSide = "left";
    resetRally("left");
    startScreen.classList.add("hidden");
    gameStage.classList.remove("hidden");
    window.scrollTo(0, 0);
    overlay.classList.add("hidden");
    pauseButton.textContent = "暂停";
    startButton.textContent = "开始游戏";
    overlayActionButton.textContent = "继续";
    updateHud();
    initAudio();
    sendOnlinePacket({ type: "start" });
    sendOnlineSnapshot(true);
  }

  function resetRally(server) {
    Object.assign(left, makePlayer("left", 186, "#35b8ff"));
    Object.assign(right, makePlayer("right", 774, "#ff5f69"));
    Object.assign(bird, makeBird());
    bird.server = server;
    bird.lastTouched = null;
    bird.served = false;
    bird.x = server === "left" ? left.x + 58 : right.x - 58;
    bird.y = 240;
    bird.vx = 0;
    bird.vy = 0;
    state.rallyHits = 0;
    state.rallyHeat = 0;
    state.readyTimer = 0.72;
    state.serveDelay = server === "right" && state.matchMode === "solo" ? 0.65 : 0;
    if (!state.messageTimer) {
      state.message = server === "left" ? "蓝队发球" : "红队发球";
      state.messageTimer = 1.2;
    }
    updateHud();
  }

  function updateHud() {
    leftScoreEl.textContent = state.score.left;
    rightScoreEl.textContent = state.score.right;
    modeLabel.textContent = modeLabelText();
    syncMatchModeButtons();
    const server = state.pendingServer || bird.server || state.serveSide;
    const serverLabel = server === "left" ? "蓝队发球" : "红队发球";
    const lead = Math.abs(state.score.left - state.score.right);
    const deuce =
      state.score.left >= state.targetScore - 1 &&
      state.score.right >= state.targetScore - 1 &&
      lead < 2;
    const rule = deuce ? "平分后领先2分" : `${state.targetScore}分制`;
    const onlineLabel =
      state.matchMode === "online"
        ? online.connected
          ? "邀请已连接"
          : online.role
            ? online.role === "host"
              ? "等待应答"
              : "等待房主"
            : "等待邀请"
        : difficulty[state.difficulty].label;
    statusStrip.textContent = `${rule} | ${serverLabel} | ${onlineLabel} | ${playStyles[state.playStyle].label}`;
    startSummary.textContent = `${modeLabelText()} | ${state.targetScore}分制 | ${playStyles[state.playStyle].label}球路`;
    if (!state.running || state.paused) {
      overlayText.textContent = state.paused ? "比赛暂停，按 P 或点击继续。" : matchCopy();
    }
  }

  function matchCopy() {
    if (state.matchMode === "online") return `邀请对战：房主蓝队，对手红队，先到 ${state.targetScore} 分获胜。`;
    return `抢落点、跳扣杀，先到 ${state.targetScore} 分获胜。`;
  }

  function modeLabelText() {
    if (state.matchMode === "online") return "邀请对战";
    if (state.matchMode === "local") return "本地双人";
    return "单人模式";
  }

  function saveSettings() {
    const settings = {
      matchMode: state.matchMode,
      singlePlayer: state.singlePlayer,
      difficulty: state.difficulty,
      targetScore: state.targetScore,
      playStyle: state.playStyle,
      assist: state.assist,
      muted: state.muted,
    };
    try {
      localStorage.setItem(settingsKey, JSON.stringify(settings));
    } catch {
      document.cookie = `${settingsKey}=${encodeURIComponent(JSON.stringify(settings))}; max-age=31536000; path=/; SameSite=Lax`;
    }
  }

  function loadSettings() {
    try {
      const raw =
        localStorage.getItem(settingsKey) ||
        document.cookie
          .split("; ")
          .find((item) => item.startsWith(`${settingsKey}=`))
          ?.slice(settingsKey.length + 1);
      if (!raw) return;
      const settings = JSON.parse(decodeURIComponent(raw));
      if (["solo", "local"].includes(settings.matchMode)) state.matchMode = settings.matchMode;
      if (typeof settings.singlePlayer === "boolean") state.singlePlayer = settings.singlePlayer;
      state.singlePlayer = state.matchMode === "solo";
      if (difficulty[settings.difficulty]) state.difficulty = settings.difficulty;
      if ([7, 11].includes(settings.targetScore)) state.targetScore = settings.targetScore;
      if (playStyles[settings.playStyle]) state.playStyle = settings.playStyle;
      if (typeof settings.assist === "boolean") state.assist = settings.assist;
      if (typeof settings.muted === "boolean") state.muted = settings.muted;
    } catch {
      // Ignore malformed saved settings and keep defaults.
    }
  }

  function applySettingsToUi() {
    syncMatchModeButtons();
    difficultyButtons.forEach((button) => {
      button.classList.toggle("active", button.dataset.difficulty === state.difficulty);
    });
    targetScoreButtons.forEach((button) => {
      button.classList.toggle("active", Number(button.dataset.targetScore) === state.targetScore);
    });
    styleButtons.forEach((button) => {
      button.classList.toggle("active", button.dataset.style === state.playStyle);
    });
    assistButton.textContent = state.assist ? "辅助" : "硬核";
    soundButton.textContent = state.muted ? "静音" : "音效";
    onlinePanel.hidden = state.matchMode !== "online";
    if (state.matchMode === "online") startInviteMode();
    updateHud();
  }

  function setMatchMode(matchMode, restart = false) {
    state.matchMode = matchMode;
    state.singlePlayer = matchMode === "solo";
    if (matchMode === "online") startInviteMode();
    if (matchMode !== "online" && (online.peerConnection || online.roomChannel || online.role)) {
      resetOnlineConnection();
    }
    onlinePanel.hidden = matchMode !== "online";
    saveSettings();
    updateHud();
    if (restart && state.running) resetMatch();
  }

  function syncMatchModeButtons() {
    matchModeButtons.forEach((button) => {
      button.classList.toggle("active", button.dataset.matchMode === state.matchMode);
    });
  }

  function keyDown(code) {
    if (!keys.has(code)) {
      taps.add(code);
      inputBuffer.set(code, shotTuning.inputBuffer);
      if (state.matchMode === "online" && online.role === "guest") {
        online.pendingInputTaps.add(normalizeGuestControl(code));
      }
    }
    keys.add(code);
  }

  function keyUp(code) {
    keys.delete(code);
  }

  function buffered(code) {
    return taps.has(code) || (inputBuffer.get(code) || 0) > 0;
  }

  function updateInputBuffer(dt) {
    inputBuffer.forEach((time, code) => {
      const next = time - dt;
      if (next <= 0) inputBuffer.delete(code);
      else inputBuffer.set(code, next);
    });
    remoteInputBuffer.forEach((time, code) => {
      const next = time - dt;
      if (next <= 0) remoteInputBuffer.delete(code);
      else remoteInputBuffer.set(code, next);
    });
  }

  window.addEventListener("keydown", (event) => {
    primeAudio();
    const code = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    keyDown(code);
    if (["ArrowLeft", "ArrowRight", "ArrowUp", " "].includes(event.key)) {
      event.preventDefault();
    }
    if (event.key.toLowerCase() === "p" && state.running) togglePause();
    if (event.key === "Enter" && !state.running) resetMatch();
    sendOnlineInput();
  });

  window.addEventListener("keyup", (event) => {
    const code = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    keyUp(code);
    sendOnlineInput();
  });
  window.addEventListener("pointerdown", primeAudio, { passive: true });

  startButton.addEventListener("click", () => {
    primeAudio();
    resetMatch();
  });
  overlayActionButton.addEventListener("click", () => {
    primeAudio();
    if (state.paused) togglePause();
    else resetMatch();
  });
  resetButton.addEventListener("click", () => {
    primeAudio();
    resetMatch();
  });
  pauseButton.addEventListener("click", () => {
    primeAudio();
    togglePause();
  });
  assistButton.addEventListener("click", () => {
    state.assist = !state.assist;
    assistButton.textContent = state.assist ? "辅助" : "硬核";
    saveSettings();
  });
  soundButton.addEventListener("click", () => {
    state.muted = !state.muted;
    soundButton.textContent = state.muted ? "静音" : "音效";
    saveSettings();
    if (!state.muted) initAudio();
  });
  modeButton.addEventListener("click", () => {
    setMatchMode(state.matchMode === "solo" ? "local" : "solo", true);
  });
  matchModeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setMatchMode(button.dataset.matchMode, state.running);
    });
  });
  difficultyButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.difficulty = button.dataset.difficulty;
      difficultyButtons.forEach((item) => item.classList.toggle("active", item === button));
      saveSettings();
      updateHud();
      if (state.running && state.matchMode === "solo") resetMatch();
    });
  });
  targetScoreButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.targetScore = Number(button.dataset.targetScore);
      targetScoreButtons.forEach((item) => item.classList.toggle("active", item === button));
      saveSettings();
      updateHud();
      syncOnlineRoomSettings();
      if (state.running) resetMatch();
    });
  });
  styleButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.playStyle = button.dataset.style;
      styleButtons.forEach((item) => item.classList.toggle("active", item === button));
      saveSettings();
      updateHud();
      syncOnlineRoomSettings();
      if (state.running) resetMatch();
    });
  });
  touchButtons.forEach((button) => {
    const hold = button.dataset.hold;
    const tap = button.dataset.tap;
    let startY = 0;
    const begin = (event) => {
      event.preventDefault();
      primeAudio();
      startY = event.clientY;
      if (hold) keyDown(hold);
      if (tap) keyDown(tap);
      sendOnlineInput();
    };
    const end = (event) => {
      event.preventDefault();
      let dropKey = null;
      if (tap && event.clientY - startY > 22) {
        dropKey = tap === "j" ? "s" : tap === "1" ? "ArrowDown" : null;
        if (dropKey) keyDown(dropKey);
      }
      if (hold) keyUp(hold);
      if (tap) keyUp(tap);
      if (dropKey) keyUp(dropKey);
      sendOnlineInput();
    };
    button.addEventListener("pointerdown", begin);
    button.addEventListener("pointerup", end);
    button.addEventListener("pointercancel", end);
    button.addEventListener("pointerleave", end);
  });

  createRoomButton.addEventListener("click", createOnlineOffer);
  acceptAnswerButton.addEventListener("click", acceptOnlineAnswer);
  joinRoomButton.addEventListener("click", joinOnlineOffer);
  resetOnlineButton.addEventListener("click", resetOnlineConnection);

  function setOnlineStatus(text) {
    onlineStatus.textContent = text;
    updateHud();
  }

  function randomRoomCode() {
    return Math.random().toString(36).slice(2, 6).toUpperCase();
  }

  function makeRoomChannelName(code) {
    return `stick-badminton-room-${code}`;
  }

  function encodeSignal(value) {
    return btoa(unescape(encodeURIComponent(JSON.stringify(value))));
  }

  function decodeSignal(value) {
    return JSON.parse(decodeURIComponent(escape(atob(value.trim()))));
  }

  async function waitForIceGathering(peer) {
    if (peer.iceGatheringState === "complete") return;
    await new Promise((resolve) => {
      const done = () => {
        if (peer.iceGatheringState !== "complete") return;
        peer.removeEventListener("icegatheringstatechange", done);
        resolve();
      };
      peer.addEventListener("icegatheringstatechange", done);
      setTimeout(resolve, 2400);
    });
  }

  function clearInviteFields(clearGuest = false) {
    hostOfferOutput.value = "";
    hostAnswerInput.value = "";
    if (clearGuest) {
      guestOfferInput.value = "";
      guestAnswerOutput.value = "";
    }
  }

  function startInviteMode() {
    if (!online.rtcSupported) {
      setOnlineStatus("当前浏览器不支持 WebRTC 邀请对战。");
      return;
    }
    setOnlineStatus("创建邀请后复制给对手；对手粘贴邀请码并回传应答码即可连接。");
  }

  function createPeerConnection(role) {
    closePeerConnection();
    online.peerConnection = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });
    online.peerConnection.onconnectionstatechange = () => {
      const status = online.peerConnection.connectionState;
      if (status === "connected") {
        online.connected = true;
        setOnlineStatus(role === "host" ? "邀请对战已连接 | 你控制蓝队。" : "邀请对战已连接 | 你控制红队。");
        if (role === "host") sendOnlineSnapshot(true);
      } else if (["failed", "disconnected", "closed"].includes(status)) {
        online.connected = false;
        setOnlineStatus("点对点连接已断开，可以重新创建邀请。");
      }
      updateHud();
    };
    online.peerConnection.ondatachannel = (event) => bindDataChannel(event.channel);
    return online.peerConnection;
  }

  function bindDataChannel(channel) {
    online.dataChannel = channel;
    channel.onopen = () => {
      online.connected = true;
      setOnlineStatus(online.role === "host" ? "邀请对战已连接 | 你控制蓝队。" : "邀请对战已连接 | 你控制红队。");
      if (online.role === "guest") sendOnlineInput(true);
      if (online.role === "host") sendOnlineSnapshot(true);
    };
    channel.onmessage = (event) => {
      try {
        receiveOnlinePacket(JSON.parse(event.data));
      } catch {
        setOnlineStatus("收到无法识别的对战消息。");
      }
    };
    channel.onclose = () => {
      online.connected = false;
      setOnlineStatus("点对点连接已断开，可以重新创建邀请。");
      updateHud();
    };
  }

  function enterOnlineRoom(role, code, transport) {
    closeRoomChannel();
    state.matchMode = "online";
    online.transport = transport;
    online.role = role;
    online.roomCode = code || randomRoomCode();
    online.peerId = "";
    online.connected = false;
    online.snapshotSeq = 0;
    online.lastSnapshotSeq = 0;
    online.lastSnapshot = 0;
    online.lastSnapshotReceived = 0;
    online.lastInputSent = 0;
    online.lastHudUpdate = 0;
    online.lastScoreLeft = 0;
    online.lastScoreRight = 0;
    online.lastWinner = null;
    online.lastRallyHits = 0;
    online.lastBirdTouched = null;
    online.lastBirdServed = false;
    online.lastNetSound = 0;
    online.pendingInputTaps.clear();
    remoteKeys.clear();
    remoteTaps.clear();
    remoteInputBuffer.clear();
  }

  async function createOnlineOffer() {
    setMatchMode("online", false);
    if (!online.rtcSupported) {
      setOnlineStatus("当前浏览器不支持 WebRTC 邀请对战。");
      return;
    }
    resetOnlineConnection(false);
    clearInviteFields();
    enterOnlineRoom("host", randomRoomCode(), "webrtc");
    const peer = createPeerConnection("host");
    bindDataChannel(peer.createDataChannel("match", { ordered: false, maxRetransmits: 0 }));
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    await waitForIceGathering(peer);
    hostOfferOutput.value = encodeSignal({
      v: 1,
      role: "host",
      roomCode: online.roomCode,
      targetScore: state.targetScore,
      playStyle: state.playStyle,
      description: peer.localDescription,
    });
    setOnlineStatus("邀请码已生成：复制给对手，收到应答码后粘贴并点击“接受应答”。");
  }

  async function acceptOnlineAnswer() {
    if (!online.peerConnection || online.role !== "host") {
      setOnlineStatus("请先创建邀请。");
      return;
    }
    try {
      const signal = decodeSignal(hostAnswerInput.value);
      await online.peerConnection.setRemoteDescription(signal.description);
      setOnlineStatus("已接受应答，正在建立点对点连接...");
    } catch {
      setOnlineStatus("应答码无效，请重新粘贴对手生成的内容。");
    }
  }

  async function joinOnlineOffer() {
    setMatchMode("online", false);
    if (!online.rtcSupported) {
      setOnlineStatus("当前浏览器不支持 WebRTC 邀请对战。");
      return;
    }
    try {
      const signal = decodeSignal(guestOfferInput.value);
      resetOnlineConnection(false);
      guestAnswerOutput.value = "";
      state.targetScore = Number(signal.targetScore) === 11 ? 11 : 7;
      state.playStyle = signal.playStyle === "fun" ? "fun" : "standard";
      applySettingsToUi();
      enterOnlineRoom("guest", signal.roomCode || randomRoomCode(), "webrtc");
      const peer = createPeerConnection("guest");
      await peer.setRemoteDescription(signal.description);
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      await waitForIceGathering(peer);
      guestAnswerOutput.value = encodeSignal({
        v: 1,
        role: "guest",
        roomCode: online.roomCode,
        description: peer.localDescription,
      });
      setOnlineStatus("应答码已生成：复制给房主，等待房主接受后自动连接。");
    } catch {
      setOnlineStatus("邀请码无效，请重新粘贴房主生成的内容。");
    }
  }

  function createOnlineRoom() {
    createOnlineOffer();
  }

  function joinOnlineRoom() {
    joinOnlineOffer();
  }

  function closePeerConnection() {
    if (online.dataChannel) online.dataChannel.close();
    if (online.peerConnection) online.peerConnection.close();
    online.dataChannel = null;
    online.peerConnection = null;
  }

  function closeRoomChannel() {
    if (online.roomChannel) online.roomChannel.close();
    online.roomChannel = null;
  }

  function sendOnlineMessage(packet) {
    if (!online.dataChannel || online.dataChannel.readyState !== "open") return false;
    online.dataChannel.send(JSON.stringify(packet));
    return true;
  }

  function receiveOnlinePacket(packet) {
    if (packet.type === "input" && online.role === "host") {
      remoteKeys.clear();
      remoteTaps.clear();
      (packet.keys || []).forEach((code) => remoteKeys.add(code));
      (packet.taps || []).forEach((code) => {
        remoteTaps.add(code);
        remoteInputBuffer.set(code, shotTuning.inputBuffer);
      });
    }
    if (packet.type === "snapshot" && online.role === "guest") {
      applyOnlineSnapshot(packet);
    }
    if (packet.type === "start" && online.role === "guest") {
      primeAudio();
      startScreen.classList.add("hidden");
      gameStage.classList.remove("hidden");
      overlay.classList.add("hidden");
    }
  }

  function syncOnlineRoomSettings() {
    if (state.matchMode !== "online" || online.role !== "host" || !online.roomCode) return;
    sendOnlineSnapshot(true);
  }

  function resetOnlineConnection(clearSignals = true) {
    closePeerConnection();
    closeRoomChannel();
    online.role = null;
    online.connected = false;
    online.roomCode = "";
    online.peerId = "";
    online.transport = "invite";
    online.pendingInputTaps.clear();
    remoteKeys.clear();
    remoteTaps.clear();
    remoteInputBuffer.clear();
    if (clearSignals) {
      clearInviteFields(true);
      setOnlineStatus("已断开。创建邀请后复制给对手；对手粘贴邀请码并回传应答码即可连接。");
    }
  }

  function keySetFor(side) {
    if (state.matchMode === "online" && online.role === "host" && side === "right") return remoteKeys;
    return keys;
  }

  function remoteKeyAliases(code) {
    return {
      ArrowLeft: ["ArrowLeft", "a"],
      ArrowRight: ["ArrowRight", "d"],
      ArrowUp: ["ArrowUp", "w"],
      ArrowDown: ["ArrowDown", "s"],
      1: ["1", "j"],
      2: ["2", "k"],
    }[code] || [code];
  }

  function remoteKeyHas(code) {
    return remoteKeyAliases(code).some((alias) => remoteKeys.has(alias));
  }

  function remoteTapHas(code) {
    return remoteKeyAliases(code).some((alias) => remoteTaps.has(alias));
  }

  function remoteKeyBuffered(code) {
    return remoteKeyAliases(code).some((alias) => (remoteInputBuffer.get(alias) || 0) > 0);
  }

  function keyHeld(side, code) {
    if (keySetFor(side) === remoteKeys) return remoteKeyHas(code);
    return keys.has(code);
  }

  function keyBuffered(side, code) {
    if (keySetFor(side) !== keys) return remoteKeyHas(code) || remoteTapHas(code) || remoteKeyBuffered(code);
    return buffered(code);
  }

  function normalizeGuestControl(code) {
    return {
      a: "ArrowLeft",
      ArrowLeft: "ArrowLeft",
      d: "ArrowRight",
      ArrowRight: "ArrowRight",
      w: "ArrowUp",
      ArrowUp: "ArrowUp",
      " ": "ArrowUp",
      s: "ArrowDown",
      ArrowDown: "ArrowDown",
      j: "1",
      1: "1",
      k: "2",
      2: "2",
    }[code] || code;
  }

  function normalizedGuestControls(source) {
    return [...new Set([...source].map(normalizeGuestControl))];
  }

  function cleanTrail(trail) {
    if (!Array.isArray(trail)) return [];
    return trail
      .filter((point) => point && Number.isFinite(point.x) && Number.isFinite(point.y))
      .slice(0, 12)
      .map((point) => ({ x: point.x, y: point.y }));
  }

  function mix(current, target, blend) {
    if (!Number.isFinite(target)) return current;
    if (!Number.isFinite(current)) return target;
    return current + (target - current) * blend;
  }

  function blendNumberProp(target, source, key, blend) {
    if (Number.isFinite(source?.[key])) target[key] = mix(target[key], source[key], blend);
  }

  function applyPlayerSnapshot(player, snapshot, blend) {
    if (!snapshot) return;
    if (blend >= 1) {
      player.x = snapshot.x;
      player.y = snapshot.y;
      player.vx = snapshot.vx;
      player.vy = snapshot.vy;
    } else {
      blendNumberProp(player, snapshot, "x", blend);
      blendNumberProp(player, snapshot, "y", blend);
      blendNumberProp(player, snapshot, "vx", blend);
      blendNumberProp(player, snapshot, "vy", blend);
    }
    player.facing = snapshot.facing;
    player.swing = snapshot.swing;
    player.smash = snapshot.smash;
    player.scoop = snapshot.scoop || 0;
    player.charge = snapshot.charge;
    player.recovery = snapshot.recovery;
    player.foot = snapshot.foot;
    player.onGround = snapshot.onGround;
    player.lastHit = snapshot.lastHit;
    player.aiTargetX = snapshot.aiTargetX;
    player.aiShot = snapshot.aiShot;
    player.aiPlan = snapshot.aiPlan;
  }

  function applyBirdSnapshot(snapshot, blend) {
    if (!snapshot) return;
    if (blend >= 1) {
      bird.x = snapshot.x;
      bird.y = snapshot.y;
      bird.vx = snapshot.vx;
      bird.vy = snapshot.vy;
    } else {
      blendNumberProp(bird, snapshot, "x", blend);
      blendNumberProp(bird, snapshot, "y", blend);
      blendNumberProp(bird, snapshot, "vx", blend);
      blendNumberProp(bird, snapshot, "vy", blend);
    }
    bird.angle = snapshot.angle;
    bird.spin = snapshot.spin;
    bird.served = snapshot.served;
    bird.server = snapshot.server;
    bird.lastTouched = snapshot.lastTouched;
    bird.trail = cleanTrail(snapshot.trail);
  }

  function sendOnlineInput(force = false) {
    if (state.matchMode !== "online" || online.role !== "guest") return;
    const now = performance.now();
    if (!force && now - online.lastInputSent < onlineTuning.inputInterval) return;
    online.lastInputSent = now;
    const sent = sendOnlineMessage({
      type: "input",
      keys: normalizedGuestControls(keys),
      taps: normalizedGuestControls(new Set([...taps, ...online.pendingInputTaps])),
    });
    if (sent) online.pendingInputTaps.clear();
  }

  function sendOnlinePacket(packet) {
    if (state.matchMode !== "online" || online.role !== "host") return;
    sendOnlineMessage(packet);
  }

  function packPlayer(player) {
    return {
      x: player.x,
      y: player.y,
      vx: player.vx,
      vy: player.vy,
      facing: player.facing,
      swing: player.swing,
      smash: player.smash,
      scoop: player.scoop,
      charge: player.charge,
      recovery: player.recovery,
      foot: player.foot,
      onGround: player.onGround,
      lastHit: player.lastHit,
      aiTargetX: player.aiTargetX,
      aiShot: player.aiShot,
      aiPlan: player.aiPlan,
    };
  }

  function packBird() {
    return {
      x: bird.x,
      y: bird.y,
      vx: bird.vx,
      vy: bird.vy,
      angle: bird.angle,
      spin: bird.spin,
      served: bird.served,
      server: bird.server,
      lastTouched: bird.lastTouched,
      trail: cleanTrail(bird.trail),
    };
  }

  function sendOnlineSnapshot(force = false) {
    if (state.matchMode !== "online" || online.role !== "host") return;
    const now = performance.now();
    if (!force && now - online.lastSnapshot < onlineTuning.snapshotInterval) return;
    online.lastSnapshot = now;
    sendOnlinePacket({
      type: "snapshot",
      seq: (online.snapshotSeq += 1),
      running: state.running,
      paused: state.paused,
      winner: state.winner,
      rallyPause: state.rallyPause,
      readyTimer: state.readyTimer,
      serveDelay: state.serveDelay,
      serveSide: state.serveSide,
      score: state.score,
      shake: state.shake,
      rallyHits: state.rallyHits,
      bestRally: state.bestRally,
      rallyHeat: state.rallyHeat,
      assist: state.assist,
      message: state.message,
      messageTimer: state.messageTimer,
      pendingServer: state.pendingServer,
      targetScore: state.targetScore,
      playStyle: state.playStyle,
      left: packPlayer(left),
      right: packPlayer(right),
      bird: packBird(),
    });
  }

  function snapshotSoundForHit(packet) {
    if (!packet.bird?.lastTouched) return;
    if (packet.bird.lastTouched === online.lastBirdTouched && packet.rallyHits === online.lastRallyHits) return;
    if (!packet.bird.served && !online.lastBirdServed) return;
    const speed = Math.hypot(packet.bird.vx || 0, packet.bird.vy || 0);
    const smash = speed > 760 || packet.left?.smash > 0 || packet.right?.smash > 0;
    const perfect = speed > 580 || packet.rallyHeat > 0.55;
    blip(smash ? 180 : perfect ? 520 : 440, smash ? 0.09 : 0.045, smash ? 0.045 : perfect ? 0.034 : 0.026);
  }

  function snapshotSoundForScore(packet) {
    const leftScored = packet.score.left > online.lastScoreLeft;
    const rightScored = packet.score.right > online.lastScoreRight;
    if (!leftScored && !rightScored) return;
    blip(leftScored ? 560 : 260, 0.12, 0.032);
  }

  function snapshotSoundForNet(packet) {
    const now = performance.now();
    if (!packet.bird?.served || now - online.lastNetSound < 180) return;
    const nearNet = Math.abs((packet.bird.x || 0) - netX) < 18;
    const lowEnough = (packet.bird.y || 0) + bird.r > netTop;
    const changingSide = Math.sign(packet.bird.vx || 0) !== Math.sign(bird.vx || 0);
    if (nearNet && lowEnough && changingSide) {
      online.lastNetSound = now;
      blip(130, 0.08, 0.026);
    }
  }

  function playSnapshotSounds(packet) {
    if (!state.audioReady || !state.audio) return;
    snapshotSoundForScore(packet);
    snapshotSoundForHit(packet);
    snapshotSoundForNet(packet);
  }

  function rememberSnapshotForEvents(packet) {
    online.lastSnapshotSeq = packet.seq || online.lastSnapshotSeq;
    online.lastScoreLeft = packet.score?.left || 0;
    online.lastScoreRight = packet.score?.right || 0;
    online.lastWinner = packet.winner || null;
    online.lastRallyHits = packet.rallyHits || 0;
    online.lastBirdTouched = packet.bird?.lastTouched || null;
    online.lastBirdServed = Boolean(packet.bird?.served);
  }

  function shouldSnapOnlineSnapshot(packet) {
    const birdSnapshot = packet.bird;
    if (!birdSnapshot) return false;
    const scoreChanged = packet.score.left !== online.lastScoreLeft || packet.score.right !== online.lastScoreRight;
    const winnerChanged = packet.winner !== online.lastWinner;
    const newRally = online.lastBirdServed && !birdSnapshot.served;
    const serveStateChanged = birdSnapshot.served !== online.lastBirdServed || birdSnapshot.server !== bird.server;
    const pauseStateChanged = Boolean(packet.pendingServer) !== Boolean(state.pendingServer);
    const drift = Math.hypot((birdSnapshot.x || 0) - bird.x, (birdSnapshot.y || 0) - bird.y);
    return scoreChanged || winnerChanged || newRally || serveStateChanged || pauseStateChanged || drift > 150;
  }

  function applyOnlineSnapshot(packet) {
    const now = performance.now();
    if (packet.seq && packet.seq <= online.lastSnapshotSeq) return;
    playSnapshotSounds(packet);
    online.lastSnapshotReceived = now;
    const snap = shouldSnapOnlineSnapshot(packet);
    state.running = packet.running;
    state.paused = packet.paused;
    state.winner = packet.winner;
    state.rallyPause = packet.rallyPause;
    state.readyTimer = packet.readyTimer;
    state.serveDelay = packet.serveDelay;
    state.serveSide = packet.serveSide;
    state.score.left = packet.score.left;
    state.score.right = packet.score.right;
    state.shake = packet.shake;
    state.rallyHits = packet.rallyHits || 0;
    state.bestRally = packet.bestRally || 0;
    state.rallyHeat = packet.rallyHeat || 0;
    state.assist = packet.assist;
    state.message = packet.message;
    state.messageTimer = packet.messageTimer;
    state.pendingServer = packet.pendingServer;
    state.targetScore = packet.targetScore;
    state.playStyle = packet.playStyle;
    applyPlayerSnapshot(left, packet.left, snap ? 1 : onlineTuning.remotePlayerBlend);
    applyPlayerSnapshot(right, packet.right, snap ? 1 : onlineTuning.localPlayerBlend);
    applyBirdSnapshot(packet.bird, snap ? 1 : onlineTuning.birdBlend);
    const scoreChanged = packet.score.left !== online.lastScoreLeft || packet.score.right !== online.lastScoreRight;
    const winnerChanged = packet.winner !== online.lastWinner;
    if (
      now - online.lastHudUpdate > onlineTuning.hudInterval ||
      winnerChanged ||
      scoreChanged ||
      state.paused
    ) {
      online.lastHudUpdate = now;
      updateHud();
    }
    rememberSnapshotForEvents(packet);
    if (state.running) {
      startScreen.classList.add("hidden");
      gameStage.classList.remove("hidden");
      overlay.classList.toggle("hidden", !state.paused);
    }
    if (state.winner) {
      overlayText.textContent = `${state.winner === "left" ? "蓝队" : "红队"}获胜，等待房主再开一局。`;
      overlayActionButton.textContent = "等待房主";
      overlay.classList.remove("hidden");
    }
  }

  function togglePause() {
    if (!state.running || isOnlineGuest()) return;
    state.paused = !state.paused;
    pauseButton.textContent = state.paused ? "继续" : "暂停";
    overlayText.textContent = state.paused ? "比赛暂停，按 P 或点击继续。" : matchCopy();
    overlayActionButton.textContent = state.paused ? "继续" : "再来一局";
    overlay.classList.toggle("hidden", !state.paused);
    sendOnlineSnapshot(true);
  }

  function initAudio() {
    if (state.audioReady) {
      if (state.audio?.state === "suspended") state.audio.resume();
      return;
    }
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    state.audio = new AudioContext();
    state.audioReady = true;
    if (state.audio.state === "suspended") state.audio.resume();
  }

  function primeAudio() {
    if (!state.muted) initAudio();
  }

  function blip(freq, duration, gain = 0.035) {
    if (state.muted) return;
    if (!state.audioReady || !state.audio) return;
    const now = state.audio.currentTime;
    const osc = state.audio.createOscillator();
    const amp = state.audio.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(freq, now);
    amp.gain.setValueAtTime(gain, now);
    amp.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(amp);
    amp.connect(state.audio.destination);
    osc.start(now);
    osc.stop(now + duration);
  }

  function axisFor(player) {
    const keySet = keySetFor(player.side);
    if (player.side === "left") {
      return Number(keySet.has("d")) - Number(keySet.has("a"));
    }
    if (!controlledByAi(player)) {
      return Number(keyHeld(player.side, "ArrowRight")) - Number(keyHeld(player.side, "ArrowLeft"));
    }
    return aiMoveAxis(player) * difficulty[state.difficulty].aiSpeed;
  }

  function aiMoveAxis(player) {
    if (!bird.served && bird.server === "right") return player.x > 720 ? -1 : 0;
    const ideal = clamp(player.aiTargetX, netX + 72, W - 112);
    const distance = ideal - player.x;
    if (Math.abs(distance) < 18) return 0;
    return Math.sign(distance);
  }

  function updateAiIntent(player, dt) {
    if (!controlledByAi(player)) return;
    const profile = difficulty[state.difficulty];
    player.aiThink -= dt;
    if (player.aiThink > 0) return;

    if (!bird.served && bird.server === "right") {
      const roll = Math.random();
      if (state.difficulty === "hard" && roll < 0.32) {
        player.aiShot = "drop";
        player.aiPlan = "serve-short";
      } else if (state.difficulty !== "easy" && roll > 0.76) {
        player.aiShot = "smash";
        player.aiPlan = "serve-fast";
      } else {
        player.aiShot = "clear";
        player.aiPlan = "serve-long";
      }
      player.aiThink = 0.28;
      return;
    }

    const landingX = predictLandingX();
    const missWave = Math.sin(performance.now() / 530) * profile.aiError;
    const panic = bird.x > netX && bird.y > ground - 92 ? profile.aiError * 0.35 : 0;
    const netBias = bird.x > netX && bird.x < netX + 112 ? -34 : 0;
    player.aiTargetX = clamp(landingX + missWave + panic + netBias, netX + 72, W - 112);

    const distance = Math.abs(bird.x - player.x);
    const canAttack = bird.x > netX && bird.y < 268 && distance < 92;
    const canDrop = bird.x > netX && bird.y < 352 && player.x < netX + 205;
    const playerTooDeep = left.x < netX - 235;
    const playerTooClose = left.x > netX - 145;
    const underPressure = bird.x > netX && bird.y > ground - 120;
    const longRally = state.rallyHits >= 7;
    const roll = Math.random();
    if (underPressure) {
      player.aiShot = state.difficulty === "easy" && roll < 0.42 ? "drive" : "clear";
      player.aiPlan = "escape";
    } else if (canAttack && state.difficulty !== "easy" && roll > (state.difficulty === "hard" ? 0.18 : 0.52)) {
      player.aiShot = "smash";
      player.aiPlan = "attack";
    } else if (canDrop && (playerTooDeep || longRally) && roll < (state.difficulty === "hard" ? 0.52 : 0.28)) {
      player.aiShot = "drop";
      player.aiPlan = "pull-net";
    } else if (playerTooClose && roll < (state.difficulty === "hard" ? 0.58 : 0.32)) {
      player.aiShot = "clear";
      player.aiPlan = "push-back";
    } else {
      player.aiShot = landingX > W - 205 ? "clear" : "drive";
      player.aiPlan = "neutral";
    }
    player.aiThink = profile.aiReact + (state.difficulty === "easy" ? 0.16 : state.difficulty === "normal" ? 0.08 : 0.035);
  }

  function wantsJump(player) {
    if (player.side === "left") return keyBuffered(player.side, "w");
    if (!controlledByAi(player)) return keyBuffered(player.side, "ArrowUp");
    const profile = difficulty[state.difficulty];
    return (
      bird.x > netX &&
      bird.y < 245 + profile.aiError * 0.25 &&
      Math.abs(bird.x - player.x) < 88 &&
      player.onGround
    );
  }

  function wantsSwing(player) {
    if (player.side === "left") return keyBuffered(player.side, "j");
    if (!controlledByAi(player)) return keyBuffered(player.side, "1");
    if (!bird.served && bird.server === "right") return state.serveDelay <= 0;
    return (
      bird.x > netX &&
      distanceToRacket(player) < 70 &&
      bird.y < ground - 28 &&
      (player.aiShot !== "smash" || bird.y > 232)
    );
  }

  function wantsSmash(player) {
    if (player.side === "left") {
      return keyBuffered(player.side, "k") && (!player.onGround || (!bird.served && bird.server === player.side));
    }
    if (!controlledByAi(player)) {
      return keyBuffered(player.side, "2") && (!player.onGround || (!bird.served && bird.server === player.side));
    }
    if (!bird.served && bird.server === "right") {
      if (state.difficulty === "easy") return false;
      return state.serveDelay <= 0 && player.aiShot === "smash";
    }
    return player.aiShot === "smash" && bird.x > netX && bird.y < 280 && distanceToRacket(player) < 78;
  }

  function wantsScoop(player) {
    if (!bird.served || !player.onGround || controlledByAi(player)) return false;
    if (player.side === "left") return keyBuffered(player.side, "k");
    return keyBuffered(player.side, "2");
  }

  function updatePlayer(player, dt) {
    const axis = axisFor(player);
    const [minX, maxX] = sideBounds(player.side);
    const recovering = player.recovery > 0;
    const maxSpeed = (player.onGround ? 360 : 270) * (recovering ? 0.62 : 1);
    const accel = (player.onGround ? 2600 : 1180) * (recovering ? 0.55 : 1);
    const friction = player.onGround ? 0.78 : 0.96;

    player.vx += axis * accel * dt;
    if (axis === 0) player.vx *= Math.pow(friction, dt * 60);
    player.vx = clamp(player.vx, -maxSpeed, maxSpeed);
    player.x = clamp(player.x + player.vx * dt, minX, maxX);

    if (axis !== 0) player.facing = axis;
    else player.facing = player.side === "left" ? 1 : -1;

    if (wantsJump(player) && player.onGround) {
      player.vy = -655;
      player.onGround = false;
      burst(player.x, ground + 4, "rgba(220, 238, 224, 0.72)", 7, "dust");
    }

    player.vy += 1850 * dt;
    player.y += player.vy * dt;
    if (player.y >= ground) {
      if (!player.onGround && player.vy > 240) {
        burst(player.x, ground + 4, "rgba(220, 238, 224, 0.64)", 8, "dust");
      }
      player.y = ground;
      player.vy = 0;
      player.onGround = true;
    }

    if (wantsSwing(player)) player.swing = 0.22;
    if (wantsSmash(player)) {
      player.swing = 0.26;
      player.smash = 0.2;
    } else if (wantsScoop(player)) {
      player.swing = 0.26;
      player.scoop = 0.26;
    }

    player.swing = Math.max(0, player.swing - dt);
    player.smash = Math.max(0, player.smash - dt);
    player.scoop = Math.max(0, player.scoop - dt);
    player.recovery = Math.max(0, player.recovery - dt);
    player.charge = player.smash > 0 ? 1 : Math.max(0, player.charge - dt * 5);
    player.foot += Math.abs(player.vx) * dt * 0.03;
  }

  function racketPoint(player) {
    const reach = player.swing > 0 ? 59 : 46;
    const lift = player.swing > 0 ? 70 : 52;
    const arc = Math.sin((player.swing / 0.26) * Math.PI);
    return {
      x: player.x + player.facing * (reach + arc * 20),
      y: player.y - lift - arc * 34,
    };
  }

  function distanceToRacket(player) {
    const r = racketPoint(player);
    return Math.hypot(bird.x - r.x, bird.y - r.y);
  }

  function swingQuality(player, dist) {
    const progress = clamp(player.swing / 0.26, 0, 1);
    const timing = 1 - Math.abs(progress - shotTuning.perfectWindow) / shotTuning.perfectWindow;
    const reach = 1 - dist / shotTuning.hitWindow;
    return clamp(timing * 0.72 + reach * 0.28, 0, 1);
  }

  function shotContact(player) {
    const racket = racketPoint(player);
    return {
      front: clamp(((bird.x - player.x) * player.facing - 42) / 54, -1, 1),
      height: clamp((racket.y - bird.y) / 64, -1, 1),
    };
  }

  function opponentTargetX(player, shotType, quality, contact) {
    const attackingLeft = player.side === "left";
    const nearNet = attackingLeft ? netX + 52 : netX - 52;
    const farCorner = attackingLeft ? W - 118 : 118;
    const midCourt = attackingLeft ? W - 235 : 235;
    const spread = (1 - quality) * 72 + Math.random() * 36;
    if (shotType === "drop") return nearNet + player.facing * (18 + spread * 0.22);
    if (shotType === "smash") return midCourt + player.facing * (contact.front * 56 + spread * 0.34);
    if (shotType === "scoop") return farCorner - player.facing * (spread * 0.42);
    if (shotType === "drive") return midCourt + player.facing * (contact.front * 42 + spread);
    return farCorner - player.facing * spread;
  }

  function wantsDropShot(player) {
    if (player.side === "left") return keyHeld(player.side, "s") || keyBuffered(player.side, "s");
    if (!controlledByAi(player)) return keyHeld(player.side, "ArrowDown") || keyBuffered(player.side, "ArrowDown");
    return player.aiShot === "drop";
  }

  function registerRallyHit(player, quality, shotType) {
    state.rallyHits += 1;
    state.bestRally = Math.max(state.bestRally, state.rallyHits);
    state.rallyHeat = Math.min(1, state.rallyHeat + 0.09 + quality * 0.05);

    const milestone = state.rallyHits === 5 || state.rallyHits === 9 || state.rallyHits === 14;
    if (!milestone) return false;

    const label = state.rallyHits >= 14 ? "超长拉锯!" : state.rallyHits >= 9 ? "精彩多拍!" : "进入相持";
    state.message = shotType === "smash" && quality > 0.72 ? "强攻续上!" : label;
    state.messageTimer = state.rallyHits >= 14 ? 0.76 : 0.58;
    state.shake = Math.max(state.shake, state.rallyHits >= 14 ? 7 : 4);
    burst(bird.x, bird.y, player.color, state.rallyHits >= 14 ? 14 : 9, "streak", player.facing);
    blip(state.rallyHits >= 14 ? 680 : 610, 0.055, 0.024);
    return true;
  }

  function serve(player) {
    if (bird.served || bird.server !== player.side) return;
    const dropServe = wantsDropShot(player);
    const power = player.smash > 0 ? 1.12 : dropServe ? 0.66 : 0.92;
    const fastServe = player.smash > 0 && !dropServe;
    bird.served = true;
    bird.lastTouched = player.side;
    bird.x = player.x + player.facing * 58;
    bird.y = player.y - (dropServe ? 72 : 96);
    bird.vx = player.facing * (dropServe ? 300 : fastServe ? 520 : 500) * power;
    bird.vy = dropServe ? -235 : fastServe ? -430 : -620 * power;
    bird.spin = player.facing * (dropServe ? 10 : fastServe ? 12 : 7);
    state.shake = dropServe ? 3 : fastServe ? 5 : 4;
    state.message = dropServe ? "偷发网前" : fastServe ? "快速长发" : "高远发球";
    state.messageTimer = 0.42;
    burst(bird.x, bird.y, dropServe ? "#d9fff0" : "#f7f7ef", dropServe ? 6 : 7);
    blip(dropServe ? 420 : fastServe ? 300 : 360, 0.05, 0.025);
  }

  function hitBird(player) {
    const dist = distanceToRacket(player);
    const sameSide = player.side === "left" ? bird.x < netX + 15 : bird.x > netX - 15;
    if (dist > shotTuning.hitWindow || !sameSide || player.swing <= 0 || player.lastHit > 0) return;

    if (!bird.served) {
      serve(player);
      player.lastHit = 0.2;
      return;
    }

    const quality = swingQuality(player, dist);
    const contact = shotContact(player);
    const highContact = bird.y < ground - 172;
    const risingSwing = player.swing > 0.08;
    const wantsAttack = player.smash > 0 || (!player.onGround && highContact);
    const smash = wantsAttack && highContact && risingSwing && quality > 0.38;
    const scoop = player.scoop > 0 && player.onGround && !smash;
    const dropShot = wantsDropShot(player) && !smash && !scoop;
    const drive = !dropShot && !smash && !scoop && (wantsAttack || contact.front > 0.42) && quality > 0.46;
    const shotType = dropShot ? "drop" : smash ? "smash" : scoop ? "scoop" : drive ? "drive" : "clear";
    const targetX = opponentTargetX(player, shotType, quality, contact);
    const dx = targetX - bird.x;
    const heatBonus = state.rallyHeat * 0.08;
    const lift = dropShot
      ? 96 + (1 - quality) * 56
      : scoop
        ? 645 + quality * 95 + Math.max(0, -contact.height) * 72
        : drive
          ? 292 + quality * 32
          : 515 + contact.height * 80;
    const pace =
      smash
        ? 1.5 + quality * 0.3 + heatBonus
        : dropShot
          ? 0.44 + quality * 0.13
          : scoop
            ? 0.88 + quality * 0.14
            : drive
              ? 1.3 + quality * 0.12 + heatBonus * 0.65
              : 1.08 + quality * 0.24;
    const horizontal = clamp(dx * pace + contact.front * (smash ? 130 : scoop ? 44 : 72), -820, 820);

    bird.vx = horizontal;
    bird.vy = smash ? 160 + quality * 165 + Math.max(0, contact.height) * 52 : -lift + player.vy * 0.1;
    if (dropShot && quality < 0.32 && bird.y > shotTuning.netRiskY) {
      bird.vx *= 0.48;
      bird.vy = -38;
    }
    bird.x += player.facing * 4;
    bird.lastTouched = player.side;
    bird.spin = player.facing * (smash ? 18 + quality * 6 : dropShot ? 7 : scoop ? 8 + quality * 2 : 10 + quality * 4);
    player.lastHit = smash ? 0.28 : scoop ? 0.22 : 0.2;
    if (smash) player.recovery = shotTuning.smashRecovery + (1 - quality) * 0.08;
    const perfect = quality > 0.78;
    state.shake = smash ? 7 + quality * 4 : scoop ? 4 : perfect ? 5 : 3;
    state.hitStop = smash ? 0.045 + quality * 0.025 : perfect ? 0.035 : 0;
    const milestone = registerRallyHit(player, quality, shotType);
    if (!milestone) {
      state.message = smash
        ? perfect
          ? "完美扣杀!"
          : "扣杀!"
        : scoop
          ? perfect
            ? "高挑救球"
            : "捞球"
          : dropShot
            ? perfect
              ? "贴网小球"
              : "网前小球"
            : perfect
              ? "甜点击球"
              : "回击";
      state.messageTimer = smash || perfect ? 0.48 : state.rallyHeat > 0.6 ? 0.38 : 0.3;
    }
    burst(bird.x, bird.y, smash || perfect ? "#f8d75a" : scoop ? "#d9fff0" : "#f7f7ef", smash ? 13 : perfect ? 11 : 8);
    if (smash || perfect) burst(bird.x, bird.y, "rgba(248, 215, 90, 0.88)", smash ? 9 : 5, "streak", player.facing);
    blip(smash ? 180 : scoop ? 360 : perfect ? 520 : 440, smash ? 0.09 : 0.045, smash ? 0.045 : perfect ? 0.034 : 0.026);
  }

  function burst(x, y, color, count, type = "spark", direction = 0) {
    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = type === "dust" ? 24 + Math.random() * 66 : 60 + Math.random() * 160;
      state.particles.push({
        x,
        y,
        vx:
          type === "streak"
            ? -direction * (180 + Math.random() * 240)
            : Math.cos(angle) * speed,
        vy:
          type === "streak"
            ? -36 + Math.random() * 72
            : type === "dust"
              ? -Math.random() * speed * 0.5
              : Math.sin(angle) * speed,
        life: type === "streak" ? 0.18 + Math.random() * 0.12 : 0.28 + Math.random() * 0.22,
        color,
        type,
        size: type === "dust" ? 2 + Math.random() * 5 : 2 + Math.random() * 4,
      });
    }
  }

  function updateBird(dt) {
    if (!bird.served) {
      const server = bird.server === "left" ? left : right;
      bird.x = server.x + server.facing * 58;
      bird.y = server.y - 92 + Math.sin(performance.now() / 190) * 4;
      bird.angle += dt * 2;
      return;
    }

    bird.trail.unshift({ x: bird.x, y: bird.y });
    bird.trail = cleanTrail(bird.trail);

    const speed = Math.hypot(bird.vx, bird.vy);
    const drag = 1 - clamp(0.58 + speed / 2400, 0.58, 0.86) * dt;
    const style = playStyles[state.playStyle];
    bird.vx *= drag;
    bird.vy *= drag;
    if (style.wind) {
      bird.vx += Math.sin(performance.now() / 420) * style.wind * dt;
    }
    bird.vy += 865 * dt;
    bird.x += bird.vx * dt;
    bird.y += bird.vy * dt;
    bird.angle += bird.spin * dt;
    bird.spin *= Math.pow(0.95, dt * 60);

    if (bird.x - bird.r < 42) {
      bird.x = 42 + bird.r;
      bird.vx = Math.abs(bird.vx) * style.wallBounce;
      if (state.playStyle === "fun") burst(bird.x, bird.y, "#f8d75a", 5);
    }
    if (bird.x + bird.r > W - 42) {
      bird.x = W - 42 - bird.r;
      bird.vx = -Math.abs(bird.vx) * style.wallBounce;
      if (state.playStyle === "fun") burst(bird.x, bird.y, "#f8d75a", 5);
    }

    const crossingNet = Math.abs(bird.x - netX) < 12 && bird.y + bird.r > netTop;
    if (crossingNet && bird.y < ground) {
      bird.x = bird.x < netX ? netX - 13 : netX + 13;
      bird.vx *= style.netBounce;
      bird.vy = Math.min(bird.vy, -130);
      state.shake = 5;
      burst(bird.x, bird.y, "#ffffff", 5);
      blip(130, 0.08, 0.026);
    }

    if (bird.y + bird.r >= ground + 2) {
      const pointSide = bird.x < netX ? "right" : "left";
      burst(bird.x, ground + 3, "rgba(220, 238, 224, 0.7)", 10, "dust");
      awardPoint(pointSide);
    }
  }

  function awardPoint(side) {
    state.score[side] += 1;
    state.serveSide = side;
    updateHud();
    state.message = `${side === "left" ? "蓝队" : "红队"}得分`;
    state.messageTimer = 0.85;
    state.pendingServer = side;
    blip(side === "left" ? 560 : 260, 0.12, 0.032);

    if (state.score[side] >= state.targetScore && Math.abs(state.score.left - state.score.right) >= 2) {
      state.running = false;
      state.winner = side;
      overlayText.textContent = `${side === "left" ? "蓝队" : "红队"}获胜，按 Enter 或点击按钮再来一局。`;
      overlayActionButton.textContent = "再来一局";
      overlay.classList.remove("hidden");
      for (let i = 0; i < 8; i += 1) {
        const x = side === "left" ? 220 + Math.random() * 200 : 540 + Math.random() * 200;
        const y = 135 + Math.random() * 125;
        burst(x, y, i % 2 ? "#f8d75a" : side === "left" ? "#35b8ff" : "#ff5f69", 18);
      }
      sendOnlineSnapshot(true);
      return;
    }

    if (state.score[side] >= state.targetScore - 1) {
      state.message = `${side === "left" ? "蓝队" : "红队"}赛点`;
      state.messageTimer = 1.15;
    }
    state.rallyPause = 1.15;
    updateHud();
    sendOnlineSnapshot(true);
  }

  function predictLandingX() {
    let x = bird.x;
    let y = bird.y;
    let vx = bird.vx;
    let vy = bird.vy;
    for (let i = 0; i < 160; i += 1) {
      vx *= 0.992;
      vy = vy * 0.992 + 865 / 60;
      x += vx / 60;
      y += vy / 60;
      if (y >= ground) return x;
    }
    return x;
  }

  function update(dt) {
    updateParticles(dt);
    updateInputBuffer(dt);
    if (isOnlineGuest()) {
      updateOnlineGuestPrediction(dt);
      sendOnlineInput();
      return;
    }
    if (!state.running) {
      if (!state.winner) updateDemo(dt);
      return;
    }
    if (state.paused) return;
    if (state.rallyPause > 0) {
      state.rallyPause -= dt;
      state.messageTimer = Math.max(0, state.messageTimer - dt);
      if (state.rallyPause <= 0 && state.pendingServer) {
        const server = state.pendingServer;
        state.pendingServer = null;
        state.messageTimer = 0;
        resetRally(server);
      }
      return;
    }
    if (state.readyTimer > 0) {
      state.readyTimer = Math.max(0, state.readyTimer - dt);
      state.messageTimer = Math.max(0, state.messageTimer - dt);
      return;
    }
    state.serveDelay = Math.max(0, state.serveDelay - dt);
    state.messageTimer = Math.max(0, state.messageTimer - dt);
    if (state.hitStop > 0) {
      state.hitStop = Math.max(0, state.hitStop - dt);
      state.shake = Math.max(0, state.shake - dt * 10);
      return;
    }

    updateAiIntent(right, dt);
    updatePlayer(left, dt);
    updatePlayer(right, dt);
    left.lastHit = Math.max(0, left.lastHit - dt);
    right.lastHit = Math.max(0, right.lastHit - dt);

    hitBird(left);
    hitBird(right);
    updateBird(dt);
    state.shake = Math.max(0, state.shake - dt * 18);
    sendOnlineSnapshot();
  }

  function updateOnlineGuestPrediction(dt) {
    if (!state.running || state.paused || state.winner) return;
    if (state.rallyPause > 0) {
      state.rallyPause = Math.max(0, state.rallyPause - dt);
      state.messageTimer = Math.max(0, state.messageTimer - dt);
      return;
    }
    if (state.readyTimer > 0) {
      state.readyTimer = Math.max(0, state.readyTimer - dt);
      state.messageTimer = Math.max(0, state.messageTimer - dt);
      return;
    }

    state.serveDelay = Math.max(0, state.serveDelay - dt);
    state.messageTimer = Math.max(0, state.messageTimer - dt);
    if (state.hitStop > 0) {
      state.hitStop = Math.max(0, state.hitStop - dt);
      state.shake = Math.max(0, state.shake - dt * 10);
      return;
    }

    extrapolateRemotePlayer(left, dt);
    updateGuestLocalPlayer(right, dt);
    right.lastHit = Math.max(0, right.lastHit - dt);
    hitBird(right);
    updateBirdPreview(dt);
    state.shake = Math.max(0, state.shake - dt * 18);
  }

  function extrapolateRemotePlayer(player, dt) {
    if (performance.now() - online.lastSnapshotReceived > 140) return;
    const [minX, maxX] = sideBounds(player.side);
    player.x = clamp(player.x + player.vx * dt, minX, maxX);
    if (!player.onGround || Math.abs(player.vy) > 1) {
      player.vy += 1850 * dt;
      player.y += player.vy * dt;
      if (player.y >= ground) {
        player.y = ground;
        player.vy = 0;
        player.onGround = true;
      }
    }
    player.swing = Math.max(0, player.swing - dt);
    player.smash = Math.max(0, player.smash - dt);
    player.scoop = Math.max(0, player.scoop - dt);
    player.recovery = Math.max(0, player.recovery - dt);
    player.charge = player.smash > 0 ? player.charge : Math.max(0, player.charge - dt * 5);
    player.lastHit = Math.max(0, player.lastHit - dt);
    player.foot += Math.abs(player.vx) * dt * 0.03;
  }

  function updateGuestLocalPlayer(player, dt) {
    const [minX, maxX] = sideBounds(player.side);
    const axis = Number(keys.has("ArrowRight") || keys.has("d")) - Number(keys.has("ArrowLeft") || keys.has("a"));
    const recovering = player.recovery > 0;
    const maxSpeed = (player.onGround ? 360 : 270) * (recovering ? 0.62 : 1);
    const accel = (player.onGround ? 2600 : 1180) * (recovering ? 0.55 : 1);
    const friction = player.onGround ? 0.78 : 0.96;

    player.vx += axis * accel * dt;
    if (axis === 0) player.vx *= Math.pow(friction, dt * 60);
    player.vx = clamp(player.vx, -maxSpeed, maxSpeed);
    player.x = clamp(player.x + player.vx * dt, minX, maxX);
    player.facing = axis || -1;

    if ((buffered("ArrowUp") || buffered("w") || buffered(" ")) && player.onGround) {
      player.vy = -655;
      player.onGround = false;
      burst(player.x, ground + 4, "rgba(220, 238, 224, 0.72)", 7, "dust");
    }

    player.vy += 1850 * dt;
    player.y += player.vy * dt;
    if (player.y >= ground) {
      if (!player.onGround && player.vy > 240) burst(player.x, ground + 4, "rgba(220, 238, 224, 0.64)", 8, "dust");
      player.y = ground;
      player.vy = 0;
      player.onGround = true;
    }

    if (buffered("1") || buffered("j")) player.swing = 0.22;
    if (buffered("2") || buffered("k")) {
      player.swing = 0.26;
      if (!player.onGround || (!bird.served && bird.server === player.side)) player.smash = 0.2;
      else player.scoop = 0.26;
    }

    player.swing = Math.max(0, player.swing - dt);
    player.smash = Math.max(0, player.smash - dt);
    player.scoop = Math.max(0, player.scoop - dt);
    player.recovery = Math.max(0, player.recovery - dt);
    player.charge = player.smash > 0 ? 1 : Math.max(0, player.charge - dt * 5);
    player.foot += Math.abs(player.vx) * dt * 0.03;
  }

  function updateBirdPreview(dt) {
    if (!bird.served) {
      const server = bird.server === "left" ? left : right;
      bird.x = server.x + server.facing * 58;
      bird.y = server.y - 92 + Math.sin(performance.now() / 190) * 4;
      bird.angle += dt * 2;
      return;
    }

    bird.trail.unshift({ x: bird.x, y: bird.y });
    bird.trail = cleanTrail(bird.trail);

    const speed = Math.hypot(bird.vx, bird.vy);
    const drag = 1 - clamp(0.58 + speed / 2400, 0.58, 0.86) * dt;
    const style = playStyles[state.playStyle];
    bird.vx *= drag;
    bird.vy *= drag;
    if (style.wind) bird.vx += Math.sin(performance.now() / 420) * style.wind * dt;
    bird.vy += 865 * dt;
    bird.x += bird.vx * dt;
    bird.y += bird.vy * dt;
    bird.angle += bird.spin * dt;
    bird.spin *= Math.pow(0.95, dt * 60);

    if (bird.x - bird.r < 42) {
      bird.x = 42 + bird.r;
      bird.vx = Math.abs(bird.vx) * style.wallBounce;
    }
    if (bird.x + bird.r > W - 42) {
      bird.x = W - 42 - bird.r;
      bird.vx = -Math.abs(bird.vx) * style.wallBounce;
    }
    if (bird.y + bird.r > ground + 6) {
      bird.y = ground + 6 - bird.r;
      bird.vx *= 0.92;
      bird.vy = 0;
    }
  }

  function updateDemo(dt) {
    state.demoTime += dt;
    left.x = 184 + Math.sin(state.demoTime * 1.2) * 34;
    right.x = 776 + Math.sin(state.demoTime * 1.1 + 2.4) * 34;
    left.foot += dt * 2.8;
    right.foot += dt * 2.8;
    left.facing = 1;
    right.facing = -1;
    left.swing = Math.max(0, 0.14 - Math.abs((state.demoTime % 2.4) - 0.24));
    right.swing = Math.max(0, 0.14 - Math.abs(((state.demoTime + 1.2) % 2.4) - 0.24));
    bird.served = true;
    bird.x = netX + Math.sin(state.demoTime * 2.6) * 285;
    bird.y = 236 + Math.sin(state.demoTime * 5.2 + 0.6) * 72;
    bird.vy = Math.cos(state.demoTime * 5.2 + 0.6) * 360;
    bird.angle += dt * 8;
    bird.trail.unshift({ x: bird.x, y: bird.y });
    bird.trail = cleanTrail(bird.trail);
  }

  function updateParticles(dt) {
    state.particles.forEach((p) => {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += (p.type === "streak" ? 80 : 420) * dt;
      p.vx *= Math.pow(p.type === "dust" ? 0.92 : 0.97, dt * 60);
      p.life -= dt;
    });
    state.particles = state.particles.filter((p) => p.life > 0);
  }

  function drawShadow(x, y, width, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "#06100d";
    ctx.beginPath();
    ctx.ellipse(x, y, width, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function roundedRect(x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function strokeCourtLine(path, width = 4) {
    ctx.save();
    ctx.lineCap = "square";
    ctx.strokeStyle = "rgba(3, 17, 15, 0.34)";
    ctx.lineWidth = width + 3;
    path();
    ctx.stroke();
    ctx.strokeStyle = "rgba(234, 244, 222, 0.78)";
    ctx.lineWidth = width;
    path();
    ctx.stroke();
    ctx.restore();
  }

  function drawImageCover(image, x, y, width, height, focusY = 0.5) {
    const sourceRatio = image.naturalWidth / image.naturalHeight;
    const targetRatio = width / height;
    let sx = 0;
    let sy = 0;
    let sw = image.naturalWidth;
    let sh = image.naturalHeight;

    if (sourceRatio > targetRatio) {
      sw = image.naturalHeight * targetRatio;
      sx = (image.naturalWidth - sw) / 2;
    } else {
      sh = image.naturalWidth / targetRatio;
      sy = clamp((image.naturalHeight - sh) * focusY, 0, image.naturalHeight - sh);
    }

    ctx.drawImage(image, sx, sy, sw, sh, x, y, width, height);
  }

  function drawCourt() {
    const courtWidth = court.right - court.left;
    const courtHeight = ground - court.top;
    if (pixelArt.court.loaded) {
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.filter = "saturate(0.72) contrast(0.88) brightness(0.82) blur(0.8px)";
      drawImageCover(pixelArt.court.image, 0, 0, W, H, 0.2);
      ctx.filter = "none";
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = "#06141b";
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 0.16;
      ctx.fillStyle = "#d5f4ef";
      ctx.fillRect(0, 0, W, court.top - 8);
      ctx.globalAlpha = 0.12;
      ctx.fillStyle = "#061a20";
      ctx.fillRect(0, court.top - 8, W, H - court.top + 8);
      ctx.restore();

      ctx.save();
      ctx.globalAlpha = 0.68;
      strokeCourtLine(() => ctx.strokeRect(court.left, court.top, courtWidth, courtHeight), 3.5);
      strokeCourtLine(() => {
        ctx.beginPath();
        ctx.moveTo(netX, court.top);
        ctx.lineTo(netX, ground);
        ctx.moveTo(court.left, court.serviceY);
        ctx.lineTo(court.right, court.serviceY);
        ctx.moveTo(court.nearServiceLeft, court.top);
        ctx.lineTo(court.nearServiceLeft, ground);
        ctx.moveTo(court.nearServiceRight, court.top);
        ctx.lineTo(court.nearServiceRight, ground);
      }, 3.5);
      ctx.restore();

      ctx.save();
      ctx.globalAlpha = 0.58;
      ctx.strokeStyle = "rgba(5, 18, 16, 0.44)";
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(netX - 10, netTop - 4);
      ctx.lineTo(netX - 10, ground);
      ctx.moveTo(netX + 10, netTop - 4);
      ctx.lineTo(netX + 10, ground);
      ctx.stroke();
      ctx.strokeStyle = "rgba(236, 247, 230, 0.68)";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(netX - 6, netTop);
      ctx.lineTo(netX - 6, ground);
      ctx.moveTo(netX + 6, netTop);
      ctx.lineTo(netX + 6, ground);
      ctx.stroke();
      ctx.strokeStyle = "rgba(236, 247, 230, 0.22)";
      ctx.lineWidth = 1;
      for (let y = netTop + 12; y < ground; y += 18) {
        ctx.beginPath();
        ctx.moveTo(netX - 16, y);
        ctx.lineTo(netX + 16, y + 8);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(netX + 16, y);
        ctx.lineTo(netX - 16, y + 8);
        ctx.stroke();
      }
      ctx.restore();
      return;
    }

    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, "#9fd8f2");
    sky.addColorStop(0.34, "#d9f1f7");
    sky.addColorStop(0.49, "#b5d5d2");
    sky.addColorStop(0.5, "#2d8a70");
    sky.addColorStop(1, "#12604f");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = "#ffffff";
    for (let x = 76; x < W; x += 128) {
      ctx.fillRect(x, 78, 44, 8);
      ctx.fillRect(x + 24, 100, 62, 7);
    }
    ctx.restore();

    const courtBase = ctx.createLinearGradient(0, court.apronTop, 0, ground + 36);
    courtBase.addColorStop(0, "#195344");
    courtBase.addColorStop(0.5, "#27775f");
    courtBase.addColorStop(1, "#154738");
    ctx.fillStyle = "rgba(5, 24, 20, 0.24)";
    ctx.fillRect(court.left - 20, court.apronTop, courtWidth + 40, ground - court.apronTop + 4);
    ctx.fillStyle = courtBase;
    ctx.fillRect(court.left - 14, court.top - 8, courtWidth + 28, ground - court.top + 8);

    const innerCourt = ctx.createLinearGradient(court.left, court.top, court.right, ground);
    innerCourt.addColorStop(0, "#4ba079");
    innerCourt.addColorStop(0.48, "#3d9673");
    innerCourt.addColorStop(0.52, "#55aa80");
    innerCourt.addColorStop(1, "#438b6b");
    ctx.fillStyle = innerCourt;
    ctx.fillRect(court.left, court.top, courtWidth, courtHeight);

    ctx.save();
    ctx.beginPath();
    ctx.rect(court.left, court.top, courtWidth, courtHeight);
    ctx.clip();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.055)";
    ctx.lineWidth = 2;
    for (let x = -120; x < W + 140; x += 46) {
      ctx.beginPath();
      ctx.moveTo(x, ground);
      ctx.lineTo(x + 170, court.top);
      ctx.stroke();
    }
    ctx.restore();

    strokeCourtLine(() => ctx.strokeRect(court.left, court.top, courtWidth, courtHeight), 3.5);
    strokeCourtLine(() => {
      ctx.beginPath();
      ctx.moveTo(netX, court.top);
      ctx.lineTo(netX, ground);
      ctx.moveTo(court.left, court.serviceY);
      ctx.lineTo(court.right, court.serviceY);
      ctx.moveTo(court.nearServiceLeft, court.top);
      ctx.lineTo(court.nearServiceLeft, ground);
      ctx.moveTo(court.nearServiceRight, court.top);
      ctx.lineTo(court.nearServiceRight, ground);
    }, 3.5);

    ctx.save();
    ctx.strokeStyle = "rgba(5, 18, 16, 0.44)";
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(netX - 10, netTop - 4);
    ctx.lineTo(netX - 10, ground);
    ctx.moveTo(netX + 10, netTop - 4);
    ctx.lineTo(netX + 10, ground);
    ctx.stroke();
    ctx.strokeStyle = "rgba(236, 247, 230, 0.68)";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(netX - 6, netTop);
    ctx.lineTo(netX - 6, ground);
    ctx.moveTo(netX + 6, netTop);
    ctx.lineTo(netX + 6, ground);
    ctx.stroke();
    ctx.strokeStyle = "rgba(236, 247, 230, 0.22)";
    ctx.lineWidth = 1;
    for (let y = netTop + 12; y < ground; y += 18) {
      ctx.beginPath();
      ctx.moveTo(netX - 16, y);
      ctx.lineTo(netX + 16, y + 8);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(netX + 16, y);
      ctx.lineTo(netX - 16, y + 8);
      ctx.stroke();
    }
    ctx.restore();

    const apron = ctx.createLinearGradient(0, ground, 0, H);
    apron.addColorStop(0, "rgba(9, 53, 43, 0)");
    apron.addColorStop(1, "rgba(4, 23, 22, 0.46)");
    ctx.fillStyle = apron;
    ctx.fillRect(0, ground, W, H - ground);
  }

  function drawPlayer(player) {
    const headY = player.y - 104;
    const bodyY = player.y - 73;
    const hipY = player.y - 38;
    const gait = Math.sin(player.foot) * 10;
    const racket = racketPoint(player);
    const preparingDrop = wantsDropShot(player) && player.swing <= 0;
    const preparingSmash = (player.smash > 0 || (controlledByAi(player) && player.aiShot === "smash")) && player.swing <= 0.08;
    const preparingScoop = player.scoop > 0 && player.swing <= 0.08;
    const lean = clamp(player.vx / 520, -0.42, 0.42);
    const swingArc = Math.sin((player.swing / 0.26) * Math.PI);
    const headX = player.x + lean * 8;
    const torsoX = player.x + player.facing * (preparingSmash ? 8 : preparingDrop || preparingScoop ? -2 : 4) + lean * 13;
    const hipX = player.x - lean * 8;

    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.shadowColor = "rgba(0, 0, 0, 0.26)";
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 5;
    ctx.strokeStyle = player.color;
    ctx.globalAlpha = 0.42 + player.charge * 0.18;
    ctx.lineWidth = 15;

    ctx.beginPath();
    ctx.arc(headX, headY, 17, 0, Math.PI * 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(headX, headY + 18);
    ctx.lineTo(torsoX, bodyY);
    ctx.lineTo(hipX, hipY);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(torsoX, bodyY + 8);
    ctx.lineTo(racket.x - player.facing * 24, racket.y + 18);
    ctx.lineTo(racket.x, racket.y);
    ctx.moveTo(torsoX - player.facing * 3, bodyY + 10);
    ctx.lineTo(torsoX - player.facing * 35, bodyY + 36);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(hipX, hipY);
    ctx.lineTo(player.x - 22 + gait + lean * 8, player.y - 5);
    ctx.moveTo(hipX, hipY);
    ctx.lineTo(player.x + 24 - gait + lean * 8, player.y - 4);
    ctx.stroke();

    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    ctx.strokeStyle = "#10141c";
    ctx.lineWidth = 9;

    ctx.beginPath();
    ctx.arc(headX, headY, 17, 0, Math.PI * 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(headX, headY + 18);
    ctx.lineTo(torsoX, bodyY);
    ctx.lineTo(hipX, hipY);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(torsoX, bodyY + 8);
    ctx.lineTo(racket.x - player.facing * 24, racket.y + 18);
    ctx.lineTo(racket.x, racket.y);
    ctx.moveTo(torsoX - player.facing * 3, bodyY + 10);
    ctx.lineTo(torsoX - player.facing * 35, bodyY + 36);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(hipX, hipY);
    ctx.lineTo(player.x - 22 + gait + lean * 8, player.y - 5);
    ctx.moveTo(hipX, hipY);
    ctx.lineTo(player.x + 24 - gait + lean * 8, player.y - 4);
    ctx.stroke();

    ctx.strokeStyle = player.color;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(racket.x + player.facing * 8, racket.y - 2, 19, -0.4, Math.PI * 1.55);
    ctx.stroke();

    ctx.strokeStyle = "rgba(255, 255, 255, 0.56)";
    ctx.lineWidth = 1;
    for (let i = -9; i <= 9; i += 9) {
      ctx.beginPath();
      ctx.moveTo(racket.x + player.facing * (3 + i * 0.28), racket.y - 16);
      ctx.lineTo(racket.x + player.facing * (14 + i * 0.28), racket.y + 14);
      ctx.stroke();
    }

    ctx.strokeStyle = player.color;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(headX - 14, headY - 3);
    ctx.lineTo(headX + 14, headY - 3);
    ctx.stroke();

    ctx.fillStyle = player.color;
    ctx.globalAlpha = 0.86;
    ctx.beginPath();
    ctx.arc(player.x - 22 + gait + lean * 8, player.y - 5, 4, 0, Math.PI * 2);
    ctx.arc(player.x + 24 - gait + lean * 8, player.y - 4, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    if (swingArc > 0.05) {
      ctx.strokeStyle = player.color;
      ctx.globalAlpha = 0.16 + swingArc * 0.22;
      ctx.lineWidth = 12;
      ctx.beginPath();
      ctx.arc(
        racket.x - player.facing * 10,
        racket.y + 6,
        35 + swingArc * 10,
        player.facing > 0 ? -1.1 : Math.PI - 2.05,
        player.facing > 0 ? 0.9 : Math.PI + 1.1
      );
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    if (player.smash > 0) {
      ctx.strokeStyle = "rgba(248, 215, 90, 0.9)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(racket.x - player.facing * 38, racket.y - 18);
      ctx.lineTo(racket.x + player.facing * 34, racket.y + 12);
      ctx.stroke();
      drawSmashSprite(racket.x + player.facing * 14, racket.y - 4, player.facing);
    }

    if (player.scoop > 0) {
      ctx.strokeStyle = "rgba(217, 255, 240, 0.88)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(
        racket.x - player.facing * 6,
        racket.y + 10,
        28,
        player.facing > 0 ? 1.82 : Math.PI - 0.48,
        player.facing > 0 ? 0.1 : Math.PI + 1.32,
        true
      );
      ctx.stroke();
    }

    if (preparingSmash || preparingDrop || preparingScoop) {
      ctx.globalAlpha = preparingSmash ? 0.72 : 0.5;
      ctx.strokeStyle = preparingSmash ? "rgba(248, 215, 90, 0.92)" : "rgba(217, 255, 240, 0.82)";
      ctx.lineWidth = preparingSmash ? 3 : 2;
      ctx.beginPath();
      if (preparingSmash) {
        ctx.moveTo(racket.x - player.facing * 20, racket.y - 24);
        ctx.lineTo(racket.x + player.facing * 12, racket.y - 38);
      } else if (preparingScoop) {
        ctx.moveTo(racket.x - player.facing * 22, racket.y + 18);
        ctx.quadraticCurveTo(racket.x + player.facing * 4, racket.y + 34, racket.x + player.facing * 32, racket.y + 4);
      } else {
        ctx.moveTo(racket.x - player.facing * 20, racket.y + 12);
        ctx.lineTo(racket.x + player.facing * 28, racket.y + 16);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    ctx.restore();
  }

  function drawSmashSprite(x, y, facing) {
    if (!pixelArt.smash.loaded) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(facing, 1);
    ctx.rotate(-0.12);
    ctx.globalAlpha = 0.74;
    ctx.globalCompositeOperation = "screen";
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(pixelArt.smash.image, -54, -54, 108, 108);
    ctx.restore();
  }

  function drawBird() {
    ctx.save();
    const shadowScale = clamp((ground - bird.y) / 260, 0.18, 1);
    ctx.globalAlpha = 0.18 * shadowScale;
    ctx.fillStyle = "#07110e";
    ctx.beginPath();
    ctx.ellipse(bird.x, ground + 4, 12 * shadowScale, 4 * shadowScale, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    const speed = Math.hypot(bird.vx, bird.vy);
    const trail = cleanTrail(bird.trail);
    trail.forEach((p, index) => {
      const next = trail[index + 1] || p;
      ctx.globalAlpha = (1 - index / trail.length) * clamp(speed / 720, 0.18, 0.52);
      ctx.strokeStyle = index < 2 ? "#fff7c8" : "#ffffff";
      ctx.lineWidth = Math.max(1, 6 - index * 0.42);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(next.x, next.y);
      ctx.stroke();
    });
    ctx.globalAlpha = 1;
    ctx.translate(bird.x, bird.y);
    ctx.rotate((bird.served ? Math.atan2(bird.vy, bird.vx) : bird.angle) + Math.PI);

    if (pixelArt.shuttle.loaded) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(pixelArt.shuttle.image, -18, -18, 36, 36);
      ctx.restore();
      return;
    }

    ctx.shadowColor = "rgba(255, 255, 255, 0.35)";
    ctx.shadowBlur = 6;
    ctx.fillStyle = "#f7f7ef";
    ctx.beginPath();
    ctx.arc(0, 0, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    const feather = ctx.createLinearGradient(-5, 0, -28, 0);
    feather.addColorStop(0, "#fff2ba");
    feather.addColorStop(1, "#f1d47d");
    ctx.fillStyle = feather;
    ctx.beginPath();
    ctx.moveTo(-7, 5);
    ctx.lineTo(-30, 16);
    ctx.lineTo(-20, 1);
    ctx.lineTo(-30, -14);
    ctx.lineTo(-7, -5);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = "rgba(92, 71, 28, 0.5)";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-9, 3);
    ctx.lineTo(-25, 11);
    ctx.moveTo(-8, 0);
    ctx.lineTo(-26, 0);
    ctx.moveTo(-9, -3);
    ctx.lineTo(-25, -10);
    ctx.stroke();
    ctx.restore();
  }

  function drawLandingMarker() {
    if (!state.assist || !state.running || !bird.served || bird.vy < -120) return;
    const landingX = clamp(predictLandingX(), 64, W - 64);
    ctx.save();
    ctx.globalAlpha = 0.45;
    ctx.strokeStyle = bird.x < netX ? "#ff5f69" : "#35b8ff";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(landingX, ground + 3, 24, 8, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = bird.x < netX ? "#ff5f69" : "#35b8ff";
    ctx.fill();
    ctx.restore();
  }

  function drawParticles() {
    ctx.save();
    state.particles.forEach((p) => {
      ctx.globalAlpha = clamp(p.life * 3, 0, 1);
      ctx.fillStyle = p.color;
      ctx.strokeStyle = p.color;
      if (p.type === "streak") {
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.045, p.y - p.vy * 0.045);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size || 3, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    ctx.restore();
  }

  function drawServeHint() {
    if (bird.served || state.rallyPause > 0 || state.readyTimer > 0 || !state.running) return;
    const label =
      bird.server === "left"
        ? "蓝队发球：J 或 K"
        : state.matchMode === "solo"
          ? `红队发球：${Math.ceil(state.serveDelay + 0.2)}`
          : "红队发球：1 或 2";
    ctx.save();
    ctx.fillStyle = "rgba(8, 13, 22, 0.74)";
    roundedRect(netX - 116, 108, 232, 42, 6);
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.18)";
    ctx.stroke();
    ctx.fillStyle = "#f4f7fb";
    ctx.font = "700 18px system-ui";
    ctx.textAlign = "center";
    ctx.fillText(label, netX, 135);
    ctx.restore();
  }

  function drawFloatingMessage() {
    if (state.messageTimer <= 0) return;
    ctx.save();
    ctx.globalAlpha = clamp(state.messageTimer * 2.2, 0, 1);
    ctx.fillStyle = "rgba(8, 13, 22, 0.76)";
    roundedRect(netX - 82, 154, 164, 36, 6);
    ctx.fill();
    ctx.strokeStyle = "rgba(248, 215, 90, 0.34)";
    ctx.stroke();
    ctx.fillStyle = "#f8d75a";
    ctx.font = "800 18px system-ui";
    ctx.textAlign = "center";
    ctx.fillText(state.message, netX, 178);
    ctx.restore();
  }

  function drawRallyCounter() {
    if (!state.running || !bird.served || state.rallyHits < 3) return;
    ctx.save();
    ctx.globalAlpha = clamp(0.42 + state.rallyHeat * 0.34, 0.42, 0.78);
    ctx.fillStyle = "rgba(8, 13, 22, 0.58)";
    roundedRect(netX - 56, 196, 112, 28, 6);
    ctx.fill();
    ctx.strokeStyle = state.rallyHits >= 9 ? "rgba(248, 215, 90, 0.56)" : "rgba(255, 255, 255, 0.18)";
    ctx.stroke();
    ctx.fillStyle = state.rallyHits >= 9 ? "#f8d75a" : "#d7e4ef";
    ctx.font = "800 14px system-ui";
    ctx.textAlign = "center";
    ctx.fillText(`${state.rallyHits} 拍相持`, netX, 215);
    ctx.restore();
  }

  function drawReadyGo() {
    if (!state.running || state.readyTimer <= 0 || state.rallyPause > 0) return;
    const label = state.readyTimer > 0.26 ? "READY" : "GO";
    const scale = state.readyTimer > 0.26 ? 1 : 1.12;
    ctx.save();
    ctx.translate(netX, 224);
    ctx.scale(scale, scale);
    ctx.fillStyle = "rgba(8, 13, 22, 0.72)";
    roundedRect(-92, -32, 184, 58, 8);
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.18)";
    ctx.stroke();
    ctx.fillStyle = label === "GO" ? "#f8d75a" : "#f4f7fb";
    ctx.font = "900 34px system-ui";
    ctx.textAlign = "center";
    ctx.fillText(label, 0, 8);
    ctx.restore();
  }

  function drawDemoBadge() {
    if (state.running) return;
    ctx.save();
    ctx.fillStyle = "rgba(8, 13, 22, 0.72)";
    roundedRect(netX - 118, 382, 236, 38, 6);
    ctx.fill();
    ctx.strokeStyle = "rgba(248, 215, 90, 0.24)";
    ctx.stroke();
    ctx.fillStyle = "#f8d75a";
    ctx.font = "800 17px system-ui";
    ctx.textAlign = "center";
    ctx.fillText("演示中 - 点击开始挑战", netX, 409);
    ctx.restore();
  }

  function render() {
    ctx.save();
    if (state.shake > 0) {
      ctx.translate((Math.random() - 0.5) * state.shake, (Math.random() - 0.5) * state.shake);
    }
    drawCourt();
    drawShadow(left.x, ground + 6, left.onGround ? 33 : 24, 0.22);
    drawShadow(right.x, ground + 6, right.onGround ? 33 : 24, 0.22);
    drawPlayer(left);
    drawPlayer(right);
    drawLandingMarker();
    drawBird();
    drawParticles();
    drawServeHint();
    drawFloatingMessage();
    drawRallyCounter();
    drawReadyGo();
    drawDemoBadge();
    ctx.restore();
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.033);
    last = now;
    update(dt);
    sendOnlineSnapshot();
    render();
    taps.clear();
    remoteTaps.clear();
    requestAnimationFrame(frame);
  }

  loadSettings();
  applySettingsToUi();
  render();
  requestAnimationFrame(frame);
})();
