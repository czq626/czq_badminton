(() => {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const leftScoreEl = document.getElementById("leftScore");
  const rightScoreEl = document.getElementById("rightScore");
  const overlay = document.getElementById("overlay");
  const overlayText = document.getElementById("overlayText");
  const startButton = document.getElementById("startButton");
  const modeButton = document.getElementById("modeButton");
  const assistButton = document.getElementById("assistButton");
  const soundButton = document.getElementById("soundButton");
  const pauseButton = document.getElementById("pauseButton");
  const resetButton = document.getElementById("resetButton");
  const modeLabel = document.getElementById("modeLabel");
  const statusStrip = document.getElementById("statusStrip");
  const playerModeButtons = [...document.querySelectorAll("[data-player-mode]")];
  const difficultyButtons = [...document.querySelectorAll("[data-difficulty]")];
  const targetScoreButtons = [...document.querySelectorAll("[data-target-score]")];
  const styleButtons = [...document.querySelectorAll("[data-style]")];
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
  const settingsKey = "stick-badminton-settings";

  const state = {
    running: false,
    paused: false,
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

  const difficulty = {
    easy: { label: "休闲", aiSpeed: 0.74, aiError: 56, aiReact: 0.18 },
    normal: { label: "普通", aiSpeed: 0.9, aiError: 34, aiReact: 0.11 },
    hard: { label: "高手", aiSpeed: 1.04, aiError: 16, aiReact: 0.04 },
  };

  const playStyles = {
    standard: { label: "标准", wind: 0, wallBounce: 0.64, netBounce: -0.38 },
    fun: { label: "趣味", wind: 95, wallBounce: 0.78, netBounce: -0.52 },
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
      foot: 0,
      onGround: true,
      lastHit: 0,
      aiTimer: 0,
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

  function resetMatch() {
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
    state.particles = [];
    state.serveSide = "left";
    resetRally("left");
    overlay.classList.add("hidden");
    pauseButton.textContent = "暂停";
    startButton.textContent = "开始游戏";
    updateHud();
    initAudio();
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
    state.serveDelay = server === "right" && state.singlePlayer ? 0.65 : 0;
    if (!state.messageTimer) {
      state.message = server === "left" ? "蓝队发球" : "红队发球";
      state.messageTimer = 1.2;
    }
    updateHud();
  }

  function updateHud() {
    leftScoreEl.textContent = state.score.left;
    rightScoreEl.textContent = state.score.right;
    modeLabel.textContent = state.singlePlayer ? "单人模式" : "双人模式";
    syncPlayerModeButtons();
    const server = state.pendingServer || bird.server || state.serveSide;
    const serverLabel = server === "left" ? "蓝队发球" : "红队发球";
    const lead = Math.abs(state.score.left - state.score.right);
    const deuce =
      state.score.left >= state.targetScore - 1 &&
      state.score.right >= state.targetScore - 1 &&
      lead < 2;
    const rule = deuce ? "平分后领先2分" : `${state.targetScore}分制`;
    statusStrip.textContent = `${rule} | ${serverLabel} | ${difficulty[state.difficulty].label} | ${playStyles[state.playStyle].label}`;
    if (!state.running || state.paused) {
      overlayText.textContent = state.paused ? "比赛暂停，按 P 或点击继续。" : matchCopy();
    }
  }

  function matchCopy() {
    return `抢落点、跳扣杀，先到 ${state.targetScore} 分获胜。`;
  }

  function saveSettings() {
    const settings = {
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
      if (typeof settings.singlePlayer === "boolean") state.singlePlayer = settings.singlePlayer;
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
    updateHud();
  }

  function setPlayerMode(singlePlayer, restart = false) {
    state.singlePlayer = singlePlayer;
    saveSettings();
    updateHud();
    if (restart && state.running) resetMatch();
  }

  function syncPlayerModeButtons() {
    playerModeButtons.forEach((button) => {
      const shouldBeActive =
        (state.singlePlayer && button.dataset.playerMode === "single") ||
        (!state.singlePlayer && button.dataset.playerMode === "double");
      button.classList.toggle("active", shouldBeActive);
    });
  }

  function keyDown(code) {
    if (!keys.has(code)) taps.add(code);
    keys.add(code);
  }

  function keyUp(code) {
    keys.delete(code);
  }

  window.addEventListener("keydown", (event) => {
    const code = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    keyDown(code);
    if (["ArrowLeft", "ArrowRight", "ArrowUp", " "].includes(event.key)) {
      event.preventDefault();
    }
    if (event.key.toLowerCase() === "p" && state.running) togglePause();
    if (event.key === "Enter" && !state.running) resetMatch();
  });

  window.addEventListener("keyup", (event) => {
    const code = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    keyUp(code);
  });

  startButton.addEventListener("click", () => {
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
    setPlayerMode(!state.singlePlayer, true);
  });
  playerModeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setPlayerMode(button.dataset.playerMode === "single", true);
    });
  });
  difficultyButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.difficulty = button.dataset.difficulty;
      difficultyButtons.forEach((item) => item.classList.toggle("active", item === button));
      saveSettings();
      updateHud();
      if (state.running && state.singlePlayer) resetMatch();
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
    const begin = (event) => {
      event.preventDefault();
      if (hold) keyDown(hold);
      if (tap) keyDown(tap);
    };
    const end = (event) => {
      event.preventDefault();
      if (hold) keyUp(hold);
      if (tap) keyUp(tap);
    };
    button.addEventListener("pointerdown", begin);
    button.addEventListener("pointerup", end);
    button.addEventListener("pointercancel", end);
    button.addEventListener("pointerleave", end);
  });

  function togglePause() {
    if (!state.running) return;
    state.paused = !state.paused;
    pauseButton.textContent = state.paused ? "继续" : "暂停";
    overlayText.textContent = state.paused ? "比赛暂停，按 P 或点击继续。" : matchCopy();
    startButton.textContent = "继续";
    overlay.classList.toggle("hidden", !state.paused);
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
    if (player.side === "left") {
      return Number(keys.has("d")) - Number(keys.has("a"));
    }
    if (!state.singlePlayer) {
      return Number(keys.has("ArrowRight")) - Number(keys.has("ArrowLeft"));
    }
    return aiMoveAxis(player) * difficulty[state.difficulty].aiSpeed;
  }

  function aiMoveAxis(player) {
    const profile = difficulty[state.difficulty];
    const miss = Math.sin(performance.now() / 530) * profile.aiError;
    const target = predictLandingX() + miss;
    const ideal = clamp(target, netX + 88, W - 118);
    const distance = ideal - player.x;
    if (!bird.served && bird.server === "right") return player.x > 720 ? -1 : 0;
    if (Math.abs(distance) < 18) return 0;
    return Math.sign(distance);
  }

  function wantsJump(player) {
    if (player.side === "left") return taps.has("w");
    if (!state.singlePlayer) return taps.has("ArrowUp");
    const profile = difficulty[state.difficulty];
    return (
      bird.x > netX &&
      bird.y < 245 + profile.aiError * 0.25 &&
      Math.abs(bird.x - player.x) < 88 &&
      player.onGround
    );
  }

  function wantsSwing(player) {
    if (player.side === "left") return taps.has("j");
    if (!state.singlePlayer) return taps.has("1");
    if (!bird.served && bird.server === "right") return state.serveDelay <= 0;
    const profile = difficulty[state.difficulty];
    return bird.x > netX && distanceToRacket(player) < 70 && bird.y < ground - 28 && Math.random() > profile.aiReact;
  }

  function wantsSmash(player) {
    if (player.side === "left") return taps.has("k");
    if (!state.singlePlayer) return taps.has("2");
    return bird.x > netX && bird.y < 260 && distanceToRacket(player) < 76;
  }

  function updatePlayer(player, dt) {
    const axis = axisFor(player);
    const [minX, maxX] = sideBounds(player.side);
    const maxSpeed = player.onGround ? 360 : 270;
    const accel = player.onGround ? 2600 : 1180;
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
    if (dist > 76 || !sameSide || player.swing <= 0 || player.lastHit > 0) return;

    if (!bird.served) {
      serve(player);
      player.lastHit = 0.2;
      return;
    }

    const targetX = player.side === "left" ? W - 170 - Math.random() * 120 : 170 + Math.random() * 120;
    const dx = targetX - bird.x;
    const smash = player.smash > 0 || (!player.onGround && bird.y < ground - 160);
    const wantsDrop =
      player.side === "left"
        ? keys.has("s")
        : !state.singlePlayer && keys.has("ArrowDown");
    const dropShot = wantsDrop && !smash;
    const horizontal = clamp(dx * (smash ? 1.72 : dropShot ? 0.86 : 1.24), -760, 760);
    const lift = smash ? 118 : dropShot ? 300 : 520;

    bird.vx = horizontal;
    bird.vy = -lift + player.vy * 0.1;
    if (smash) bird.vy = clamp(bird.vy, -220, 90);
    bird.x += player.facing * 4;
    bird.lastTouched = player.side;
    bird.spin = player.facing * (smash ? 18 : 10);
    player.lastHit = 0.22;
    state.shake = smash ? 8 : 3;
    state.message = smash ? "扣杀!" : dropShot ? "网前小球" : "回击";
    state.messageTimer = smash ? 0.42 : 0.3;
    burst(bird.x, bird.y, smash ? "#f8d75a" : "#f7f7ef", smash ? 13 : 8);
    if (smash) burst(bird.x, bird.y, "rgba(248, 215, 90, 0.88)", 9, "streak", player.facing);
    blip(smash ? 180 : 440, smash ? 0.09 : 0.045, smash ? 0.045 : 0.026);
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
      startButton.textContent = "再来一局";
      overlay.classList.remove("hidden");
      for (let i = 0; i < 8; i += 1) {
        const x = side === "left" ? 220 + Math.random() * 200 : 540 + Math.random() * 200;
        const y = 135 + Math.random() * 125;
        burst(x, y, i % 2 ? "#f8d75a" : side === "left" ? "#35b8ff" : "#ff5f69", 18);
      }
      return;
    }

    if (state.score[side] >= state.targetScore - 1) {
      state.message = `${side === "left" ? "蓝队" : "红队"}赛点`;
      state.messageTimer = 1.15;
    }
    state.rallyPause = 1.15;
    updateHud();
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

    updatePlayer(left, dt);
    updatePlayer(right, dt);
    left.lastHit = Math.max(0, left.lastHit - dt);
    right.lastHit = Math.max(0, right.lastHit - dt);

    hitBird(left);
    hitBird(right);
    updateBird(dt);
    state.shake = Math.max(0, state.shake - dt * 18);
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
        : state.singlePlayer
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
    render();
    taps.clear();
    requestAnimationFrame(frame);
  }

  loadSettings();
  applySettingsToUi();
  render();
  requestAnimationFrame(frame);
})();
