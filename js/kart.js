// 卡丁车：模型、物理、AI 驾驶
(function () {
  const T = window.TRACK;
  const P = { maxSpeed: 44, accel: 24, boostSpeed: 62, turn: 1.8, reverse: -12 };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const _camDir = new THREE.Vector3();
  const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };
  const wrapS = d => { const L = T.L; d %= L; if (d > L / 2) d -= L; if (d < -L / 2) d += L; return d; };

  let shadowTex = null;
  function getShadowTex() {
    if (shadowTex) return shadowTex;
    const c = KID.canvas(64, 64), g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 4, 32, 32, 30);
    gr.addColorStop(0, 'rgba(0,0,0,.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return (shadowTex = new THREE.CanvasTexture(c));
  }
  let starTex = null;
  const getStarTex = () => starTex || (starTex = new THREE.CanvasTexture(KID.textCanvas('💫⭐💫', { size: 64, pad: 4 })));

  class Racer {
    constructor(scene, color, opts) {
      this.color = color;
      this.isPlayer = !!opts.player;
      this.name = opts.name || color.name;
      this.skill = opts.skill || 1;
      this.scene = scene;
      this.build();
    }

    build() {
      const c = this.color.hex;
      const root = new THREE.Group(), body = new THREE.Group();
      root.rotation.order = 'YXZ'; body.rotation.order = 'YXZ';
      root.add(body);
      // 尾焰
      const flameMat = new THREE.MeshBasicMaterial({ color: 0xffa21f, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
      this.flames = [0.28, -0.28].map(x => {
        const f = new THREE.Mesh(new THREE.ConeGeometry(0.2, 1.4, 8), flameMat);
        f.geometry.translate(0, -0.7, 0); f.rotation.x = -Math.PI / 2; f.position.set(x, 0.62, 2.0); f.visible = false;
        body.add(f); return f;
      });
      // 车：按镜头方位切换五视角贴图（另一侧镜像），上面叠一层车轮动画
      const scale = this.isPlayer ? 1 : 0.6;
      this.views = {}; this.wheelViews = {};
      for (const v of Object.keys(KID.KART_VIEWS)) { this.views[v] = KID.kartTex(this.color, v, scale, true); this.wheelViews[v] = KID.wheelTex(v); }
      this.view = 'rear'; this.wheelPh = 0;
      const tex = this.views.rear;
      this.kart = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, alphaTest: 0.35, side: THREE.DoubleSide }));
      this.kart.center.set(0.5, tex.cy);
      this.kart.scale.set(tex.kw, tex.kh, 1);
      root.add(this.kart);
      this.wheelSpr = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.wheelViews.rear[0], transparent: true, depthWrite: false, side: THREE.DoubleSide }));
      this.wheelSpr.center.copy(this.kart.center);
      root.add(this.wheelSpr);
      // 阴影
      this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 4.4), new THREE.MeshBasicMaterial({ map: getShadowTex(), transparent: true, depthWrite: false }));
      this.shadow.rotation.x = -Math.PI / 2;
      this.scene.add(this.shadow);
      // 护盾 / 水泡 / 星星
      this.shieldMesh = new THREE.Mesh(new THREE.SphereGeometry(2.6, 18, 12), new THREE.MeshPhongMaterial({ color: 0x7df9ff, transparent: true, opacity: 0.28, emissive: 0x0a7d8c, shininess: 100, depthWrite: false }));
      this.shieldMesh.position.y = 1.3; this.shieldMesh.visible = false; root.add(this.shieldMesh);
      this.bubble = new THREE.Mesh(new THREE.SphereGeometry(2.8, 18, 12), new THREE.MeshPhongMaterial({ color: 0x4fb4ff, transparent: true, opacity: 0.45, specular: 0xffffff, shininess: 120, depthWrite: false }));
      this.bubble.position.y = 1.5; this.bubble.visible = false; root.add(this.bubble);
      this.stars = new THREE.Sprite(new THREE.SpriteMaterial({ map: getStarTex(), transparent: true, depthWrite: false }));
      this.stars.scale.set(2.6, 0.9, 1); this.stars.position.y = 4.4; this.stars.visible = false; root.add(this.stars);
      if (!this.isPlayer) {
        this.tag = KID.textSprite(this.name, 0.6, { bg: this.color.css, size: 44, pad: 10 });
        this.tag.position.y = 4.6; root.add(this.tag);
      }
      this.root = root; this.body = body;
      this.scene.add(root);
    }

    reset(s, lat) {
      const a = T.at(s);
      this.pos = a.p.clone().addScaledVector(a.r, lat);
      this.heading = a.heading; this.velAngle = a.heading;
      this.speed = 0; this.vy = 0; this.gvy = 0; this.air = false;
      this.idx = a.i; this.s = (s + T.L) % T.L; this.prevS = this.s; this.dist = s - 0.0001; this.lat = lat;
      this.lap = 1; this.finished = false; this.finishTime = 0; this.lapStart = 0; this.lapTimes = []; this.bestLap = Infinity;
      this.drift = false; this.driftT = 0; this.driftDir = 0; this.steer = 0;
      this.nitro = 0; this.nitroCount = 0; this.boostT = 0; this.boostPow = 1; this.padCd = 0;
      this.item = null; this.rollT = 0; this.pending = null; this.itemHold = 0;
      this.shieldT = 0; this.stunT = 0; this.spinT = 0; this.spinA = 0; this.slowT = 0; this.wallT = 0; this.immune = 0;
      this.zone = a.zone; this.offroad = false; this.events = [];
      this.lane = (lat > 0 ? 1 : -1) * (1.5 + Math.random() * 3); this.ph = Math.random() * 10;
      this.root.position.copy(this.pos);
      this.root.rotation.set(0, this.heading, 0);
      this.body.rotation.set(0, 0, 0);
    }

    boost(t, pow = 1) {
      this.boostPow = this.boostT > 0 ? Math.max(this.boostPow, pow) : pow;
      this.boostT = Math.max(this.boostT, t);
      this.emit('boost');
    }
    useNitro() {
      if (this.nitroCount <= 0 || this.stunT > 0) return false;
      this.nitroCount--; this.boost(2.2, 1); this.emit('nitro');
      return true;
    }
    emit(type, data) { this.events.push({ type, data }); }

    update(dt, inp, race) {
      const FX = WORLD.fx;
      let maxSp = P.maxSpeed * this.skill * (race.rubber ? race.rubber(this) : 1);
      let steerIn = inp.steer, thr = inp.throttle, brk = inp.brake, drf = inp.drift;
      if (this.stunT > 0) { this.stunT -= dt; steerIn = 0; thr = brk = drf = false; this.speed *= Math.max(0, 1 - 5 * dt); }
      if (this.spinT > 0) { this.spinT -= dt; this.spinA += dt * 13; steerIn = 0; thr = false; this.speed *= Math.max(0, 1 - 2.4 * dt); }
      else this.spinA = 0;
      if (this.slowT > 0) { this.slowT -= dt; maxSp *= 0.65; }
      if (this.shieldT > 0) this.shieldT -= dt;
      if (this.immune > 0) this.immune -= dt;
      if (this.padCd > 0) this.padCd -= dt;
      if (this.offroad) maxSp *= 0.62;

      // 速度
      if (this.boostT > 0) {
        this.boostT -= dt;
        const bs = P.boostSpeed * (0.85 + 0.15 * this.boostPow) * Math.min(1.05, this.skill + 0.05);
        this.speed += (bs - this.speed) * Math.min(1, 3.2 * dt);
      } else if (thr) {
        if (this.speed < maxSp) this.speed += P.accel * dt * (1 - 0.6 * Math.max(0, this.speed) / maxSp);
        else this.speed -= (this.speed - maxSp) * Math.min(1, 1.8 * dt);
      } else if (!brk) this.speed *= Math.max(0, 1 - 0.55 * dt);
      if (brk) this.speed = Math.max(P.reverse, this.speed - (this.speed > 0 ? 42 : 14) * dt);

      // 转向与漂移
      this.steer += (steerIn - this.steer) * Math.min(1, dt * 9);
      const spdF = clamp(Math.abs(this.speed) / 9, 0, 1);
      if (drf && !this.drift && Math.abs(steerIn) > 0.3 && this.speed > 16 && !this.air) {
        this.drift = true; this.driftDir = Math.sign(steerIn); this.driftT = 0;
        this.vy = 3.2; this.air = true; this.emit('driftStart');
      }
      let eff = this.steer;
      if (this.drift) {
        this.driftT += dt;
        eff = clamp(this.driftDir * 0.6 + this.steer * 0.65, -1.25, 1.25);
        this.speed -= 2.2 * dt;
        this.nitro += dt * 0.36 * clamp(this.speed / 40, 0.3, 1.2);
        if (this.nitro >= 1) {
          this.nitro -= 1;
          if (this.nitroCount < 2) { this.nitroCount++; this.emit('nitroGet'); }
        }
        if (!drf || this.speed < 11 || this.stunT > 0 || this.spinT > 0) {
          this.drift = false;
          if (this.driftT > 0.75 && this.stunT <= 0) this.boost(0.55, 0.6);
          this.emit('driftEnd');
        }
      }
      const turn = P.turn * (this.drift ? 1.4 : 1) * spdF * (1 - 0.22 * clamp(this.speed / 60, 0, 1));
      this.heading -= eff * turn * dt * (this.speed < 0 ? -1 : 1);
      const grip = this.drift ? 2.3 : this.air ? 1.2 : 9;
      this.velAngle += angDiff(this.heading, this.velAngle) * Math.min(1, grip * dt);

      // 移动
      this.pos.x += -Math.sin(this.velAngle) * this.speed * dt;
      this.pos.z += -Math.cos(this.velAngle) * this.speed * dt;
      let info = T.project(this.pos.x, this.pos.z, this.idx);
      const smp = T.S[info.i];
      const lim = info.w + 0.2;
      if (Math.abs(info.lat) > lim) {
        const push = info.lat - Math.sign(info.lat) * lim;
        this.pos.x -= smp.r.x * push; this.pos.z -= smp.r.z * push;
        if (this.wallT <= 0) {
          this.speed *= 0.72; this.emit('wall');
          for (let i = 0; i < 8; i++) FX.emit(this.pos.x + smp.r.x * Math.sign(info.lat), this.pos.y + 0.8, this.pos.z + smp.r.z * Math.sign(info.lat), (Math.random() - 0.5) * 6, Math.random() * 5, (Math.random() - 0.5) * 6, '#ffd36b', 0.35, 0.5, 12);
        }
        this.wallT = 0.25;
        this.speed *= Math.max(0, 1 - 1.2 * dt);
        if (this.speed > 0) this.heading += angDiff(smp.heading, this.heading) * Math.min(1, 3 * dt);
        info = T.project(this.pos.x, this.pos.z, info.i);
      } else this.wallT -= dt;
      this.offroad = Math.abs(info.lat) > info.w - 0.2;
      this.idx = info.i; this.lat = info.lat; this.zone = info.zone;

      // 高度：贴地 / 腾空
      const gy = info.y;
      if (this.air) {
        this.vy -= 32 * dt; this.pos.y += this.vy * dt;
        if (this.pos.y <= gy) {
          if (this.vy < -8) { this.emit('land'); for (let i = 0; i < 10; i++) FX.emit(this.pos.x, gy + 0.2, this.pos.z, (Math.random() - 0.5) * 8, Math.random() * 3, (Math.random() - 0.5) * 8, '#d6d3d1', 0.6, 0.5, 6); }
          this.pos.y = gy; this.air = false; this.vy = 0;
        }
      } else if (gy < this.pos.y - 0.3) {
        this.air = true; this.vy = Math.max(0, this.gvy); this.pos.y += this.vy * dt;
      } else {
        this.gvy = (gy - this.pos.y) / Math.max(dt, 1e-3);
        this.pos.y = gy;
      }

      // 圈数
      let ds = info.s - this.prevS;
      if (ds < -T.L / 2) ds += T.L; if (ds > T.L / 2) ds -= T.L;
      this.dist += ds; this.prevS = info.s; this.s = info.s;

      // 加速带
      if (this.padCd <= 0 && !this.air) for (const b of T.BOOSTS) {
        if (Math.abs(wrapS(this.s - b.s)) < 4.6 && Math.abs(this.lat) < 3.2) { this.boost(1.3, 0.9); this.padCd = 0.6; break; }
      }

      // 道具抽取
      if (this.rollT > 0) { this.rollT -= dt; if (this.rollT <= 0) { this.item = this.pending; this.pending = null; this.itemHold = 0; this.emit('itemReady'); } }
      if (this.item) this.itemHold += dt;

      // 特效粒子
      if (this.drift && !this.air) {
        const col = this.driftT > 0.75 ? (Math.random() < 0.5 ? '#60a5fa' : '#e0f2fe') : (Math.random() < 0.5 ? '#ffd36b' : '#ff8a3d');
        for (const sx of [1.2, -1.2]) {
          const wx = this.pos.x + Math.cos(this.heading) * sx + Math.sin(this.heading) * 1.4;
          const wz = this.pos.z - Math.sin(this.heading) * sx + Math.cos(this.heading) * 1.4;
          FX.emit(wx, this.pos.y + 0.3, wz, (Math.random() - 0.5) * 3, Math.random() * 3 + 1, (Math.random() - 0.5) * 3, col, 0.28, 0.35, 10);
        }
        if (Math.random() < 0.5) FX.emit(this.pos.x + Math.sin(this.heading) * 1.8, this.pos.y + 0.3, this.pos.z + Math.cos(this.heading) * 1.8, 0, 1, 0, '#e5e7eb', 1.2, 0.6, -1);
      }
      if (this.boostT > 0) {
        const bx = this.pos.x + Math.sin(this.heading) * 2.6, bz = this.pos.z + Math.cos(this.heading) * 2.6;
        FX.emit(bx, this.pos.y + 0.95, bz, Math.sin(this.heading) * 6, 0.5, Math.cos(this.heading) * 6, Math.random() < 0.5 ? '#ff9a1f' : '#ffe14d', 0.6, 0.3, 0);
      }
      if (this.offroad && this.speed > 10 && Math.random() < 0.5) FX.emit(this.pos.x, this.pos.y + 0.3, this.pos.z, (Math.random() - 0.5) * 3, 1.5, (Math.random() - 0.5) * 3, '#b08a5a', 0.8, 0.5, 3);
    }

    render(dt, camera, t) {
      const r = this.root;
      r.position.copy(this.pos);
      if (this.stunT > 0) r.position.y += 1.2 + Math.sin(t * 6) * 0.25;
      r.rotation.y = this.heading + this.spinA;
      const a = T.S[this.idx], b = T.S[(this.idx + 2) % T.N], c = T.S[(this.idx - 2 + T.N) % T.N];
      let pitch = Math.atan((b.y - c.y) / (4 * T.STEP));
      if (this.air) pitch = clamp(this.vy / Math.max(12, Math.abs(this.speed)), -0.35, 0.35);
      r.rotation.x += (pitch - r.rotation.x) * Math.min(1, dt * 10);
      const roll = this.drift ? -this.driftDir * 0.1 : -this.steer * 0.04 * clamp(this.speed / 30, 0, 1);
      r.rotation.z += (roll - r.rotation.z) * Math.min(1, dt * 8);
      const fv = this.boostT > 0;
      this.flames.forEach(f => { f.visible = fv; if (fv) f.scale.set(1, 0.8 + Math.random() * 0.6, 1); });
      // 按镜头相对车头的方位选视角。贴图总是正对镜头平面，只按方位角会让镜头两侧并排的车显得歪着，
      // 所以主要按镜头朝向算，方位角只占一部分
      camera.getWorldDirection(_camDir);
      const dx = camera.position.x - this.pos.x, dz = camera.position.z - this.pos.z;
      const camL = Math.hypot(dx, dz) || 1, fwdL = Math.hypot(_camDir.x, _camDir.z) || 1;
      const vx = 0.3 * dx / camL - 0.7 * _camDir.x / fwdL, vz = 0.3 * dz / camL - 0.7 * _camDir.z / fwdL;
      const H = this.heading + this.spinA;
      const lf = -Math.sin(H) * vx - Math.cos(H) * vz, lr = Math.cos(H) * vx - Math.sin(H) * vz;
      const ang = Math.abs(Math.atan2(lr, lf)) * 180 / Math.PI;
      const CENTER = { front: 0, front34: 45, side: 90, rear34: 135, rear: 180 };
      if (Math.abs(ang - CENTER[this.view]) > 28.5) {
        let best = 'rear', bd = 1e9;
        for (const v in CENTER) { const d = Math.abs(ang - CENTER[v]); if (d < bd) { bd = d; best = v; } }
        this.view = best;
      }
      const native = KID.KART_VIEWS[this.view].side;
      const mirror = !!native && native !== (lr > 0 ? 'R' : 'L');
      const tex = this.views[this.view], m = this.kart.material;
      if (m.map !== tex) { m.map = tex; m.needsUpdate = true; this.kart.center.y = tex.cy; }
      this.kart.scale.set(mirror ? -tex.kw : tex.kw, tex.kh, 1);
      m.rotation = -this.steer * 0.06 + (this.drift ? -this.driftDir * 0.07 : 0);
      const dl = Math.hypot(dx, dz) || 1;
      const bob = (this.boostT > 0 ? Math.sin(t * 40) * 0.03 : 0) + (this.air ? 0 : Math.sin(t * 23 + this.ph) * 0.012 * clamp(this.speed / 30, 0, 1));
      r.updateMatrixWorld();
      const wp = new THREE.Vector3(this.pos.x + dx / dl * 0.6, r.position.y + bob, this.pos.z + dz / dl * 0.6);
      this.kart.position.copy(r.worldToLocal(wp.clone()));
      // 车轮层贴在车贴图前一点点，沿视线前移并等比缩小，屏幕上与车完全重合
      const toCam = camera.position.clone().sub(wp), cd = toCam.length(), k = (cd - 0.05) / cd;
      this.wheelSpr.position.copy(r.worldToLocal(wp.addScaledVector(toCam, 0.05 / cd)));
      this.wheelSpr.scale.set(this.kart.scale.x * k, this.kart.scale.y * k, 1);
      this.wheelSpr.center.y = tex.cy;
      const wm = this.wheelSpr.material;
      wm.rotation = m.rotation;
      const step = Math.PI * 2 / KID.SPOKES / KID.WHEEL_FRAMES;
      this.wheelPh += clamp(this.speed / 0.45, -9, 9) * dt;
      const fr = ((Math.floor(this.wheelPh / step) % KID.WHEEL_FRAMES) + KID.WHEEL_FRAMES) % KID.WHEEL_FRAMES;
      const wt = this.wheelViews[this.view][fr];
      wm.map = wt;
      this.shadow.position.set(this.pos.x, T.S[this.idx].y + 0.08, this.pos.z);
      this.shadow.rotation.z = this.heading;
      const hgt = this.pos.y - T.S[this.idx].y;
      this.shadow.material.opacity = clamp(1 - hgt / 6, 0.2, 1);
      this.shieldMesh.visible = this.shieldT > 0;
      if (this.shieldT > 0) this.shieldMesh.material.opacity = 0.22 + Math.sin(t * 8) * 0.06 + (this.shieldT < 1.5 ? Math.sin(t * 30) * 0.1 : 0);
      this.bubble.visible = this.stunT > 0;
      if (this.bubble.visible) { const s = 1 + Math.sin(t * 7) * 0.05; this.bubble.scale.set(s, 1 / s, s); }
      this.stars.visible = this.stunT > 0 || this.spinT > 0;
      const d2 = dx * dx + dz * dz;
      if (!this.isPlayer) this.kart.visible = this.wheelSpr.visible = d2 > 9;
      if (this.tag) this.tag.visible = d2 < 110 * 110 && d2 > 25;
    }
  }

  // ---------- AI ----------
  function aiInput(r, race, t, dt) {
    const look = 7 + Math.max(10, r.speed) * 0.42;
    const a = T.at(r.s + look);
    const wob = Math.sin(t * 0.35 + r.ph) * 2.2;
    let lane = clamp(r.lane + wob, -(a.w - 2), a.w - 2);
    for (const bn of race.items.bananas) {
      const ds = wrapS(bn.s - r.s);
      if (ds > 0 && ds < 40 && Math.abs(bn.lat - lane) < 2.6) lane = clamp(bn.lat + (bn.lat > 0 ? -4 : 4), -(a.w - 1.5), a.w - 1.5);
    }
    const tx = a.p.x + a.r.x * lane, tz = a.p.z + a.r.z * lane;
    const desired = Math.atan2(-(tx - r.pos.x), -(tz - r.pos.z));
    const diff = angDiff(desired, r.heading);
    let steer = clamp(-diff * 2.8, -1, 1);

    let maxC = 0;
    const span = Math.ceil((12 + r.speed * 1.1) / T.STEP);
    for (let k = 3; k < span; k++) maxC = Math.max(maxC, Math.abs(T.S[(r.idx + k) % T.N].curv));
    const canDrift = r.skill > 0.88;
    const vCurve = maxC > 1e-4 ? (canDrift ? 1.75 : 1.35) / maxC : 999;
    const target = Math.min(P.maxSpeed * r.skill * (race.rubber ? race.rubber(r) : 1), vCurve);
    const inp = { steer, throttle: r.speed < target + 1, brake: r.speed > target + 9, drift: false };
    if (canDrift) {
      const sharp = maxC > 1 / 48 && r.speed > 24;
      inp.drift = r.drift ? (maxC > 1 / 70 && Math.abs(diff) > 0.04) : (sharp && Math.abs(steer) > 0.35);
    }
    if (r.nitroCount > 0 && maxC < 1 / 140 && r.boostT <= 0 && Math.random() < dt * 0.8) inp.nitro = true;
    return inp;
  }

  // ---------- 自动巡航（大师级）：走赛车线、弯道漂移攒氮气、直道放氮气、避让、脱困 ----------
  function pilotInput(r, race, t, dt) {
    // 前方 2~60 米的加权曲率决定内外线：curv > 0 为左弯，内线在左（lat < 0）
    let cs = 0, ws = 0;
    for (let k = 1; k < 30; k++) { const w = 1 - k / 30; cs += T.S[(r.idx + k) % T.N].curv * w; ws += w; }
    const cav = cs / ws;
    const look = 8 + Math.max(10, r.speed) * 0.45;
    const a = T.at(r.s + look);
    const room = a.w - 3.4;
    // 朝前方瞄准点直线行驶会切进弯心（弦高 ≈ look² / 8R），把瞄准点往弯外补偿
    let lane = clamp(-cav * 120, -1, 1) * room + clamp(T.S[a.i].curv * look * look / 8, -2.5, 2.5);
    for (const bn of race.items.bananas) {
      const ds = wrapS(bn.s - r.s);
      if (ds > 0 && ds < 50 && Math.abs(bn.lat - lane) < 3) lane = clamp(bn.lat + (bn.lat > lane ? -3.4 : 3.4), -room, room);
    }
    for (const o of race.racers) {
      if (o === r) continue;
      const ds = wrapS(o.s - r.s);
      if (ds > 0 && ds < 16 && Math.abs(o.lat - lane) < 2.8 && o.speed < r.speed - 1) lane = clamp(o.lat + (o.lat > lane ? -3.2 : 3.2), -room, room);
    }
    const tx = a.p.x + a.r.x * lane, tz = a.p.z + a.r.z * lane;
    const desired = Math.atan2(-(tx - r.pos.x), -(tz - r.pos.z));
    const diff = angDiff(desired, r.heading);
    let steer = clamp(-diff * 3.2, -1, 1);

    let maxC = 0;
    const span = Math.ceil((14 + r.speed * 1.15) / T.STEP);
    for (let k = 2; k < span; k++) maxC = Math.max(maxC, Math.abs(T.S[(r.idx + k) % T.N].curv));
    const target = Math.min(P.maxSpeed, maxC > 1e-4 ? 1.9 / maxC : 999);
    const inp = { steer, throttle: r.speed < target + 2, brake: r.speed > target + 10, drift: false };
    // 漂移：只漂急弯（半径 < 50 米），且至少漂满 0.85 秒拿到漂移加速；弯道结束或方向反了就收
    let nearC = 0;
    for (let k = 1; k < 10; k++) nearC += T.S[(r.idx + k) % T.N].curv / 9;
    if (r.drift) {
      const sameWay = Math.sign(-nearC) === r.driftDir;
      inp.drift = r.driftT < 0.85 ? Math.abs(nearC) > 1 / 160 || sameWay : sameWay && Math.abs(nearC) > 1 / 80;
    } else inp.drift = maxC > 1 / 50 && Math.abs(nearC) > 1 / 70 && r.speed > 22 && Math.abs(steer) > 0.25;
    // 直道放氮气
    let ahead = 0;
    for (let k = 2; k < 36; k++) ahead = Math.max(ahead, Math.abs(T.S[(r.idx + k) % T.N].curv));
    if (r.nitroCount > 0 && r.boostT <= 0 && !r.drift && ahead < 1 / 130) inp.nitro = true;
    // 脱困：低速卡住时倒车，倒车时打向目标方向让车头转回来
    r.pStuck = (r.speed < 4 && !r.air && r.stunT <= 0 && r.spinT <= 0) ? (r.pStuck || 0) + dt : 0;
    if (r.pStuck > 1.2) r.pBack = 0.9;
    if (r.pBack > 0) {
      r.pBack -= dt;
      return { steer: Math.sign(diff || 1), throttle: false, brake: true, drift: false };
    }
    return inp;
  }

  // ---------- 自动漂移：顺着弯道方向打方向就自动起漂，漂满拿加速，弯道结束或反打方向就收 ----------
  function autoDrift(r, inp) {
    if (inp.brake) return inp;
    let nearC = 0;
    for (let k = 1; k < 10; k++) nearC += T.S[(r.idx + k) % T.N].curv / 9;
    const turnDir = -Math.sign(nearC), steerDir = Math.abs(inp.steer) > 0.15 ? Math.sign(inp.steer) : 0;
    if (r.drift) {
      const sameWay = turnDir === r.driftDir && Math.abs(nearC) > 1 / 220;
      inp.drift = inp.drift || (steerDir !== -r.driftDir && (sameWay || (r.driftT < 0.85 && steerDir === r.driftDir)));
    } else if (Math.abs(nearC) > 1 / 140 && r.speed > 20 && steerDir === turnDir && Math.abs(inp.steer) > 0.3) inp.drift = true;
    return inp;
  }

  window.KART = { Racer, aiInput, pilotInput, autoDrift, P, wrapS, angDiff, clamp };
})();
