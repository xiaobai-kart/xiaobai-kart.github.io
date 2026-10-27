// 主程序：初始化、输入、镜头、比赛流程、界面
(function () {
  const T = window.TRACK, Z = T.ZONES, A = window.AUDIO;
  const { Racer, aiInput, clamp, angDiff } = window.KART;
  const $ = id => document.getElementById(id);
  const isTouch = window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  const Q = { mobile: isTouch };
  const settings = { diff: 'normal', laps: 2, color: 'red', steer: 'btn' };
  const SKILL = { easy: 0.84, normal: 0.93, hard: 1.0 };

  let renderer, scene, camera, items, racers = [], player = null;
  let state = 'loading', stateT = 0, raceT = 0, clockT = 0, lastZone = '', camYaw = 0, finishShown = false;
  let throttleDownAt = -1, countLast = 0;

  // ---------- 输入 ----------
  const keys = {};
  const touch = { left: false, right: false, drift: false, brake: false };
  let gyroSteer = 0;
  const pressed = { item: false, nitro: false };
  addEventListener('keydown', e => {
    if (e.repeat) { keys[e.code] = true; return; }
    keys[e.code] = true;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    if (state === 'intro') { skipIntro(); return; }
    if (e.code === 'Escape' || e.code === 'KeyP') { if (state === 'race' || state === 'countdown') pause(); else if (state === 'paused') resume(); }
    if (e.code === 'KeyE' || e.code === 'ControlLeft' || e.code === 'ControlRight' || e.code === 'KeyF') pressed.item = true;
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') pressed.nitro = true;
  });
  addEventListener('keyup', e => { keys[e.code] = false; });
  addEventListener('blur', () => { for (const k in keys) keys[k] = false; if (state === 'race') pause(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'race') pause(); });

  function bindTouch(id, on, off) {
    const el = $(id);
    const down = e => { e.preventDefault(); el.classList.add('on'); on(); };
    const up = e => { e.preventDefault(); el.classList.remove('on'); off && off(); };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('pointerleave', up);
  }
  bindTouch('tLeft', () => touch.left = true, () => touch.left = false);
  bindTouch('tRight', () => touch.right = true, () => touch.right = false);
  bindTouch('tDrift', () => touch.drift = true, () => touch.drift = false);
  bindTouch('tBrake', () => touch.brake = true, () => touch.brake = false);
  bindTouch('tItem', () => pressed.item = true);
  bindTouch('tNitro', () => pressed.nitro = true);

  function onMotion(e) {
    const g = e.accelerationIncludingGravity; if (!g) return;
    const ang = (screen.orientation && screen.orientation.angle) || window.orientation || 0;
    const v = (ang === 90 ? g.y : ang === -90 || ang === 270 ? -g.y : g.x);
    const sign = settings.steer === 'gyroR' ? -1 : 1;
    gyroSteer = clamp(v / 4.5, -1, 1) * sign;
  }
  function enableGyro() {
    const DME = window.DeviceMotionEvent;
    if (DME && typeof DME.requestPermission === 'function') {
      DME.requestPermission().then(r => { if (r === 'granted') addEventListener('devicemotion', onMotion); }).catch(() => {});
    } else addEventListener('devicemotion', onMotion);
  }

  function playerInput() {
    const kL = keys.ArrowLeft || keys.KeyA, kR = keys.ArrowRight || keys.KeyD;
    let steer = (kR ? 1 : 0) - (kL ? 1 : 0);
    if (touch.right) steer += 1; if (touch.left) steer -= 1;
    if (isTouch && settings.steer !== 'btn' && !touch.left && !touch.right) steer = Math.abs(gyroSteer) > 0.08 ? gyroSteer : 0;
    steer = clamp(steer, -1, 1);
    const brake = !!(keys.ArrowDown || keys.KeyS || touch.brake);
    const throttle = !brake && !!(keys.ArrowUp || keys.KeyW || isTouch);
    const drift = !!(keys.Space || touch.drift);
    return { steer, throttle, brake, drift };
  }

  // ---------- 比赛对象 ----------
  const race = {
    get racers() { return racers; },
    get items() { return items; },
    ranking() {
      return racers.slice().sort((a, b) => {
        if (a.finished && b.finished) return a.finishTime - b.finishTime;
        if (a.finished) return -1; if (b.finished) return 1;
        return b.dist - a.dist;
      });
    },
    rankOf(r) { return this.ranking().indexOf(r) + 1; },
    rubber(r) {
      if (r.isPlayer || !player) return 1;
      const gap = r.dist - player.dist;
      return 1 - clamp(gap / 1400, -0.1, 0.07);
    },
    event(type, target, attacker, kind) {
      const nm = kind ? ITEMS.ITEMS[kind].name : '';
      if (type === 'hit') {
        if (target === player) { toast(`被${attacker.name}的${nm}击中！`, 'bad'); A.sfx('hit'); shake = 0.5; }
        else if (attacker === player) { toast(`${nm}命中${target.name}！`, 'good'); A.sfx('block'); }
      } else if (type === 'blocked') {
        if (target === player) { toast('🛡️ 护盾挡住了攻击！', 'info'); A.sfx('block'); }
        else if (attacker === player) toast(`${target.name}的护盾挡住了`, 'info');
      } else if (type === 'magnet') {
        if (target === player) toast(`被${attacker.name}的磁铁吸住！`, 'bad');
        else if (attacker === player) toast(`🧲 吸住了${target.name}！`, 'good');
      }
    },
    sfx(name, r) { if (!r || r === player) A.sfx(name); }
  };
  let shake = 0;

  // ---------- 界面 ----------
  const ord = n => n + (n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th');
  const fmt = t => { if (!isFinite(t)) return '--:--.--'; const m = Math.floor(t / 60), s = t - m * 60; return `${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`; };
  function toast(text, cls = '') {
    const d = document.createElement('div'); d.className = 'toast ' + cls; d.textContent = text;
    const box = $('toasts'); box.appendChild(d);
    while (box.children.length > 3) box.removeChild(box.firstChild);
    setTimeout(() => d.remove(), 2200);
  }
  function center(text, popIt = true) {
    const el = $('centerMsg'); el.textContent = text;
    if (popIt) { el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); }
  }
  let zoneTimer = 0;
  function zoneToast(z) {
    const el = $('zoneToast'); el.textContent = `${Z[z].icon} ${Z[z].name}`; el.classList.add('show');
    clearTimeout(zoneTimer); zoneTimer = setTimeout(() => el.classList.remove('show'), 2300);
  }

  const headURL = {};
  function headIcon(color) {
    if (!headURL[color.id]) headURL[color.id] = KID.figureURL(color, { legs: false, k: 1 });
    return headURL[color.id];
  }

  // 小地图
  const mm = { base: null, minX: 0, minZ: 0, sc: 1 };
  function buildMinimap() {
    const cv = $('minimap'), W = cv.width, H = cv.height;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const s of T.S) { minX = Math.min(minX, s.p.x); maxX = Math.max(maxX, s.p.x); minZ = Math.min(minZ, s.p.z); maxZ = Math.max(maxZ, s.p.z); }
    const sc = (W - 40) / Math.max(maxX - minX, maxZ - minZ);
    Object.assign(mm, { minX, minZ, sc, ox: (W - (maxX - minX) * sc) / 2, oz: (H - (maxZ - minZ) * sc) / 2 });
    const off = KID.canvas(W, H), g = off.getContext('2d');
    const zc = { town: '#fca5a5', beach: '#7dd3fc', tunnel: '#22d3ee', flower: '#f9a8d4', forest: '#86efac', bridge: '#fdba74', castle: '#c4b5fd', park: '#fde68a' };
    g.lineCap = 'round'; g.lineJoin = 'round';
    g.strokeStyle = 'rgba(0,0,0,.55)'; g.lineWidth = 14; g.beginPath();
    T.S.forEach((s, i) => { const [x, y] = mmXY(s.p.x, s.p.z); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.closePath(); g.stroke();
    g.lineWidth = 8;
    for (let i = 0; i < T.N; i++) {
      const a = T.S[i], b = T.S[(i + 1) % T.N];
      g.strokeStyle = zc[a.zone]; g.beginPath();
      g.moveTo(...mmXY(a.p.x, a.p.z)); g.lineTo(...mmXY(b.p.x, b.p.z)); g.stroke();
    }
    const [sx, sy] = mmXY(T.S[0].p.x, T.S[0].p.z);
    g.fillStyle = '#fff'; g.fillRect(sx - 9, sy - 3, 18, 6);
    mm.base = off;
  }
  function mmXY(x, z) { return [mm.ox + (x - mm.minX) * mm.sc, mm.oz + (z - mm.minZ) * mm.sc]; }
  function drawMinimap() {
    const cv = $('minimap'), g = cv.getContext('2d');
    g.clearRect(0, 0, cv.width, cv.height); g.drawImage(mm.base, 0, 0);
    for (const r of racers) {
      if (r === player) continue;
      const [x, y] = mmXY(r.pos.x, r.pos.z);
      g.fillStyle = r.color.css; g.strokeStyle = '#fff'; g.lineWidth = 3;
      g.beginPath(); g.arc(x, y, 9, 0, 7); g.fill(); g.stroke();
    }
    for (const b of items.bombs) { const [x, y] = mmXY(b.m.position.x, b.m.position.z); g.fillStyle = '#60a5fa'; g.beginPath(); g.arc(x, y, 5, 0, 7); g.fill(); }
    if (player) {
      const [x, y] = mmXY(player.pos.x, player.pos.z);
      g.save(); g.translate(x, y); g.rotate(-player.heading);
      g.fillStyle = '#ffe066'; g.strokeStyle = '#7c2d12'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(0, -15); g.lineTo(11, 11); g.lineTo(0, 5); g.lineTo(-11, 11); g.closePath(); g.fill(); g.stroke();
      g.restore();
    }
  }

  let lastRankHTML = '';
  function updateHUD() {
    const rk = race.ranking();
    const html = rk.map((r, i) => `<div class="rk${r === player ? ' me' : ''}"><span class="n">${i + 1}</span><img src="${headIcon(r.color)}">${r === player ? '我' : r.name}${r.finished ? ' 🏁' : ''}</div>`).join('');
    if (html !== lastRankHTML) { $('rankList').innerHTML = html; lastRankHTML = html; }
    const myRank = rk.indexOf(player) + 1;
    $('rankBig').innerHTML = `${myRank}<small>${ord(myRank).slice(-2)}</small>`;
    $('lapInfo').textContent = `圈 ${Math.min(settings.laps, Math.max(1, player.lap))}/${settings.laps}`;
    $('timer').textContent = fmt(raceT) + (isFinite(player.bestLap) ? `  最快 ${fmt(player.bestLap)}` : '');
    const kmh = Math.round(Math.abs(player.speed) * 3.6);
    $('spd').textContent = kmh; $('spd2').textContent = kmh;
    const nw = (player.nitro * 100).toFixed(0) + '%';
    document.querySelector('#nitroBar i').style.width = nw; $('nbar2').style.width = nw;
    const nc = '🔥'.repeat(player.nitroCount) + '<span style="opacity:.3">' + '🔥'.repeat(2 - player.nitroCount) + '</span>';
    $('nitroCnt').innerHTML = nc; $('nitroCnt2').innerHTML = nc;
    const slot = $('itemSlot');
    if (player.rollT > 0) {
      const keysI = Object.keys(ITEMS.ITEMS);
      slot.textContent = ITEMS.ITEMS[keysI[Math.floor(clockT * 14) % keysI.length]].icon; slot.classList.remove('ready'); $('itemName').textContent = '抽取中…';
    } else if (player.item) {
      slot.textContent = ITEMS.ITEMS[player.item].icon; slot.classList.add('ready');
      $('itemName').textContent = ITEMS.ITEMS[player.item].name + (isTouch ? '' : '  [E]');
    } else { slot.textContent = ''; slot.classList.remove('ready'); $('itemName').textContent = ''; }
    const fwd = angDiff(player.heading, T.S[player.idx].heading);
    $('wrongWay').classList.toggle('hidden', !(Math.abs(fwd) > 2.1 && Math.abs(player.speed) > 4 && state === 'race'));
    drawMinimap();
  }

  // ---------- 流程 ----------
  function show(id, on) { $(id).classList.toggle('hidden', !on); }

  function setupMenu() {
    const sw = $('swatches');
    KID.COLORS.forEach(c => {
      const b = document.createElement('button'); b.style.background = c.css; b.title = c.name; b.dataset.v = c.id;
      if (c.id === settings.color) b.classList.add('on');
      b.onclick = () => { settings.color = c.id; [...sw.children].forEach(x => x.classList.toggle('on', x === b)); updateHero(); A.sfx('click'); };
      sw.appendChild(b);
    });
    const seg = (id, key, conv) => $(id).querySelectorAll('button').forEach(b => b.onclick = () => {
      settings[key] = conv ? conv(b.dataset.v) : b.dataset.v;
      $(id).querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); A.sfx('click');
    });
    seg('segDiff', 'diff'); seg('segLaps', 'laps', Number); seg('segSteer', 'steer');
    if (isTouch) {
      document.querySelectorAll('.touch-only').forEach(e => e.classList.remove('hidden'));
      document.querySelectorAll('.desk-only').forEach(e => e.classList.add('hidden'));
      document.body.classList.add('touchmode');
    }
    $('startBtn').onclick = () => {
      A.init(); A.sfx('click');
      if (isTouch && settings.steer !== 'btn') enableGyro();
      if (isTouch && document.documentElement.requestFullscreen && !document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
      startRace();
    };
    $('resumeBtn').onclick = resume;
    $('restartBtn').onclick = () => { show('pause', false); startRace(); };
    $('menuBtn').onclick = toMenu; $('resMenuBtn').onclick = toMenu;
    $('againBtn').onclick = () => { show('results', false); startRace(); };
    $('pauseBtn').onclick = () => { if (state === 'race' || state === 'countdown') pause(); };
    $('muteBtn').onclick = () => { A.setMuted(!A.muted); $('muteBtn').textContent = A.muted ? '🔇' : '🔊'; };
    $('gl').addEventListener('pointerdown', () => { if (state === 'intro') skipIntro(); });
    updateHero();
  }
  function updateHero() {
    const c = KID.COLORS.find(x => x.id === settings.color);
    $('heroImg').src = KID.kartURL(c, 'front34');
  }

  function toMenu() {
    state = 'menu';
    show('pause', false); show('results', false); show('hud', false); show('touch', false); show('menu', true);
    A.music(false); A.engine(0, false, false); A.drift(false);
  }
  function pause() { if (state !== 'race' && state !== 'countdown') return; pausedFrom = state; state = 'paused'; show('pause', true); A.engine(0, false, false); A.drift(false); }
  let pausedFrom = 'race';
  function resume() { show('pause', false); state = pausedFrom; }

  function startRace() {
    for (const r of racers) { scene.remove(r.root); scene.remove(r.shadow); }
    const pc = KID.COLORS.find(c => c.id === settings.color);
    const others = KID.COLORS.filter(c => c !== pc);
    const base = SKILL[settings.diff];
    racers = [];
    const slots = [[-8, -3.6], [-8, 3.6], [-15, -3.6], [-15, 3.6], [-22, -3.6], [-22, 3.6]];
    const playerSlot = 4;
    let ai = 0;
    slots.forEach((sl, i) => {
      let r;
      if (i === playerSlot) { r = new Racer(scene, pc, { player: true, name: '我' }); player = r; }
      else {
        const c = others[ai++];
        r = new Racer(scene, c, { skill: base + (ai === 1 ? 0.04 : (Math.random() - 0.5) * 0.05), name: c.name });
      }
      r.reset(sl[0], sl[1]);
      racers.push(r);
    });
    items.reset();
    raceT = 0; finishShown = false; lastZone = ''; throttleDownAt = -1;
    camYaw = player.heading;
    show('menu', false); show('results', false); show('pause', false); show('hud', true);
    show('touch', false); show('skipHint', true);
    $('centerMsg').textContent = ''; $('toasts').innerHTML = '';
    state = 'intro'; stateT = 0;
    A.music(true);
  }
  function skipIntro() {
    if (state !== 'intro') return;
    state = 'countdown'; stateT = 0; countLast = 0;
    show('skipHint', false); show('touch', isTouch);
    camYaw = player.heading; camDist = 6.6; camH = player.pos.y + 3.1;
  }

  // ---------- 镜头 ----------
  const _look = new THREE.Vector3(), _cp = new THREE.Vector3();
  let camDist = 6.6, camH = 3;
  function chaseCam(dt) {
    const r = player;
    camYaw += angDiff(r.heading, camYaw) * Math.min(1, dt * (r.drift ? 3.2 : 5));
    const boost = r.boostT > 0;
    camDist += ((6.6 + (boost ? 1.4 : 0) + clamp(r.speed / 44, 0, 1) * 0.6) - camDist) * Math.min(1, dt * 3);
    const hgt = 3.1 + (r.stunT > 0 ? 1.2 : 0);
    _cp.set(r.pos.x + Math.sin(camYaw) * camDist, 0, r.pos.z + Math.cos(camYaw) * camDist);
    camH += ((r.pos.y + hgt) - camH) * Math.min(1, dt * 6);
    _cp.y = Math.max(camH, T.S[r.idx].y + 1.4);
    camera.position.copy(_cp);
    if (shake > 0) { shake -= dt; camera.position.x += (Math.random() - 0.5) * shake; camera.position.y += (Math.random() - 0.5) * shake; }
    _look.set(r.pos.x - Math.sin(camYaw) * 5, r.pos.y + 1.5, r.pos.z - Math.cos(camYaw) * 5);
    camera.lookAt(_look);
    const fov = 66 + clamp(r.speed / 62, 0, 1) * 10 + (boost ? 6 : 0);
    if (Math.abs(camera.fov - fov) > 0.05) { camera.fov += (fov - camera.fov) * Math.min(1, dt * 4); camera.updateProjectionMatrix(); }
  }
  function introCam(dt) {
    const dur = 9;
    const u = Math.min(1, stateT / dur);
    const e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
    const s = e * T.L;
    const a = T.at(s), b = T.at(s + 90);
    const side = Math.sin(u * Math.PI * 4) * 30;
    camera.position.set(a.p.x + a.r.x * side, Math.max(a.p.y, b.p.y) + 34 - Math.sin(u * Math.PI) * 6, a.p.z + a.r.z * side);
    camera.lookAt(b.p.x, b.p.y, b.p.z);
    if (a.zone !== lastZone) { lastZone = a.zone; zoneToast(a.zone); }
    if (camera.fov !== 70) { camera.fov = 70; camera.updateProjectionMatrix(); }
    if (u >= 1) skipIntro();
    return a.zone;
  }

  // ---------- 主循环 ----------
  function processEvents(r) {
    for (const ev of r.events) {
      if (r !== player) continue;
      if (ev.type === 'boost') A.sfx('boost');
      else if (ev.type === 'nitroGet') { A.sfx('nitroGet'); toast('🔥 氮气 +1（按 ' + (isTouch ? '氮气' : 'Shift') + '）', 'info'); }
      else if (ev.type === 'wall') { A.sfx('wall'); shake = Math.max(shake, 0.25); }
      else if (ev.type === 'itemRoll') A.sfx('roll');
      else if (ev.type === 'itemReady') A.sfx('item');
      else if (ev.type === 'land') A.sfx('land');
    }
    r.events.length = 0;
  }

  function collide() {
    for (let i = 0; i < racers.length; i++) for (let j = i + 1; j < racers.length; j++) {
      const a = racers[i], b = racers[j];
      const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, d2 = dx * dx + dz * dz;
      if (d2 < 6.2 && d2 > 1e-4 && Math.abs(a.pos.y - b.pos.y) < 2) {
        const d = Math.sqrt(d2), push = (2.5 - d) / 2, nx = dx / d, nz = dz / d;
        a.pos.x -= nx * push; a.pos.z -= nz * push; b.pos.x += nx * push; b.pos.z += nz * push;
        const avg = (a.speed + b.speed) / 2;
        a.speed += (avg - a.speed) * 0.25; b.speed += (avg - b.speed) * 0.25;
        if ((a === player || b === player) && Math.random() < 0.3) A.sfx('wall');
      }
    }
  }

  function updateRace(dt) {
    raceT += dt;
    const L = T.L;
    for (const r of racers) {
      let inp;
      if (r === player && !r.finished) {
        inp = playerInput();
        if (pressed.item) { items.use(player, race); }
        if (pressed.nitro) { if (!player.useNitro()) toast('没有氮气：先漂移积攒', ''); }
      } else {
        inp = aiInput(r, race, raceT, dt);
        if (inp.nitro) r.useNitro();
        if (r !== player) items.aiUse(r, race);
      }
      r.update(dt, inp, race);
      const lapNow = Math.floor(r.dist / L) + 1;
      if (lapNow > r.lap && !r.finished) {
        const lt = raceT - r.lapStart; r.lapStart = raceT; r.lapTimes.push(lt); r.bestLap = Math.min(r.bestLap, lt);
        if (r.lap >= settings.laps) {
          r.finished = true; r.finishTime = raceT;
          if (r === player) onPlayerFinish();
        } else {
          r.lap = lapNow;
          if (r === player) {
            A.sfx('lap');
            if (r.lap === settings.laps) { center('最后一圈！'); setTimeout(() => { if ($('centerMsg').textContent === '最后一圈！') center('', false); }, 1600); }
            else toast(`第 ${r.lap} 圈 · 上一圈 ${fmt(lt)}`, 'info');
          }
        }
      }
    }
    pressed.item = pressed.nitro = false;
    collide();
    items.update(dt, clockT, race);
    racers.forEach(processEvents);
  }

  function onPlayerFinish() {
    const rank = race.rankOf(player);
    center(rank === 1 ? '冠军！🏆' : `第 ${rank} 名！`);
    A.sfx('finish');
    show('touch', false);
    for (let i = 0; i < 60; i++) {
      const p = player.pos;
      WORLD.fx.emit(p.x + (Math.random() - 0.5) * 16, p.y + 8 + Math.random() * 6, p.z + (Math.random() - 0.5) * 16, (Math.random() - 0.5) * 4, Math.random() * 4, (Math.random() - 0.5) * 4,
        ['#ff4f6d', '#ffd23f', '#3ee07a', '#38bdf8', '#a855f7'][i % 5], 0.6, 2.5, 4);
    }
    setTimeout(showResults, 3200);
  }

  function showResults() {
    if (state !== 'race') return;
    finishShown = true;
    for (const r of racers) if (!r.finished) {
      const remain = settings.laps * T.L - r.dist;
      r.finishTime = raceT + remain / 38; r.finished = true; r.estimated = true;
    }
    const rk = race.ranking();
    const myRank = rk.indexOf(player) + 1;
    $('resTitle').textContent = myRank === 1 ? '🏆 你是冠军！' : myRank <= 3 ? `🎉 第 ${myRank} 名，登上领奖台！` : `🏁 第 ${myRank} 名，再接再厉！`;
    const order = [1, 0, 2].filter(i => rk[i]);
    const hs = [110, 150, 80], cols = ['#cbd5e1', '#facc15', '#d97706'];
    $('podium').innerHTML = order.map(i => {
      const r = rk[i], h = hs[[1, 0, 2].indexOf(i)];
      return `<div class="pd"><img src="${KID.figureURL(r.color, { k: 2 })}"><div class="nm">${r === player ? '我' : r.name}</div><div class="blk" style="height:${h * 0.5}px;background:${cols[[1, 0, 2].indexOf(i)]}">${i + 1}</div></div>`;
    }).join('');
    $('resTable').innerHTML = rk.map((r, i) => `<tr class="${r === player ? 'me' : ''}"><td>${i + 1}</td><td>${r === player ? '我' : r.name}</td><td>${fmt(r.finishTime)}${r.estimated ? ' *' : ''}</td><td>${isFinite(r.bestLap) ? '最快圈 ' + fmt(r.bestLap) : ''}</td></tr>`).join('');
    show('results', true);
    state = 'results';
  }

  let lastT = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    let dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
    if (state === 'loading') return;
    if (state !== 'paused') clockT += dt;
    stateT += dt;
    let zone = player ? player.zone : 'town';

    if (state === 'menu') {
      const a = T.at(clockT * 14);
      camera.position.set(a.p.x + a.r.x * 26, a.p.y + 16, a.p.z + a.r.z * 26);
      camera.lookAt(a.p.x - a.r.x * 4, a.p.y + 2, a.p.z - a.r.z * 4);
      zone = a.zone;
    } else if (state === 'intro') {
      zone = introCam(dt);
      for (const r of racers) r.render(dt, camera, clockT);
    } else if (state === 'countdown') {
      const left = 3.6 - stateT, n = Math.ceil(left);
      const inp = playerInput();
      if (inp.throttle && throttleDownAt < 0) throttleDownAt = left;
      if (!inp.throttle) throttleDownAt = -1;
      if (n !== countLast && n > 0 && n <= 3) { countLast = n; center(String(n)); A.sfx('count'); }
      if (left <= 0) {
        state = 'race'; center('GO!'); A.sfx('go');
        setTimeout(() => { if ($('centerMsg').textContent === 'GO!') center('', false); }, 900);
        if (throttleDownAt >= 0 && throttleDownAt < 0.7) { player.boost(1.2, 0.9); toast('⚡ 完美起步！', 'good'); }
        for (const r of racers) if (r !== player && Math.random() < 0.5) r.boost(1, 0.8);
      }
      chaseCam(dt);
      for (const r of racers) r.render(dt, camera, clockT);
      updateHUD();
    } else if (state === 'race' || state === 'results') {
      updateRace(dt);
      chaseCam(dt);
      for (const r of racers) r.render(dt, camera, clockT);
      if (state === 'race') updateHUD();
      if (player.zone !== lastZone) { lastZone = player.zone; zoneToast(player.zone); }
      A.engine(player.speed, player.boostT > 0, true);
      A.drift(player.drift && !player.air);
    }
    if (state === 'paused') { for (const r of racers) r.render(0, camera, clockT); }
    WORLD.update(state === 'paused' ? 0 : dt, clockT, camera, zone, scene);
    renderer.render(scene, camera);
  }

  function checkRotate() { show('rotate', isTouch && innerHeight > innerWidth); }
  function onResize() {
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
    checkRotate();
  }

  // ---------- 启动 ----------
  function boot() {
    renderer = new THREE.WebGLRenderer({ canvas: $('gl'), antialias: !Q.mobile, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, Q.mobile ? 1.5 : 2));
    renderer.setSize(innerWidth, innerHeight, false);
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.3, 4200);
    WORLD.build(scene, Q);
    items = new ITEMS.Items(scene);
    buildMinimap();
    setupMenu();
    addEventListener('resize', onResize); checkRotate();
    show('loading', false); show('menu', true);
    state = 'menu';
    requestAnimationFrame(frame);
  }

  window.GAME = {
    get player() { return player; }, race, get state() { return state; },
    teleport(s, lat = 0) { if (player) { player.reset(s, lat); player.dist = s; player.prevS = player.s; camYaw = player.heading; camH = player.pos.y + 3.1; } }
  };

  KID.load().then(() => setTimeout(() => {
    try { boot(); }
    catch (err) { console.error(err); $('loading').innerHTML = '<div>😢 加载失败</div><div class="tiny">' + String(err && err.message || err) + '</div>'; }
  }, 30));
})();
