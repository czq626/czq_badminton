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
  const joinRoomButton = document.getElementById("joinRoomButton");
  const acceptAnswerButton = document.getElementById("acceptAnswerButton");
  const copySignalButton = document.getElementById("copySignalButton");
  const resetOnlineButton = document.getElementById("resetOnlineButton");
  const localSignal = document.getElementById("localSignal");
  const remoteSignal = document.getElementById("remoteSignal");
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
  const netTop = 270;

  const keys = new Set();
  const taps = new Set();
  const inputBuffer = new Map();
  const remoteKeys = new Set();
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
    supported: "RTCPeerConnection" in window,
    pc: null,
    channel: null,
    role: null,
    connected: false,
    lastSnapshot: 0,
    lastInputSent: 0,
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
    hitWindow: 76,
    netRiskY: netTop + 18,
    smashRecovery: 0.18,
    inputBuffer: 0.16,
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
      charge: 0,
      recovery: 0,
      foot: 0,
      onGround: true,
      lastHit: 0,
      aiThink: 0,
      aiTargetX: x,
      aiShot: "clear",
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
          ? "联机已连接"
          : online.role
            ? "联机配对中"
            : "联机未连接"
        : difficulty[state.difficulty].label;
    statusStrip.textContent = `${rule} | ${serverLabel} | ${onlineLabel} | ${playStyles[state.playStyle].label}`;
    startSummary.textContent = `${modeLabelText()} | ${state.targetScore}分制 | ${playStyles[state.playStyle].label}球路`;
    if (!state.running || state.paused) {
      overlayText.textContent = state.paused ? "比赛暂停，按 P 或点击继续。" : matchCopy();
    }
  }

  function matchCopy() {
    if (state.matchMode === "online") return `联机模式：房主蓝队，对手红队，先到 ${state.targetScore} 分获胜。`;
    return `抢落点、跳扣杀，先到 ${state.targetScore} 分获胜。`;
  }

  function modeLabelText() {
    if (state.matchMode === "online") return "联机模式";
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
      if (["solo", "local", "online"].includes(settings.matchMode)) state.matchMode = settings.matchMode;
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
    updateHud();
  }

  function setMatchMode(matchMode, restart = false) {
    state.matchMode = matchMode;
    state.singlePlayer = matchMode === "solo";
    if (matchMode !== "online" && online.pc) resetOnlineConnection();
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
  }

  window.addEventListener("keydown", (event) => {
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

  startButton.addEventListener("click", () => {
    resetMatch();
  });
  overlayActionButton.addEventListener("click", () => {
    if (state.paused) togglePause();
    else resetMatch();
  });
  resetButton.addEventListener("click", resetMatch);
  pauseButton.addEventListener("click", togglePause);
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
      if (state.running) resetMatch();
    });
  });
  styleButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.playStyle = button.dataset.style;
      styleButtons.forEach((item) => item.classList.toggle("active", item === button));
      saveSettings();
      updateHud();
      if (state.running) resetMatch();
    });
  });
  touchButtons.forEach((button) => {
    const hold = button.dataset.hold;
    const tap = button.dataset.tap;
    let startY = 0;
    const begin = (event) => {
      event.preventDefault();
      startY = event.clientY;
      if (hold) keyDown(hold);
      if (tap) keyDown(tap);
      sendOnlineInput();
    };
    const end = (event) => {
      event.preventDefault();
      if (tap && event.clientY - startY > 22) {
        const dropKey = tap === "j" ? "s" : tap === "1" ? "ArrowDown" : null;
        if (dropKey) keyDown(dropKey);
      }
      if (hold) keyUp(hold);
      if (tap) keyUp(tap);
      sendOnlineInput();
    };
    button.addEventListener("pointerdown", begin);
    button.addEventListener("pointerup", end);
    button.addEventListener("pointercancel", end);
    button.addEventListener("pointerleave", end);
  });

  createRoomButton.addEventListener("click", createOnlineRoom);
  joinRoomButton.addEventListener("click", joinOnlineRoom);
  acceptAnswerButton.addEventListener("click", acceptOnlineAnswer);
  copySignalButton.addEventListener("click", copyLocalSignal);
  resetOnlineButton.addEventListener("click", resetOnlineConnection);

  function setOnlineStatus(text) {
    onlineStatus.textContent = text;
    updateHud();
  }

  function onlineConfig() {
    return { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };
  }

  function makeSignal(description) {
    return btoa(unescape(encodeURIComponent(JSON.stringify(description))));
  }

  function readSignal(value) {
    return JSON.parse(decodeURIComponent(escape(atob(value.trim()))));
  }

  async function waitForIceGathering(pc) {
    if (pc.iceGatheringState === "complete") return;
    await new Promise((resolve) => {
      const done = () => {
        if (pc.iceGatheringState === "complete") {
          pc.removeEventListener("icegatheringstatechange", done);
          resolve();
        }
      };
      pc.addEventListener("icegatheringstatechange", done);
      setTimeout(resolve, 2400);
    });
  }

  function preparePeer(role) {
    if (!online.supported) {
      setOnlineStatus("当前浏览器不支持 WebRTC 数据通道。");
      return null;
    }
    resetOnlineConnection(false);
    online.role = role;
    online.pc = new RTCPeerConnection(onlineConfig());
    online.pc.onconnectionstatechange = () => {
      const status = online.pc.connectionState;
      online.connected = status === "connected";
      if (online.connected) setOnlineStatus(role === "host" ? "已连接 | 你控制蓝队" : "已连接 | 你控制红队");
      else if (["failed", "disconnected", "closed"].includes(status)) setOnlineStatus(`连接状态：${status}`);
    };
    return online.pc;
  }

  function attachOnlineChannel(channel) {
    online.channel = channel;
    channel.onopen = () => {
      online.connected = true;
      setOnlineStatus(online.role === "host" ? "已连接 | 你控制蓝队" : "已连接 | 你控制红队");
      sendOnlineInput(true);
      if (online.role === "host") sendOnlineSnapshot(true);
    };
    channel.onclose = () => {
      online.connected = false;
      setOnlineStatus("连接已断开。");
    };
    channel.onmessage = (event) => {
      const packet = JSON.parse(event.data);
      if (packet.type === "input" && online.role === "host") {
        remoteKeys.clear();
        packet.keys.forEach((code) => remoteKeys.add(code));
      }
      if (packet.type === "snapshot" && online.role === "guest") {
        applyOnlineSnapshot(packet);
      }
      if (packet.type === "start" && online.role === "guest") {
        startScreen.classList.add("hidden");
        gameStage.classList.remove("hidden");
        overlay.classList.add("hidden");
      }
    };
  }

  async function createOnlineRoom() {
    setMatchMode("online", false);
    const pc = preparePeer("host");
    if (!pc) return;
    attachOnlineChannel(pc.createDataChannel("badminton"));
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await waitForIceGathering(pc);
    localSignal.value = makeSignal(pc.localDescription);
    setOnlineStatus("房间已创建 | 把本机码发给对手，再粘贴对手返回码并点完成连接。");
  }

  async function joinOnlineRoom() {
    setMatchMode("online", false);
    const pc = preparePeer("guest");
    if (!pc) return;
    pc.ondatachannel = (event) => attachOnlineChannel(event.channel);
    try {
      await pc.setRemoteDescription(readSignal(remoteSignal.value));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await waitForIceGathering(pc);
      localSignal.value = makeSignal(pc.localDescription);
      setOnlineStatus("已生成对手码 | 发回给房主等待连接。");
    } catch {
      setOnlineStatus("对手码无法识别，请确认完整复制。");
    }
  }

  async function acceptOnlineAnswer() {
    if (!online.pc || online.role !== "host") {
      setOnlineStatus("请先创建房间。");
      return;
    }
    try {
      await online.pc.setRemoteDescription(readSignal(remoteSignal.value));
      setOnlineStatus("正在连接对手...");
    } catch {
      setOnlineStatus("对手码无法识别，请确认完整复制。");
    }
  }

  async function copyLocalSignal() {
    if (!localSignal.value) return;
    try {
      await navigator.clipboard.writeText(localSignal.value);
      setOnlineStatus("本机码已复制。");
    } catch {
      localSignal.select();
      setOnlineStatus("已选中本机码，请手动复制。");
    }
  }

  function resetOnlineConnection(clearSignals = true) {
    if (online.channel) online.channel.close();
    if (online.pc) online.pc.close();
    online.pc = null;
    online.channel = null;
    online.role = null;
    online.connected = false;
    remoteKeys.clear();
    if (clearSignals) {
      localSignal.value = "";
      remoteSignal.value = "";
      setOnlineStatus("未连接 | 房主控制蓝队，加入方控制红队");
    }
  }

  function keySetFor(side) {
    if (state.matchMode === "online" && online.role === "host" && side === "right") return remoteKeys;
    return keys;
  }

  function keyHeld(side, code) {
    return keySetFor(side).has(code);
  }

  function keyBuffered(side, code) {
    if (keySetFor(side) !== keys) return remoteKeys.has(code);
    return buffered(code);
  }

  function sendOnlineInput(force = false) {
    if (state.matchMode !== "online" || online.role !== "guest" || !online.channel) return;
    if (online.channel.readyState !== "open") return;
    const now = performance.now();
    if (!force && now - online.lastInputSent < 26) return;
    online.lastInputSent = now;
    online.channel.send(JSON.stringify({ type: "input", keys: [...keys] }));
  }

  function sendOnlinePacket(packet) {
    if (state.matchMode !== "online" || online.role !== "host" || !online.channel) return;
    if (online.channel.readyState !== "open") return;
    online.channel.send(JSON.stringify(packet));
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
      charge: player.charge,
      recovery: player.recovery,
      foot: player.foot,
      onGround: player.onGround,
      lastHit: player.lastHit,
      aiTargetX: player.aiTargetX,
      aiShot: player.aiShot,
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
      trail: bird.trail.slice(0, 12),
    };
  }

  function sendOnlineSnapshot(force = false) {
    if (state.matchMode !== "online" || online.role !== "host") return;
    const now = performance.now();
    if (!force && now - online.lastSnapshot < 50) return;
    online.lastSnapshot = now;
    sendOnlinePacket({
      type: "snapshot",
      running: state.running,
      paused: state.paused,
      winner: state.winner,
      rallyPause: state.rallyPause,
      readyTimer: state.readyTimer,
      serveDelay: state.serveDelay,
      serveSide: state.serveSide,
      score: state.score,
      shake: state.shake,
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

  function applyOnlineSnapshot(packet) {
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
    state.assist = packet.assist;
    state.message = packet.message;
    state.messageTimer = packet.messageTimer;
    state.pendingServer = packet.pendingServer;
    state.targetScore = packet.targetScore;
    state.playStyle = packet.playStyle;
    Object.assign(left, packet.left);
    Object.assign(right, packet.right);
    Object.assign(bird, packet.bird);
    updateHud();
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
    if (state.audioReady) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    state.audio = new AudioContext();
    state.audioReady = true;
    if (state.audio.state === "suspended") state.audio.resume();
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
      return Number(keySet.has("ArrowRight")) - Number(keySet.has("ArrowLeft"));
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

    const landingX = predictLandingX();
    const missWave = Math.sin(performance.now() / 530) * profile.aiError;
    const panic = bird.x > netX && bird.y > ground - 92 ? profile.aiError * 0.35 : 0;
    const netBias = bird.x > netX && bird.x < netX + 112 ? -34 : 0;
    player.aiTargetX = clamp(landingX + missWave + panic + netBias, netX + 72, W - 112);

    const distance = Math.abs(bird.x - player.x);
    const canAttack = bird.x > netX && bird.y < 268 && distance < 92;
    const canDrop = bird.x > netX && bird.y < 340 && player.x < netX + 190;
    const roll = Math.random();
    if (canAttack && state.difficulty !== "easy" && roll > (state.difficulty === "hard" ? 0.22 : 0.56)) {
      player.aiShot = "smash";
    } else if (canDrop && roll < (state.difficulty === "hard" ? 0.34 : 0.18)) {
      player.aiShot = "drop";
    } else {
      player.aiShot = landingX > W - 205 ? "clear" : "drive";
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
    if (player.side === "left") return keyBuffered(player.side, "k");
    if (!controlledByAi(player)) return keyBuffered(player.side, "2");
    return player.aiShot === "smash" && bird.x > netX && bird.y < 280 && distanceToRacket(player) < 78;
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
    }

    player.swing = Math.max(0, player.swing - dt);
    player.smash = Math.max(0, player.smash - dt);
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
    return clamp(timing * 0.64 + reach * 0.36, 0, 1);
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
    if (shotType === "drop") return nearNet + player.facing * (38 + spread * 0.42);
    if (shotType === "smash") return midCourt + player.facing * (contact.front * 80 + spread * 0.5);
    if (shotType === "drive") return midCourt + player.facing * (contact.front * 42 + spread);
    return farCorner - player.facing * spread;
  }

  function wantsDropShot(player) {
    if (player.side === "left") return keyHeld(player.side, "s") || keyBuffered(player.side, "s");
    if (!controlledByAi(player)) return keyHeld(player.side, "ArrowDown") || keyBuffered(player.side, "ArrowDown");
    return player.aiShot === "drop";
  }

  function serve(player) {
    if (bird.served || bird.server !== player.side) return;
    const power = player.smash > 0 ? 1.12 : 0.92;
    bird.served = true;
    bird.lastTouched = player.side;
    bird.x = player.x + player.facing * 58;
    bird.y = player.y - 82;
    bird.vx = player.facing * 420 * power;
    bird.vy = -430 * power;
    bird.spin = player.facing * 7;
    state.shake = 4;
    burst(bird.x, bird.y, "#f7f7ef", 7);
    blip(360, 0.05, 0.025);
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
    const smash = player.smash > 0 || (!player.onGround && bird.y < ground - 160 && quality > 0.42);
    const dropShot = wantsDropShot(player) && !smash;
    const drive = !smash && !dropShot && contact.front > 0.42 && quality > 0.55;
    const targetX = opponentTargetX(player, dropShot ? "drop" : smash ? "smash" : drive ? "drive" : "clear", quality, contact);
    const dx = targetX - bird.x;
    const lift = smash ? 108 - quality * 80 : dropShot ? 230 + (1 - quality) * 130 : drive ? 360 : 515 + contact.height * 80;
    const pace =
      smash ? 1.64 + quality * 0.34 : dropShot ? 0.64 + quality * 0.18 : drive ? 1.42 : 1.08 + quality * 0.24;
    const horizontal = clamp(dx * pace + contact.front * (smash ? 130 : 72), -820, 820);

    bird.vx = horizontal;
    bird.vy = -lift + player.vy * 0.1;
    if (smash) bird.vy = clamp(bird.vy, -210, 115);
    if (dropShot && quality < 0.32 && bird.y > shotTuning.netRiskY) {
      bird.vx *= 0.58;
      bird.vy = -82;
    }
    bird.x += player.facing * 4;
    bird.lastTouched = player.side;
    bird.spin = player.facing * (smash ? 18 + quality * 6 : dropShot ? 7 : 10 + quality * 4);
    player.lastHit = smash ? 0.28 : 0.2;
    if (smash) player.recovery = shotTuning.smashRecovery + (1 - quality) * 0.08;
    const perfect = quality > 0.78;
    state.shake = smash ? 7 + quality * 4 : perfect ? 5 : 3;
    state.hitStop = smash ? 0.045 + quality * 0.025 : perfect ? 0.035 : 0;
    state.message = smash ? (perfect ? "完美扣杀!" : "扣杀!") : dropShot ? (perfect ? "贴网小球" : "网前小球") : perfect ? "甜点击球" : "回击";
    state.messageTimer = smash || perfect ? 0.48 : 0.3;
    burst(bird.x, bird.y, smash || perfect ? "#f8d75a" : "#f7f7ef", smash ? 13 : perfect ? 11 : 8);
    if (smash || perfect) burst(bird.x, bird.y, "rgba(248, 215, 90, 0.88)", smash ? 9 : 5, "streak", player.facing);
    blip(smash ? 180 : perfect ? 520 : 440, smash ? 0.09 : 0.045, smash ? 0.045 : perfect ? 0.034 : 0.026);
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
    bird.trail.length = 12;

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
    bird.trail.length = 12;
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
    const lean = clamp(player.vx / 520, -0.42, 0.42);
    const swingArc = Math.sin((player.swing / 0.26) * Math.PI);
    const headX = player.x + lean * 8;
    const torsoX = player.x + player.facing * 4 + lean * 13;
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
    bird.trail.forEach((p, index) => {
      const next = bird.trail[index + 1] || p;
      ctx.globalAlpha = (1 - index / bird.trail.length) * clamp(speed / 720, 0.18, 0.52);
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
    requestAnimationFrame(frame);
  }

  loadSettings();
  applySettingsToUi();
  render();
  requestAnimationFrame(frame);
})();
