(() => {
  "use strict";

  // =========================
  // Helpers
  // =========================
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  // =========================
  // DOM
  // =========================
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  const ui = {
    hp: document.getElementById("hp"),
    armor: document.getElementById("armor"),
    wave: document.getElementById("wave"),
    cash: document.getElementById("cash"),
    ping: document.getElementById("ping"),

    weaponName: document.getElementById("weaponName"),
    ammo: document.getElementById("ammo"),
    ammoReserve: document.getElementById("ammoReserve"),

    overlay: document.getElementById("overlay"),
    btnPlay: document.getElementById("btnPlay"),
    playerName: document.getElementById("playerName"),
    modeSolo: document.getElementById("modeSolo"),
    modeOnline: document.getElementById("modeOnline"),
    onlineBlock: document.getElementById("onlineBlock"),
    roomCode: document.getElementById("roomCode"),

    settings: document.getElementById("settings"),
    btnSettings: document.getElementById("btnSettings"),
    btnCloseSettings: document.getElementById("btnCloseSettings"),
    sens: document.getElementById("sens"),
    sensVal: document.getElementById("sensVal"),
    fov: document.getElementById("fov"),
    fovVal: document.getElementById("fovVal"),
    gfxLow: document.getElementById("gfxLow"),
    gfxMed: document.getElementById("gfxMed"),
    gfxHigh: document.getElementById("gfxHigh"),

    minimap: document.getElementById("minimap"),
  };
  const mctx = ui.minimap.getContext("2d");

  // =========================
  // Settings (saved)
  // =========================
  const saved = (() => {
    try { return JSON.parse(localStorage.getItem("zrpg_settings") || "{}"); }
    catch { return {}; }
  })();

  const settings = {
    sens: clamp(saved.sens ?? 1.25, 0.3, 3.0),
    fov: clamp(saved.fov ?? 75, 55, 95),
    gfx: saved.gfx ?? "med", // low/med/high
  };

  function saveSettings(){
    localStorage.setItem("zrpg_settings", JSON.stringify(settings));
  }

  ui.sens.value = settings.sens;
  ui.sensVal.textContent = settings.sens.toFixed(2);
  ui.fov.value = settings.fov;
  ui.fovVal.textContent = settings.fov;

  const setGfxBtn = () => {
    ui.gfxLow.classList.toggle("segOn", settings.gfx === "low");
    ui.gfxMed.classList.toggle("segOn", settings.gfx === "med");
    ui.gfxHigh.classList.toggle("segOn", settings.gfx === "high");
  };
  setGfxBtn();

  // =========================
  // Input
  // =========================
  const keys = Object.create(null);
  let mouseDX = 0, mouseDY = 0;
  let pointerLocked = false;
  let wantShoot = false;
  let wantADS = false;
  let wantReload = false;

  window.addEventListener("keydown", (e) => {
    keys[e.code] = true;
    if (e.code === "Escape") {
      // allow overlays with Esc
      if (pointerLocked) document.exitPointerLock();
    }
    if (e.code === "KeyR") wantReload = true;
  });
  window.addEventListener("keyup", (e) => {
    keys[e.code] = false;
  });

  window.addEventListener("mousedown", (e) => {
    if (ui.overlay.classList.contains("hidden") && ui.settings.classList.contains("hidden")) {
      if (!pointerLocked) canvas.requestPointerLock();
    }
    if (e.button === 0) wantShoot = true;
    if (e.button === 2) wantADS = true;
  });
  window.addEventListener("mouseup", (e) => {
    if (e.button === 0) wantShoot = false;
    if (e.button === 2) wantADS = false;
  });
  window.addEventListener("contextmenu", (e) => e.preventDefault());

  document.addEventListener("pointerlockchange", () => {
    pointerLocked = (document.pointerLockElement === canvas);
  });

  window.addEventListener("mousemove", (e) => {
    if (!pointerLocked) return;
    mouseDX += e.movementX || 0;
    mouseDY += e.movementY || 0;
  });

  // Settings UI
  ui.btnSettings.addEventListener("click", () => {
    ui.settings.classList.remove("hidden");
    if (pointerLocked) document.exitPointerLock();
  });
  ui.btnCloseSettings.addEventListener("click", () => {
    ui.settings.classList.add("hidden");
  });
  ui.sens.addEventListener("input", () => {
    settings.sens = parseFloat(ui.sens.value);
    ui.sensVal.textContent = settings.sens.toFixed(2);
    saveSettings();
  });
  ui.fov.addEventListener("input", () => {
    settings.fov = parseInt(ui.fov.value, 10);
    ui.fovVal.textContent = settings.fov;
    saveSettings();
  });
  ui.gfxLow.addEventListener("click", () => { settings.gfx="low"; setGfxBtn(); saveSettings(); });
  ui.gfxMed.addEventListener("click", () => { settings.gfx="med"; setGfxBtn(); saveSettings(); });
  ui.gfxHigh.addEventListener("click", () => { settings.gfx="high"; setGfxBtn(); saveSettings(); });

  // Overlay mode toggles (online later)
  let mode = "solo";
  ui.modeSolo.addEventListener("click", () => {
    mode = "solo";
    ui.modeSolo.classList.add("segOn");
    ui.modeOnline.classList.remove("segOn");
    ui.onlineBlock.classList.add("hidden");
  });
  ui.modeOnline.addEventListener("click", () => {
    mode = "online";
    ui.modeOnline.classList.add("segOn");
    ui.modeSolo.classList.remove("segOn");
    ui.onlineBlock.classList.remove("hidden");
  });

  // =========================
  // Game constants
  // =========================
  const game = {
    running: false,
    time: 0,
    dt: 0,

    // player
    px: 3.5,
    py: 3.5,
    pz: 0,
    ang: 0,
    pitch: 0,
    hp: 100,
    armor: 0,
    cash: 0,

    // movement
    velX: 0,
    velY: 0,
    stamina: 1,
    sprinting: false,

    // gun feel
    ads: 0,          // 0..1
    recoil: 0,       // shoots add, decay over time
    muzzle: 0,       // flash
    bob: 0,
    swayX: 0,
    swayY: 0,

    // wave
    wave: 1,
    spawnTimer: 0,
    betweenWaves: 1.2,

    // fps ping placeholder (for later online)
    ping: 12,
  };

  // =========================
  // Map (1 = wall)
  // =========================
  // 16x16
  const MAP_W = 16, MAP_H = 16;
  const map = [
    "1111111111111111",
    "1000000000000001",
    "1011110111111101",
    "1010000100000101",
    "1010111101110101",
    "1010100001010101",
    "1010101111010101",
    "1000101000010001",
    "1110101011110111",
    "1000100010000101",
    "1011111010111101",
    "1010000010000001",
    "1010111111110101",
    "1010000000000101",
    "1000000000000001",
    "1111111111111111",
  ].map(r => r.split("").map(ch => ch === "1" ? 1 : 0));

  const isWall = (x, y) => {
    const ix = x | 0, iy = y | 0;
    if (ix < 0 || iy < 0 || ix >= MAP_W || iy >= MAP_H) return true;
    return map[iy][ix] === 1;
  };

  // =========================
  // Weapon
  // =========================
  const weapon = {
    name: "Pistol",
    mag: 12,
    ammo: 12,
    reserve: 48,
    fireDelay: 0.18,
    damage: 28,
    spread: 0.018, // radians
    reloadTime: 1.1,
    lastShot: 0,
    reloading: 0,
  };

  // =========================
  // Zombies
  // =========================
  const zombies = [];

  function spawnZombie(){
    // spawn away from player (pick random open cell)
    for (let tries = 0; tries < 40; tries++){
      const x = (Math.random() * (MAP_W-2) + 1) | 0;
      const y = (Math.random() * (MAP_H-2) + 1) | 0;
      if (map[y][x] === 0){
        const dx = (x+0.5) - game.px;
        const dy = (y+0.5) - game.py;
        if (dx*dx + dy*dy > 25){
          zombies.push({
            x: x + 0.5,
            y: y + 0.5,
            hp: 60 + game.wave*8,
            spd: 0.55 + game.wave*0.03,
            hitCD: 0,
          });
          return;
        }
      }
    }
  }

  // =========================
  // Resize
  // =========================
  function resize(){
    const dpr = Math.max(1, Math.min(2, devicePixelRatio || 1));
    canvas.width = (innerWidth * dpr) | 0;
    canvas.height = (innerHeight * dpr) | 0;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener("resize", resize);
  resize();

  // =========================
  // Start button
  // =========================
  ui.btnPlay.addEventListener("click", () => {
    const n = (ui.playerName.value || "Player").trim().slice(0, 16);
    ui.playerName.value = n;
    ui.overlay.classList.add("hidden");
    game.running = true;
    canvas.focus();
    // Ask for pointer lock on first click in canvas (browser security)
  });

  // =========================
  // Raycast rendering
  // =========================
  function castRay(angle){
    const sin = Math.sin(angle), cos = Math.cos(angle);

    let dist = 0;
    const maxDist = 22;
    const step = 0.02; // smaller is smoother but heavier

    let hit = 0, hx = 0, hy = 0;
    while (dist < maxDist){
      const x = game.px + cos * dist;
      const y = game.py + sin * dist;
      if (isWall(x, y)){
        hit = 1; hx = x; hy = y;
        break;
      }
      dist += step;
    }
    return { hit, dist, hx, hy };
  }

  function renderWorld(){
    const W = innerWidth, H = innerHeight;

    // Quality scaling
    let colStep = 2;
    if (settings.gfx === "low") colStep = 4;
    if (settings.gfx === "high") colStep = 1;

    // floor/ceiling base
    ctx.fillStyle = "rgba(0,0,0,0.0)";
    ctx.clearRect(0,0,W,H);

    // subtle fog background
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.fillRect(0,0,W,H);

    // ceiling gradient
    const grdC = ctx.createLinearGradient(0,0,0,H*0.6);
    grdC.addColorStop(0, "rgba(120,150,255,0.10)");
    grdC.addColorStop(1, "rgba(0,0,0,0.10)");
    ctx.fillStyle = grdC;
    ctx.fillRect(0,0,W,H*0.6);

    // floor gradient
    const grdF = ctx.createLinearGradient(0,H*0.4,0,H);
    grdF.addColorStop(0, "rgba(0,0,0,0.10)");
    grdF.addColorStop(1, "rgba(0,0,0,0.45)");
    ctx.fillStyle = grdF;
    ctx.fillRect(0,H*0.4,W,H);

    // FOV changes with ADS
    const fov = (settings.fov - game.ads * 12) * Math.PI / 180;
    const halfFov = fov * 0.5;

    for (let x = 0; x < W; x += colStep){
      const t = (x / W) * 2 - 1;
      const ang = game.ang + t * halfFov;

      const r = castRay(ang);

      // remove fish-eye
      const corrected = r.dist * Math.cos(ang - game.ang);

      const wallH = clamp((H * 0.9) / (corrected + 0.001), 0, H*1.2);
      const y0 = (H * 0.5) - wallH * 0.5 + game.pitch * 90;

      // shade based on distance
      const fog = clamp(1 - corrected / 16, 0, 1);

      // edge darkening
      const edge = Math.abs(t);
      const edgeFade = 1 - edge * 0.6;

      // crude texture-ish stripes
      const stripe = ((r.hx + r.hy) * 6) % 1;
      const tex = 0.75 + stripe * 0.25;

      const a = (0.20 + fog * 0.70) * edgeFade;
      const v = (90 + fog * 120) * tex;

      ctx.fillStyle = `rgba(${v|0}, ${ (v*0.95)|0 }, ${ (v*1.10)|0 }, ${a})`;
      ctx.fillRect(x, y0, colStep+0.5, wallH);

      // soft shadow below wall
      ctx.fillStyle = `rgba(0,0,0,${0.12 * (1-fog)})`;
      ctx.fillRect(x, y0 + wallH, colStep+0.5, H - (y0+wallH));
    }
  }

  // =========================
  // Zombie rendering (billboard-ish)
  // =========================
  function renderZombies(){
    const W = innerWidth, H = innerHeight;
    const fov = (settings.fov - game.ads * 12) * Math.PI / 180;
    const halfFov = fov * 0.5;

    // depth-sort far to near
    const list = zombies.map(z => {
      const dx = z.x - game.px;
      const dy = z.y - game.py;
      return { z, d2: dx*dx + dy*dy, dx, dy };
    }).sort((a,b) => b.d2 - a.d2);

    for (const it of list){
      const z = it.z;
      const dist = Math.sqrt(it.d2) + 0.0001;

      const angTo = Math.atan2(it.dy, it.dx);
      let da = angTo - game.ang;
      while (da > Math.PI) da -= Math.PI*2;
      while (da < -Math.PI) da += Math.PI*2;

      if (Math.abs(da) > halfFov + 0.2) continue;

      // simple visibility check with a ray toward zombie
      const steps = Math.max(8, (dist / 0.2)|0);
      let blocked = false;
      for (let i=0;i<steps;i++){
        const t = i/steps;
        const x = lerp(game.px, z.x, t);
        const y = lerp(game.py, z.y, t);
        if (isWall(x,y)){
          blocked = true; break;
        }
      }
      if (blocked) continue;

      const screenX = (0.5 + (da / (halfFov*2))) * W;

      // size
      const size = clamp((H * 0.85) / dist, 18, H*0.9);
      const y = (H*0.5 - size*0.45) + game.pitch*90;

      // body color with distance fog
      const fog = clamp(1 - dist / 16, 0, 1);
      const alpha = 0.25 + fog * 0.65;

      // "more realistic" silhouette (no image)
      ctx.save();
      ctx.translate(screenX, y);

      // slight wobble
      const wob = Math.sin(game.time*4 + z.x*3) * 3;

      // shadow
      ctx.fillStyle = `rgba(0,0,0,${0.18*alpha})`;
      ctx.beginPath();
      ctx.ellipse(0, size*0.78, size*0.20, size*0.07, 0, 0, Math.PI*2);
      ctx.fill();

      // legs
      ctx.fillStyle = `rgba(80,110,95,${alpha})`;
      ctx.fillRect(-size*0.10, size*0.45, size*0.08, size*0.28);
      ctx.fillRect(size*0.02, size*0.45, size*0.08, size*0.28);

      // torso
      ctx.fillStyle = `rgba(95,135,110,${alpha})`;
      ctx.beginPath();
      ctx.roundRect(-size*0.16, size*0.10 + wob*0.15, size*0.32, size*0.40, 10);
      ctx.fill();

      // arms
      ctx.fillStyle = `rgba(75,110,95,${alpha})`;
      ctx.beginPath();
      ctx.roundRect(-size*0.25, size*0.18 + wob*0.2, size*0.10, size*0.28, 10);
      ctx.roundRect(size*0.15, size*0.18 - wob*0.1, size*0.10, size*0.28, 10);
      ctx.fill();

      // head
      ctx.fillStyle = `rgba(110,160,125,${alpha})`;
      ctx.beginPath();
      ctx.ellipse(0, size*0.02 + wob*0.2, size*0.10, size*0.12, 0, 0, Math.PI*2);
      ctx.fill();

      // eyes (glow)
      ctx.fillStyle = `rgba(255,120,145,${alpha*0.65})`;
      ctx.fillRect(-size*0.04, size*0.00, size*0.02, size*0.01);
      ctx.fillRect(size*0.02, size*0.00, size*0.02, size*0.01);

      // health bar (if close-ish)
      if (dist < 10){
        const hp01 = clamp(z.hp / (60 + game.wave*8), 0, 1);
        ctx.fillStyle = `rgba(0,0,0,${0.35*alpha})`;
        ctx.fillRect(-size*0.18, -size*0.20, size*0.36, size*0.04);
        ctx.fillStyle = `rgba(255,92,122,${0.70*alpha})`;
        ctx.fillRect(-size*0.18, -size*0.20, size*0.36*hp01, size*0.04);
      }

      ctx.restore();
    }
  }

  // =========================
  // COD-ish gun viewmodel (code-drawn)
  // =========================
  function drawGun(dt){
    const W = innerWidth, H = innerHeight;

    // recoil and muzzle decay
    game.recoil = Math.max(0, game.recoil - dt * 6.0);
    game.muzzle = Math.max(0, game.muzzle - dt * 10.0);

    // ADS smoothing
    const adsTarget = wantADS ? 1 : 0;
    game.ads = lerp(game.ads, adsTarget, 1 - Math.pow(0.001, dt)); // smooth independent of fps

    // movement bob
    const speed = Math.hypot(game.velX, game.velY);
    game.bob += speed * dt * 7.5;
    const bobX = Math.sin(game.bob) * 6 * (1 - game.ads);
    const bobY = Math.abs(Math.cos(game.bob)) * 6 * (1 - game.ads);

    // mouse sway
    game.swayX = lerp(game.swayX, clamp(mouseDX * 0.18, -8, 8), 1 - Math.pow(0.001, dt));
    game.swayY = lerp(game.swayY, clamp(mouseDY * 0.18, -8, 8), 1 - Math.pow(0.001, dt));

    // base position (bottom-right), pull toward center when ADS
    const baseX = lerp(W*0.78, W*0.55, game.ads);
    const baseY = lerp(H*0.80, H*0.72, game.ads);

    // recoil kick
    const kick = game.recoil * 22;
    const rx = -kick * 0.65;
    const ry = kick * 0.35;

    const x = baseX + bobX + game.swayX + rx;
    const y = baseY + bobY + game.swayY + ry;

    // gun size changes slightly with ADS
    const scale = lerp(1.0, 0.92, game.ads);

    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);

    // shadow
    ctx.fillStyle = "rgba(0,0,0,0.30)";
    ctx.beginPath();
    ctx.ellipse(30, 30, 120, 45, -0.25, 0, Math.PI*2);
    ctx.fill();

    // receiver
    ctx.fillStyle = "rgba(230,235,255,0.10)";
    ctx.strokeStyle = "rgba(234,240,255,0.20)";
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.roundRect(-10, -25, 220, 70, 18);
    ctx.fill();
    ctx.stroke();

    // barrel
    ctx.fillStyle = "rgba(234,240,255,0.12)";
    ctx.beginPath();
    ctx.roundRect(170, -18, 120, 22, 12);
    ctx.fill();

    // front sight
    ctx.fillStyle = "rgba(234,240,255,0.16)";
    ctx.fillRect(255, -28, 10, 12);

    // grip
    ctx.fillStyle = "rgba(234,240,255,0.12)";
    ctx.beginPath();
    ctx.roundRect(30, 20, 55, 85, 18);
    ctx.fill();

    // trigger guard
    ctx.strokeStyle = "rgba(234,240,255,0.18)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(82, 18, 40, 35, 16);
    ctx.stroke();

    // stock
    ctx.fillStyle = "rgba(234,240,255,0.09)";
    ctx.beginPath();
    ctx.roundRect(-65, -18, 70, 28, 14);
    ctx.fill();

    // detail lines
    ctx.strokeStyle = "rgba(234,240,255,0.12)";
    ctx.beginPath();
    ctx.moveTo(20, -5); ctx.lineTo(150, -5);
    ctx.moveTo(20, 8);  ctx.lineTo(120, 8);
    ctx.stroke();

    // muzzle flash
    if (game.muzzle > 0){
      const a = clamp(game.muzzle, 0, 1);
      ctx.fillStyle = `rgba(255,209,102,${0.55*a})`;
      ctx.beginPath();
      ctx.ellipse(298, -7, 18 + 30*a, 10 + 18*a, 0, 0, Math.PI*2);
      ctx.fill();

      ctx.fillStyle = `rgba(255,92,122,${0.25*a})`;
      ctx.beginPath();
      ctx.ellipse(300, -7, 40 + 55*a, 18 + 25*a, 0, 0, Math.PI*2);
      ctx.fill();
    }

    ctx.restore();
  }

  // =========================
  // Shooting (hitscan)
  // =========================
  function shoot(){
    const now = game.time;
    if (weapon.reloading > 0) return;
    if (now - weapon.lastShot < weapon.fireDelay) return;
    if (weapon.ammo <= 0) return;

    weapon.lastShot = now;
    weapon.ammo--;

    // recoil/muzzle
    game.recoil = clamp(game.recoil + 0.95, 0, 2.5);
    game.muzzle = 1.0;

    // spread affected by ADS + movement
    const speed = Math.hypot(game.velX, game.velY);
    const movePenalty = clamp(speed * 0.7, 0, 1);
    const adsBonus = 1 - game.ads * 0.6;
    const spread = weapon.spread * (0.9 + movePenalty*1.1) * adsBonus;

    const shotAng = game.ang + (Math.random()*2-1) * spread;

    // hit walls / zombies along ray
    const maxDist = 18;
    const step = 0.03;

    let hitPos = null;
    let bestZ = null;
    let bestZDist = 1e9;

    for (let d=0; d<maxDist; d += step){
      const x = game.px + Math.cos(shotAng) * d;
      const y = game.py + Math.sin(shotAng) * d;

      // zombie hit radius
      for (const z of zombies){
        const dx = z.x - x;
        const dy = z.y - y;
        if (dx*dx + dy*dy < 0.10){
          if (d < bestZDist){
            bestZDist = d;
            bestZ = z;
          }
        }
      }

      if (isWall(x,y)){
        hitPos = {x,y,d};
        break;
      }
    }

    if (bestZ){
      bestZ.hp -= weapon.damage;
      if (bestZ.hp <= 0){
        // reward
        game.cash += 15 + game.wave*2;
        const idx = zombies.indexOf(bestZ);
        if (idx >= 0) zombies.splice(idx, 1);
      }
    }
  }

  function reload(){
    if (weapon.reloading > 0) return;
    if (weapon.ammo >= weapon.mag) return;
    if (weapon.reserve <= 0) return;
    weapon.reloading = weapon.reloadTime;
  }

  // =========================
  // Update
  // =========================
  function update(dt){
    game.time += dt;
    game.dt = dt;

    // apply mouse look
    const sens = settings.sens * 0.0024;
    game.ang += mouseDX * sens;
    game.pitch = clamp(game.pitch + mouseDY * sens * 0.5, -0.6, 0.6);
    mouseDX = 0; mouseDY = 0;

    // movement
    const forward = (keys["KeyW"] ? 1 : 0) - (keys["KeyS"] ? 1 : 0);
    const strafe  = (keys["KeyD"] ? 1 : 0) - (keys["KeyA"] ? 1 : 0);

    let vx = 0, vy = 0;
    if (forward || strafe){
      const fa = game.ang;
      const fx = Math.cos(fa), fy = Math.sin(fa);
      const sx = Math.cos(fa + Math.PI/2), sy = Math.sin(fa + Math.PI/2);
      vx = fx * forward + sx * strafe;
      vy = fy * forward + sy * strafe;
      const len = Math.hypot(vx, vy) || 1;
      vx /= len; vy /= len;
    }

    const wantSprint = !!keys["ShiftLeft"] || !!keys["ShiftRight"];
    game.sprinting = wantSprint && forward > 0 && game.stamina > 0.08;

    const baseSpeed = 2.2;
    const sprintSpeed = 3.35;
    const speed = game.sprinting ? sprintSpeed : baseSpeed;

    // stamina
    if (game.sprinting){
      game.stamina = clamp(game.stamina - dt * 0.42, 0, 1);
    } else {
      game.stamina = clamp(game.stamina + dt * 0.30, 0, 1);
    }

    // accelerate/drag
    const accel = 10;
    const drag = 10;
    game.velX = lerp(game.velX, vx * speed, 1 - Math.pow(0.001, dt * accel));
    game.velY = lerp(game.velY, vy * speed, 1 - Math.pow(0.001, dt * accel));
    game.velX = lerp(game.velX, 0, 1 - Math.pow(0.001, dt * drag * (1 - (vx||vy ? 0.0 : 1.0))));
    game.velY = lerp(game.velY, 0, 1 - Math.pow(0.001, dt * drag * (1 - (vx||vy ? 0.0 : 1.0))));

    // collision
    const nx = game.px + game.velX * dt;
    const ny = game.py + game.velY * dt;

    const r = 0.22;
    if (!isWall(nx + r, game.py) && !isWall(nx - r, game.py)) game.px = nx;
    if (!isWall(game.px, ny + r) && !isWall(game.px, ny - r)) game.py = ny;

    // shooting
    if (wantShoot && pointerLocked) shoot();
    if (wantReload) { reload(); wantReload = false; }

    // reload timer
    if (weapon.reloading > 0){
      weapon.reloading -= dt;
      if (weapon.reloading <= 0){
        weapon.reloading = 0;
        const need = weapon.mag - weapon.ammo;
        const take = Math.min(need, weapon.reserve);
        weapon.ammo += take;
        weapon.reserve -= take;
      }
    }

    // zombies update (simple chase)
    for (const z of zombies){
      const dx = game.px - z.x;
      const dy = game.py - z.y;
      const dist = Math.hypot(dx, dy) + 0.0001;

      // try to move toward player, with simple wall avoidance
      const ux = dx / dist, uy = dy / dist;
      const step = z.spd * dt;

      // attempt direct
      let tx = z.x + ux * step;
      let ty = z.y + uy * step;

      if (!isWall(tx, ty)){
        z.x = tx; z.y = ty;
      } else {
        // slide options
        if (!isWall(z.x + ux * step, z.y)) z.x += ux * step;
        if (!isWall(z.x, z.y + uy * step)) z.y += uy * step;
      }

      // attack
      z.hitCD = Math.max(0, z.hitCD - dt);
      if (dist < 0.62 && z.hitCD <= 0){
        z.hitCD = 0.65;
        let dmg = 8 + game.wave*0.4;

        if (game.armor > 0){
          const ab = Math.min(game.armor, dmg * 0.7);
          game.armor -= ab;
          dmg -= ab;
        }
        game.hp -= dmg;
        if (game.hp <= 0){
          game.hp = 0;
          // end run
          game.running = false;
          ui.overlay.classList.remove("hidden");
        }
      }
    }

    // wave spawns
    game.spawnTimer -= dt;
    if (zombies.length === 0){
      game.betweenWaves -= dt;
      if (game.betweenWaves <= 0){
        game.wave++;
        game.betweenWaves = 1.2;
        game.spawnTimer = 0;
      }
    } else {
      game.betweenWaves = 1.2;
    }

    // spawn zombies for current wave
    const wantCount = Math.min(4 + game.wave*2, 40);
    if (zombies.length < wantCount && game.spawnTimer <= 0){
      game.spawnTimer = Math.max(0.15, 0.65 - game.wave*0.02);
      spawnZombie();
    }

    // UI update
    ui.hp.textContent = game.hp.toFixed(0);
    ui.armor.textContent = game.armor.toFixed(0);
    ui.wave.textContent = game.wave.toString();
    ui.cash.textContent = game.cash.toFixed(0);
    ui.weaponName.textContent = weapon.name + (weapon.reloading > 0 ? " (Reloading)" : "");
    ui.ammo.textContent = weapon.ammo.toString();
    ui.ammoReserve.textContent = weapon.reserve.toString();
    ui.ping.textContent = game.ping.toString();
  }

  // =========================
  // Minimap
  // =========================
  function renderMinimap(){
    const W = ui.minimap.width, H = ui.minimap.height;
    mctx.clearRect(0,0,W,H);

    // map cells
    const cellW = W / MAP_W;
    const cellH = H / MAP_H;

    // bg
    mctx.fillStyle = "rgba(0,0,0,0.25)";
    mctx.fillRect(0,0,W,H);

    for (let y=0;y<MAP_H;y++){
      for (let x=0;x<MAP_W;x++){
        if (map[y][x] === 1){
          mctx.fillStyle = "rgba(234,240,255,0.14)";
          mctx.fillRect(x*cellW, y*cellH, cellW, cellH);
        }
      }
    }

    // zombies
    mctx.fillStyle = "rgba(255,92,122,0.65)";
    for (const z of zombies){
      mctx.beginPath();
      mctx.arc(z.x*cellW, z.y*cellH, 2.2, 0, Math.PI*2);
      mctx.fill();
    }

    // player
    mctx.fillStyle = "rgba(89,255,165,0.80)";
    mctx.beginPath();
    mctx.arc(game.px*cellW, game.py*cellH, 3.2, 0, Math.PI*2);
    mctx.fill();

    // facing line
    mctx.strokeStyle = "rgba(89,255,165,0.65)";
    mctx.lineWidth = 2;
    mctx.beginPath();
    mctx.moveTo(game.px*cellW, game.py*cellH);
    mctx.lineTo((game.px + Math.cos(game.ang)*0.8)*cellW, (game.py + Math.sin(game.ang)*0.8)*cellH);
    mctx.stroke();
  }

  // =========================
  // Render loop
  // =========================
  let last = performance.now();
  function frame(t){
    const dt = clamp((t - last) / 1000, 0, 0.033);
    last = t;

    if (game.running){
      update(dt);
      renderWorld();
      renderZombies();
      drawGun(dt);
      renderMinimap();
    } else {
      // keep background animated a bit if you want (optional)
      renderWorld();
      renderMinimap();
    }

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

})();
