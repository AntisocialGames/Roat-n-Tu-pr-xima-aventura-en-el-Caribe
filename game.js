(() => {
  const canvas = document.getElementById('arcade-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const overlay = document.getElementById('arcade-overlay');
  const missionLabel = document.getElementById('arcade-mission');
  const objectiveLabel = document.getElementById('arcade-objective');
  const healthLabel = document.getElementById('arcade-health');
  const musicButton = document.getElementById('arcade-music');
  const ambienceButton = document.getElementById('arcade-ambience');
  const W = canvas.width, H = canvas.height;
  const keys = new Set();
  const defaultStory = {
    INTRO_TITLE: 'OPERACIÓN DELTA',
    INTRO_TEXT: 'Roatán, 02:17 a. m. Lucía Reyes, una guía local, desapareció después de reportar una lancha que salía de noche. Tu unidad ATIC te asigna tres misiones: encontrarla, detener el tráfico de personas y llevarla al punto de extracción.',
    MISSION_1_TITLE: 'MISIÓN 1 — ENCONTRA A LUCÍA',
    MISSION_1_BRIEF: 'Revisa la costa y reúne las tres señales que dejó Lucía. Los hombres que vigilan el muelle dispararán para impedir que llegues a la bitácora.',
    MISSION_1_CLEAR: 'Las tres señales confirman que Lucía fue trasladada en una lancha sin registrar. La bitácora indica que el siguiente movimiento saldrá antes de que amanezca.',
    MISSION_2_TITLE: 'MISIÓN 2 — DETENE EL TRÁFICO DE PERSONAS',
    MISSION_2_BRIEF: 'Intercepta el traslado de personas y detene a los traficantes. Hay personas retenidas en el muelle: no les dispares. Sobrevivi al fuego enemigo y neutraliza a los responsables.',
    MISSION_2_CLEAR: 'El traslado se detiene y las personas retenidas quedan a salvo. Lucía no está entre ellas. La radio de la ATIC transmite una nueva ubicación: el almacén de extracción.',
    MISSION_3_TITLE: 'MISIÓN 3 — RESCATA A LUCÍA',
    MISSION_3_BRIEF: 'Tu superior ordena despejar el almacén y llevar a Lucía al punto de extracción de la ATIC. Vence a los guardias y alcanza la señal amarilla para reunirte con ella.',
    ENDING_TITLE: 'ERA UNA ENTREGA',
    ENDING_TEXT: 'Lucía llega a tus brazos y pregunta: «¿De verdad estamos a salvo?». Seguis la orden de la ATIC hasta el punto de extracción. Al llegar, varias personas salen de la sombra. Se hacen llamar los Deltas. «La trajiste. Como acordamos», dice uno de ellos. Por la radio, tu superior responde: «Entrega confirmada. El expediente está cerrado». Entiendes demasiado tarde que nunca te mandaron a rescatarla. Te usaron para entregársela a los mismos hombres que estabas persiguiendo.',
    ENDING_QUOTE: 'Incluso la gente que se supone que te debe amar te puede traicionar. Así que no confíes en nadie.',
    QUOTE_CREDIT: 'Atribuida a Richard Ramirez, Asesino en serie conocido como «The Night Stalker»'
  };
  let story = { ...defaultStory };
  function parseStory(text) {
    const parsed = {}; let key = '';
    text.split(/\r?\n/).forEach(line => {
      const header = line.match(/^\[([A-Z0-9_]+)\]$/);
      if (header) { key = header[1]; parsed[key] = ''; }
      else if (key && !line.startsWith('#')) parsed[key] += (parsed[key] ? '\n' : '') + line;
    });
    Object.keys(parsed).forEach(name => { parsed[name] = parsed[name].trim(); });
    return parsed;
  }
  const storyReady = window.fetch
    ? fetch('historia-juego.txt', { cache: 'no-store' }).then(response => response.ok ? response.text() : '').then(text => { if (text) story = { ...story, ...parseStory(text) }; }).catch(() => {})
    : Promise.resolve();
  let mode = 'intro', mission = 0, player = { x: 42, y: 188, speed: 112 }, bullets = [], enemyBullets = [], enemies = [], signals = [], rescuedPerson = false;
  let kills = 0, collected = 0, health = 4, spawnTimer = 0, shotTimer = 0;
  let invulnerable = 0, lastFrame = 0, animationId = 0;
  let audio, musicOn = true, musicTimer = null, noteIndex = 0;
  let ambienceOn = false, ambienceSource = null, ambienceGain = null, ambienceLfo = null, ambienceLfoGain = null, ambienceLoading = false;
  let sceneTime = 0;

  function rect(x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }

  function initAudio() {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    if (!audio) audio = new AudioCtx();
    if (audio.state === 'suspended') audio.resume().catch(() => {});
    if (musicOn && !musicTimer) {
      const notes = [196, 247, 294, 247, 220, 262, 330, 262, 196, 247, 294, 370, 330, 294, 247, 220];
      musicTimer = setInterval(() => {
        if (mode !== 'playing' || !musicOn || !audio) return;
        const freq = notes[noteIndex++ % notes.length];
        tone(freq, .105, .026, 'square');
        if (noteIndex % 4 === 0) tone(freq / 2, .16, .034, 'triangle');
      }, 205);
    }
  }

  async function startAmbience() {
    initAudio();
    if (!audio || ambienceSource || ambienceLoading) return;
    ambienceLoading = true;
    try {
      // Use the page's original ambience recording when it contains audio.
      const response = await fetch('audio/ambiente.mp3', { cache: 'no-store' });
      const bytes = response.ok ? await response.arrayBuffer() : new ArrayBuffer(0);
      if (bytes.byteLength) {
        const recording = await audio.decodeAudioData(bytes);
        if (ambienceOn && !ambienceSource) {
          const source = audio.createBufferSource(), gain = audio.createGain();
          source.buffer = recording; source.loop = true; gain.gain.value = .28;
          source.connect(gain); gain.connect(audio.destination); source.start();
          ambienceSource = source; ambienceGain = gain;
          ambienceLoading = false;
          return;
        }
      }
    } catch (_) {}
    ambienceLoading = false;
    if (!ambienceOn || ambienceSource) return;
    try {
      // Empty/missing MP3 fallback: quiet filtered noise with slow surf-like swells.
      const length = audio.sampleRate * 4;
      const buffer = audio.createBuffer(1, length, audio.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * .55;
      const source = audio.createBufferSource();
      const low = audio.createBiquadFilter();
      const high = audio.createBiquadFilter();
      const gain = audio.createGain();
      const lfo = audio.createOscillator();
      const lfoGain = audio.createGain();
      source.buffer = buffer; source.loop = true;
      low.type = 'lowpass'; low.frequency.value = 720;
      high.type = 'highpass'; high.frequency.value = 100;
      gain.gain.value = .012;
      lfo.type = 'sine'; lfo.frequency.value = .09; lfoGain.gain.value = .009;
      lfo.connect(lfoGain); lfoGain.connect(gain.gain);
      source.connect(low); low.connect(high); high.connect(gain); gain.connect(audio.destination);
      source.start(); lfo.start();
      ambienceSource = source; ambienceGain = gain; ambienceLfo = lfo; ambienceLfoGain = lfoGain;
    } catch (_) {}
  }

  function stopAmbience() {
    if (!ambienceSource) return;
    try { ambienceSource.stop(); ambienceLfo?.stop(); } catch (_) {}
    ambienceSource = null; ambienceGain = null; ambienceLfo = null; ambienceLfoGain = null;
  }

  function tone(freq, duration, volume, type = 'square') {
    if (!audio) return;
    try {
      const osc = audio.createOscillator(), gain = audio.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, audio.currentTime);
      gain.gain.setValueAtTime(volume, audio.currentTime);
      gain.gain.exponentialRampToValueAtTime(.001, audio.currentTime + duration);
      osc.connect(gain); gain.connect(audio.destination);
      osc.start(); osc.stop(audio.currentTime + duration);
    } catch (_) {}
  }

  function sfx(kind) {
    if (!audio) return;
    if (kind === 'shot') tone(540, .055, .04);
    if (kind === 'hit') { tone(115, .16, .055, 'sawtooth'); tone(75, .12, .035, 'square'); }
    if (kind === 'pickup') { tone(660, .08, .05); setTimeout(() => tone(990, .12, .04), 75); }
    if (kind === 'clear') { [440, 554, 659, 880].forEach((n, i) => setTimeout(() => tone(n, .14, .045), i * 100)); }
    if (kind === 'betrayal') { tone(220, .45, .06, 'sawtooth'); setTimeout(() => tone(110, .55, .05, 'square'), 220); }
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  }

  function overlayCard(kicker, title, copy, buttonText, action, extra = '') {
    mode = 'overlay';
    overlay.innerHTML = `<div class="arcade-card"><small>${escapeHtml(kicker)}</small><h3>${escapeHtml(title)}</h3><p>${escapeHtml(copy).replace(/\n/g, '<br><br>')}</p>${extra}<button id="arcade-overlay-action" type="button">${escapeHtml(buttonText)} <b>▶</b></button></div>`;
    overlay.classList.remove('is-hidden');
    document.getElementById('arcade-overlay-action').addEventListener('click', action, { once: true });
  }

  function updateHud() {
    missionLabel.textContent = `MISSION ${String(mission).padStart(2, '0')} / 03`;
    healthLabel.textContent = '♥ '.repeat(Math.max(health, 0)).trim() || '—';
    if (!mission) { objectiveLabel.textContent = 'PREPARA EL EQUIPO'; return; }
    if (mission === 1) objectiveLabel.textContent = `SEÑALES ${collected} / 3`;
    if (mission === 2) objectiveLabel.textContent = `TRAFICANTES ${kills} / 8`;
    if (mission === 3) objectiveLabel.textContent = rescuedPerson ? 'LLEGA AL PUNTO DE ENTREGA' : `GUARDIAS ${kills} / 6`;
  }

  function prepareMission(number) {
    mission = number;
    mode = 'playing';
    keys.clear();
    player = { x: 42, y: 188, speed: 112 };
    bullets = []; enemyBullets = []; enemies = []; kills = 0; collected = 0; health = 4;
    spawnTimer = 1.25; shotTimer = 0; invulnerable = 0; rescuedPerson = false;
    signals = number === 1 ? [{ x: 154, y: 147 }, { x: 283, y: 222 }, { x: 405, y: 174 }] : [];
    overlay.classList.add('is-hidden');
    updateHud();
    lastFrame = performance.now();
    cancelAnimationFrame(animationId);
    animationId = requestAnimationFrame(loop);
  }

  async function startGame() {
    initAudio();
    await storyReady;
    mission = 1;
    updateHud();
    overlayCard('MISSION 01 / BRIEFING', story.MISSION_1_TITLE, story.MISSION_1_BRIEF, 'INICIAR MISIÓN 1', () => prepareMission(1));
  }

  function missionClear(next) {
    mode = 'clear'; sfx('clear');
    const line = story[`MISSION_${mission}_CLEAR`];
    overlayCard(`MISSION 0${mission} / CLEAR`, 'MISIÓN COMPLETADA', line, `INICIAR MISIÓN ${next}`, () => {
      mission = next;
      updateHud();
      overlayCard(`MISSION 0${next} / BRIEFING`, story[`MISSION_${next}_TITLE`], story[`MISSION_${next}_BRIEF`], `INICIAR MISIÓN ${next}`, () => prepareMission(next));
    });
  }

  function loseMission() {
    mode = 'gameover'; sfx('hit');
    overlayCard('SIGNAL LOST', 'FIN DEL TURNO', 'El equipo te espera en el punto de inicio. Puedes volver a intentar esta misión.', 'REINTENTAR', () => prepareMission(mission));
  }

  function showBetrayal() {
    mode = 'ending'; sfx('betrayal');
    const attributedQuote = `<blockquote>“${escapeHtml(story.ENDING_QUOTE)}”</blockquote><small class="quote-credit">${escapeHtml(story.QUOTE_CREDIT)}</small><small class="quote-note">${escapeHtml(story.QUOTE_NOTE)}</small>`;
    overlayCard('MISSION 03 / EXTRACTION', story.ENDING_TITLE, story.ENDING_TEXT, 'VOLVER A JUGAR', () => startGame(), attributedQuote);
  }

  function spawnEnemy() {
    const lanes = [137, 171, 204, 226];
    const lane = lanes[Math.floor(Math.random() * lanes.length)];
    const baseSpeed = mission === 1 ? 25 : mission === 2 ? 28 : 24;
    const hp = mission === 3 ? 3 : mission === 1 ? 1 : 2;
    enemies.push({ x: W + 8, y: lane, speed: baseSpeed + Math.random() * 8, hp, maxHp: hp, fireTimer: 1.3 + Math.random() * .8, alive: true });
  }

  function update(dt) {
    if (mode !== 'playing') return;
    const speed = player.speed * dt;
    if (keys.has('left')) player.x -= speed;
    if (keys.has('right')) player.x += speed;
    if (keys.has('up')) player.y -= speed;
    if (keys.has('down')) player.y += speed;
    player.x = Math.max(12, Math.min(W - 26, player.x));
    player.y = Math.max(116, Math.min(H - 34, player.y));
    shotTimer -= dt; spawnTimer -= dt; invulnerable -= dt;
    if (keys.has('fire') && shotTimer <= 0) {
      bullets.push({ x: player.x + 18, y: player.y + 8, speed: 240 });
      shotTimer = .36; sfx('shot');
    }
    const spawnCap = mission === 1 ? 2 : 3;
    const targetDone = mission === 1 ? collected >= 3 : mission === 2 ? kills >= 8 : kills >= 6;
    if (!targetDone && enemies.length < spawnCap && spawnTimer <= 0) {
      spawnEnemy(); spawnTimer = mission === 1 ? 2.25 : 1.85;
    }
    bullets.forEach(b => b.x += b.speed * dt);
    bullets = bullets.filter(b => b.x < W + 8);
    enemyBullets.forEach(b => b.x -= b.speed * dt);
    enemyBullets.forEach(bullet => {
      if (!bullet.dead && invulnerable <= 0 && bullet.x < player.x + 18 && bullet.x > player.x - 5 && Math.abs(bullet.y - (player.y + 10)) < 10) {
        bullet.dead = true; health--; invulnerable = .9; sfx('hit'); updateHud();
        if (health <= 0) loseMission();
      }
    });
    enemyBullets = enemyBullets.filter(b => !b.dead && b.x > -8);
    enemies.forEach(enemy => {
      enemy.x -= enemy.speed * dt;
      enemy.fireTimer -= dt;
      if (enemy.fireTimer <= 0 && enemy.x < W - 10) {
        enemyBullets.push({ x: enemy.x - 2, y: enemy.y + 11, speed: mission === 1 ? 85 : 100 });
        enemy.fireTimer = 2.3 + Math.random() * .6;
      }
      bullets.forEach(bullet => {
        if (enemy.alive && bullet.x > enemy.x - 8 && bullet.x < enemy.x + 16 && Math.abs(bullet.y - enemy.y) < 14) {
          enemy.hp--; bullet.x = W + 20;
          if (enemy.hp <= 0) { enemy.alive = false; kills++; sfx('hit'); updateHud(); }
        }
      });
      if (enemy.alive && invulnerable <= 0 && Math.abs(enemy.x - player.x) < 18 && Math.abs(enemy.y - player.y) < 17) {
        enemy.alive = false; health--; invulnerable = 1.1; sfx('hit'); updateHud();
        if (health <= 0) loseMission();
      }
    });
    enemies = enemies.filter(e => e.alive && e.x > -20);
    if (mission === 1) {
      signals.forEach(signal => {
        if (!signal.taken && Math.abs(signal.x - player.x) < 17 && Math.abs(signal.y - player.y) < 17) {
          signal.taken = true; collected++; sfx('pickup'); updateHud();
        }
      });
      if (collected >= 3) missionClear(2);
    } else if (mission === 2 && kills >= 8) {
      missionClear(3);
    } else if (mission === 3) {
      if (kills >= 6) rescuedPerson = true;
      updateHud();
      if (rescuedPerson && Math.abs(player.x - 433) < 21 && Math.abs(player.y - 215) < 23) showBetrayal();
    }
  }

  function drawBackground() {
    rect(0, 0, W, H, '#101e2b');
    rect(0, 0, W, 104, '#152739');
    for (let i = 0; i < 28; i++) {
      const x = (i * 83 + 19) % W, y = (i * 37 + 17) % 94;
      rect(x, y, i % 4 === 0 ? 3 : 2, 2, i % 3 === 0 ? '#ffd56b' : '#a6cbd3');
    }
    rect(388, 28, 17, 17, '#f6c968'); rect(393, 24, 17, 17, '#152739');
    if (mission === 0 || mission === 1) {
      rect(0, 180, W, 40, '#174b59'); rect(0, 213, W, 57, '#102e3d');
      const drift = (sceneTime * 15) % 22;
      for (let x = -22; x < W + 22; x += 22) {
        const waveX = x - drift;
        rect(waveX, 215 + ((x / 22) % 3) * 2, 13, 2, '#2a7180');
        rect(waveX + 7, 229 + Math.sin(sceneTime * 1.4 + x * .04) * 2, 9, 2, '#235d72');
        rect(waveX + 2, 239 + Math.sin(sceneTime * 1.1 + x * .03) * 2, 7, 1, '#397987');
      }
      drawBoat();
      rect(0, 190, 130, 8, '#76563a'); rect(18, 198, 5, 28, '#65472f'); rect(108, 198, 5, 28, '#65472f');
      rect(337, 196, 116, 7, '#66503c'); rect(350, 203, 5, 20, '#57402f'); rect(438, 203, 5, 20, '#57402f');
      rect(32, 104, 5, 63, '#315b4c'); rect(17, 100, 39, 5, '#315b4c'); rect(17, 91, 22, 5, '#315b4c');
    } else if (mission === 2) {
      rect(0, 195, W, 75, '#263943'); rect(0, 217, W, 53, '#162832');
      for (let x = 20; x < W; x += 110) { rect(x, 104, 72, 91, x % 2 ? '#814b43' : '#9b5f42'); rect(x + 6, 111, 58, 3, '#d38b53'); rect(x + 8, 121, 4, 62, '#633d38'); }
      [190, 284, 378].forEach((x, i) => { rect(x, 204, 12, 17, '#e3bf83'); rect(x + 3, 196, 7, 9, '#e1b987'); rect(x + 2, 221, 4, 8, '#263943'); rect(x + 8, 221, 4, 8, '#263943'); });
    } else {
      rect(0, 198, W, 72, '#253b47'); rect(0, 222, W, 48, '#152a35');
      for (let x = 0; x < W; x += 32) { rect(x, 112, 4, 87, '#42606a'); rect(x, 113, 32, 4, '#42606a'); }
      rect(350, 116, 112, 82, '#303f4b'); rect(359, 125, 92, 65, '#17232e');
      rect(393, 132, 30, 4, '#ef534f'); rect(404, 144, 7, 31, '#d2b488'); rect(399, 150, 17, 20, '#48b9a0');
    }
    // Subtle CRT scan lines are drawn into the pixel canvas itself.
    for (let y = 0; y < H; y += 4) rect(0, y, W, 1, 'rgba(6,18,28,.34)');
  }

  function drawBoat() {
    if (mission !== 0 && mission !== 1) return;
    const x = W + 45 - ((sceneTime * 12) % (W + 105));
    const y = 169 + Math.sin(sceneTime * 1.6) * 2;
    // Small fishing launch cruises behind the dock foreground.
    rect(x + 2, y + 9, 40, 5, '#172a34'); rect(x + 7, y + 14, 29, 2, '#d49b5b');
    rect(x + 8, y + 5, 19, 4, '#9d7853'); rect(x + 18, y + 1, 9, 5, '#ded0ad');
    rect(x + 21, y + 2, 3, 3, '#5aa8a1'); rect(x + 36, y + 8, 4, 2, '#e6bd68');
    rect(x - 3, y + 16, 50, 1, 'rgba(128,211,218,.45)');
  }

  function drawPlayer() {
    if (invulnerable > 0 && Math.floor(performance.now() / 90) % 2) return;
    const x = player.x, y = player.y;
    rect(x + 4, y, 9, 7, '#e6b887'); rect(x + 3, y - 2, 11, 3, '#d5dadd');
    rect(x + 2, y + 7, 13, 9, '#4abca6'); rect(x + 13, y + 9, 8, 3, '#cfd7d0');
    rect(x + 3, y + 16, 5, 6, '#26394a'); rect(x + 10, y + 16, 5, 6, '#26394a');
    rect(x + 18, y + 7, 8, 3, '#d6e5dd');
  }

  function drawEnemy(enemy) {
    const x = enemy.x, y = enemy.y;
    rect(x, y - 7, 18, 3, '#351e2a'); rect(x + 1, y - 6, 16 * enemy.hp / enemy.maxHp, 1, '#ff856c');
    rect(x + 3, y, 10, 8, '#c9896c'); rect(x + 1, y - 2, 14, 4, '#342d3d');
    rect(x, y + 8, 16, 11, '#bc4d50'); rect(x + 11, y + 10, 13, 3, '#e7c589');
    rect(x + 2, y + 18, 5, 5, '#34313a'); rect(x + 10, y + 18, 5, 5, '#34313a');
  }

  function draw() {
    drawBackground();
    signals.forEach(signal => { if (!signal.taken) { rect(signal.x - 5, signal.y - 5, 11, 11, '#ffd35d'); rect(signal.x - 2, signal.y - 2, 5, 5, '#fff2a4'); } });
    bullets.forEach(bullet => rect(bullet.x, bullet.y, 8, 3, '#fff07a'));
    enemyBullets.forEach(bullet => { rect(bullet.x, bullet.y, 6, 4, '#ff6c62'); rect(bullet.x + 2, bullet.y + 1, 2, 2, '#ffd1a0'); });
    enemies.forEach(enemy => drawEnemy(enemy));
    if (mission === 3 && rescuedPerson) {
      rect(420, 201, 12, 11, '#e6b887'); rect(418, 199, 15, 4, '#242632'); rect(418, 212, 16, 12, '#8b80c5'); rect(420, 224, 5, 5, '#d6d0c5'); rect(429, 224, 5, 5, '#d6d0c5');
      rect(392, 188, 2, 38, '#ffd35d'); rect(454, 188, 2, 38, '#ffd35d'); rect(392, 188, 64, 2, '#ffd35d');
    }
    drawPlayer();
  }

  function loop(now) {
    const dt = Math.min((now - lastFrame) / 1000 || 0, .04);
    lastFrame = now;
    sceneTime += dt;
    update(dt);
    draw();
    animationId = requestAnimationFrame(loop);
  }

  function setControl(control, pressed) {
    if (pressed) keys.add(control); else keys.delete(control);
  }

  document.addEventListener('keydown', event => {
    const map = { ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right', ArrowUp: 'up', w: 'up', W: 'up', ArrowDown: 'down', s: 'down', S: 'down', ' ': 'fire', x: 'fire', X: 'fire' };
    const control = map[event.key];
    if (control) { event.preventDefault(); setControl(control, true); }
  });
  document.addEventListener('keyup', event => {
    const map = { ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right', ArrowUp: 'up', w: 'up', W: 'up', ArrowDown: 'down', s: 'down', S: 'down', ' ': 'fire', x: 'fire', X: 'fire' };
    if (map[event.key]) setControl(map[event.key], false);
  });
  window.addEventListener('blur', () => keys.clear());
  document.querySelectorAll('[data-control]').forEach(button => {
    const control = button.dataset.control;
    button.addEventListener('pointerdown', event => { event.preventDefault(); button.setPointerCapture?.(event.pointerId); setControl(control, true); });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(name => button.addEventListener(name, () => setControl(control, false)));
  });
  document.getElementById('arcade-start').addEventListener('click', event => { event.currentTarget.disabled = true; startGame(); });
  storyReady.then(() => {
    if (mode !== 'intro') return;
    const title = document.getElementById('arcade-intro-title');
    const copy = document.getElementById('arcade-intro-text');
    if (title) title.textContent = story.INTRO_TITLE;
    if (copy) copy.textContent = story.INTRO_TEXT;
  });
  musicButton.addEventListener('click', () => {
    musicOn = !musicOn;
    musicButton.textContent = musicOn ? '♫ MUSIC: ON' : '♫ MUSIC: OFF';
    musicButton.setAttribute('aria-pressed', String(musicOn));
    if (musicOn) initAudio();
  });
  ambienceButton.addEventListener('click', () => {
    ambienceOn = !ambienceOn;
    ambienceButton.textContent = ambienceOn ? '🌊 AMBIENTE: ON' : '🌊 AMBIENTE: OFF';
    ambienceButton.setAttribute('aria-pressed', String(ambienceOn));
    if (ambienceOn) startAmbience(); else stopAmbience();
  });
  updateHud();
  drawBackground();
  drawPlayer();
})();


