// 场景：天空、地形、路面、八个主题区的装饰与动画
(function () {
  const T = window.TRACK, S = T.S, N = T.N, Z = T.ZONES;
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = arr => arr[(Math.random() * arr.length) | 0];
  const UP = new THREE.Vector3(0, 1, 0);

  const ZS = {};
  S.forEach((s, i) => (ZS[s.zone] = ZS[s.zone] || []).push(i));

  // ---------- 合并几何 ----------
  const G = {};
  function geo(name, make) { if (!G[name]) { const g = make(); G[name] = g.index ? g.toNonIndexed() : g; } return G[name]; }
  const gBox = () => geo('box', () => new THREE.BoxGeometry(1, 1, 1));
  const gCyl = (n = 10) => geo('cyl' + n, () => new THREE.CylinderGeometry(1, 1, 1, n));
  const gTaper = (top, n = 10) => geo('tp' + top + '_' + n, () => new THREE.CylinderGeometry(top, 1, 1, n));
  const gCone = (n = 8) => geo('cone' + n, () => new THREE.ConeGeometry(1, 1, n));
  const gSph = (n = 10) => geo('sph' + n, () => new THREE.SphereGeometry(1, n, Math.max(4, n * 0.7 | 0)));
  const gHemi = () => geo('hemi', () => new THREE.SphereGeometry(1, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2));
  const gIco = () => geo('ico', () => new THREE.IcosahedronGeometry(1, 0));
  const gDode = () => geo('dode', () => new THREE.DodecahedronGeometry(1, 0));

  const _c = new THREE.Color(), _e = new THREE.Euler(), _q = new THREE.Quaternion(), _nm = new THREE.Matrix3();
  function M(x, y, z, ry = 0, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0) {
    _e.set(rx, ry, rz, 'YXZ'); _q.setFromEuler(_e);
    return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), _q, new THREE.Vector3(sx, sy, sz));
  }
  class Batch {
    constructor() { this.P = []; this.N = []; this.C = []; }
    add(g, color, m, jit = 0.05) {
      const pos = g.attributes.position.array, nor = g.attributes.normal.array, e = m.elements;
      const nm = _nm.getNormalMatrix(m).elements;
      _c.set(color); const f = 1 + (Math.random() * 2 - 1) * jit;
      const r = Math.min(1, _c.r * f), gg = Math.min(1, _c.g * f), b = Math.min(1, _c.b * f);
      const P = this.P, NN = this.N, C = this.C;
      for (let i = 0; i < pos.length; i += 3) {
        const x = pos[i], y = pos[i + 1], z = pos[i + 2];
        P.push(e[0] * x + e[4] * y + e[8] * z + e[12], e[1] * x + e[5] * y + e[9] * z + e[13], e[2] * x + e[6] * y + e[10] * z + e[14]);
        const nx = nor[i], ny = nor[i + 1], nz = nor[i + 2];
        let a = nm[0] * nx + nm[3] * ny + nm[6] * nz, bb = nm[1] * nx + nm[4] * ny + nm[7] * nz, c = nm[2] * nx + nm[5] * ny + nm[8] * nz;
        const l = Math.hypot(a, bb, c) || 1;
        NN.push(a / l, bb / l, c / l);
        C.push(r, gg, b);
      }
    }
    quad(a, b, c, d, color) { // 四个点组成的面（双面材质用）
      const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(d, a)).normalize();
      _c.set(color);
      for (const p of [a, b, c, a, c, d]) { this.P.push(p.x, p.y, p.z); this.N.push(n.x, n.y, n.z); this.C.push(_c.r, _c.g, _c.b); }
    }
    build(mat) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(this.N, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(this.C, 3));
      g.computeBoundingSphere();
      return new THREE.Mesh(g, mat);
    }
  }

  // ---------- 贴图 ----------
  function canvasTex(w, h, draw, rep) {
    const c = KID.canvas(w, h), g = c.getContext('2d');
    draw(g, w, h);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    if (rep) t.repeat.set(rep[0], rep[1]);
    return t;
  }
  function noise(g, w, h, n, a, cols) {
    for (let i = 0; i < n; i++) { g.fillStyle = pick(cols); g.globalAlpha = Math.random() * a; g.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 3, 2 + Math.random() * 3); }
    g.globalAlpha = 1;
  }
  const roadTex = {
    asphalt: () => canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = '#5f6672'; g.fillRect(0, 0, w, h);
      noise(g, w, h, 2200, 0.35, ['#4a505a', '#737b88', '#3f444c']);
      g.fillStyle = '#ffffff'; g.fillRect(6, 0, 7, h); g.fillRect(w - 13, 0, 7, h);
      g.fillStyle = '#ffd21f'; g.fillRect(w / 2 - 4, 20, 8, 110);
    }),
    tunnel: () => canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = '#2b3d56'; g.fillRect(0, 0, w, h);
      noise(g, w, h, 1500, 0.3, ['#21324a', '#3a5272']);
      g.fillStyle = '#35f0ff'; g.fillRect(6, 0, 6, h); g.fillRect(w - 12, 0, 6, h);
      g.fillStyle = '#9ff7ff'; g.fillRect(w / 2 - 3, 10, 6, 70); g.fillRect(w / 2 - 3, 138, 6, 70);
    }),
    wood: () => canvasTex(256, 256, (g, w, h) => {
      for (let i = 0; i < 8; i++) {
        g.fillStyle = ['#b07a45', '#a06d3c', '#bd8650', '#99653a'][i % 4]; g.fillRect(0, i * 32, w, 30);
        g.fillStyle = '#6b4424'; g.fillRect(0, i * 32 + 30, w, 2);
        g.fillStyle = '#5a3a1f'; g.beginPath(); g.arc(18, i * 32 + 15, 3, 0, 7); g.arc(w - 18, i * 32 + 15, 3, 0, 7); g.fill();
      }
      noise(g, w, h, 800, 0.2, ['#7b5330', '#c99a63']);
    }),
    stone: () => canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = '#8b8378'; g.fillRect(0, 0, w, h);
      for (let y = 0; y < 8; y++) for (let x = 0; x < 6; x++) {
        g.fillStyle = pick(['#b8ae9f', '#a89d8d', '#c6bcae', '#9f9484']);
        const ox = (y % 2) * 21;
        g.beginPath(); g.roundRect ? g.roundRect(x * 43 + ox - 20, y * 32 + 3, 39, 27, 6) : g.rect(x * 43 + ox - 20, y * 32 + 3, 39, 27); g.fill();
      }
      g.fillStyle = '#ffe9b0'; g.fillRect(6, 0, 5, h); g.fillRect(w - 11, 0, 5, h);
    })
  };

  // ---------- 天空 ----------
  function makeSky() {
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color(Z.town.skyTop) }, bottom: { value: new THREE.Color(Z.town.skyBottom) }, sun: { value: new THREE.Vector3(0.4, 0.55, -0.7).normalize() } },
      vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform vec3 top; uniform vec3 bottom; uniform vec3 sun; varying vec3 vD;
        void main(){ float h = vD.y; vec3 c = mix(bottom, top, smoothstep(-0.02, 0.55, h));
          float s = max(dot(vD, sun), 0.0); c += vec3(1.0,0.92,0.7) * (pow(s, 64.0) * 0.9 + pow(s, 6.0) * 0.18);
          if (h < 0.0) c = mix(c, bottom * 0.9, smoothstep(0.0, -0.2, h));
          gl_FragColor = vec4(c, 1.0); }`
    });
    const m = new THREE.Mesh(new THREE.SphereGeometry(3000, 32, 16), mat);
    m.renderOrder = -1;
    return m;
  }

  // ---------- 地形 ----------
  const STRIPES = ['#ff4f6d', '#ffd23f', '#ff8fd0', '#a77bff', '#ff9a3c'];
  function terrainColor(x, z, y) {
    const rd = T.roadDist(x, z), d = rd.d, zone = rd.i >= 0 && d < 160 ? S[rd.i].zone : 'none';
    let col;
    if (y < -6.2) col = '#d9c48c';
    else if (zone === 'beach' && (z < -585 || d < 22)) col = y < -1.4 ? '#e9d49a' : '#f6e3a8';
    else if (z < -630 && y < -0.5) col = '#efd99c';
    else if (zone === 'flower' && d > 3) { _c.set(STRIPES[((Math.floor((x * 0.6 + z * 0.8) / 14) % 5) + 5) % 5]).lerp(new THREE.Color('#6fcf4a'), 0.62); return _c.clone(); }
    else if (zone === 'forest') col = '#3f8f3a';
    else if (zone === 'tunnel') col = '#4fa06a';
    else if (zone === 'castle') col = '#93c95f';
    else if (zone === 'park') col = '#8fdc6a';
    else if (zone === 'bridge' || y < -4) col = '#4f9a54';
    else col = '#80cf55';
    _c.set(col);
    const n = 1 + (Math.sin(x * 0.21) * Math.cos(z * 0.17)) * 0.05 + (Math.random() - 0.5) * 0.05;
    _c.multiplyScalar(n);
    if (y > 8) _c.lerp(new THREE.Color('#2f7a33'), Math.min(1, (y - 8) / 30) * 0.4);
    return _c.clone();
  }
  function makeTerrain(q) {
    const seg = q.mobile ? 6 : 1;
    const w = 1460, h = 1540, cx = 200, cz = 0;
    const g = new THREE.PlaneGeometry(w, h, Math.round(w / (8 + seg * 0.5)), Math.round(h / (8 + seg * 0.5)));
    g.rotateX(-Math.PI / 2);
    const p = g.attributes.position, cols = [];
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i) + cx, z = p.getZ(i) + cz;
      const y = T.terrainHeight(x, z);
      p.setXYZ(i, x, y, z);
      const c = terrainColor(x, z, y); cols.push(c.r, c.g, c.b);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true }));
    return m;
  }

  // ---------- 路面 / 路肩 / 护栏 ----------
  const WALLS = {
    town:   { h: 1.1, cols: ['#2563eb', '#ffffff'], len: 3 },
    beach:  { h: 0.9, cols: ['#ffffff', '#7dd3fc'], len: 2 },
    tunnel: { h: 0.6, cols: ['#22d3ee', '#0e7490'], len: 2 },
    fence:  { h: 1.0, cols: ['#fff7ea', '#f2e6d0'], len: 1 },
    wood:   { h: 1.0, cols: ['#7a4b26', '#8d5a30'], len: 2 },
    rope:   { h: 1.2, cols: ['#8b5a2b', '#a06a35'], len: 2 },
    stone:  { h: 1.4, cols: ['#a39a8c', '#8f8678'], len: 3 },
    park:   { h: 1.0, cols: ['#ff4f6d', '#ffd23f', '#38bdf8', '#a3e635', '#c084fc'], len: 2 }
  };
  const CURB = { asphalt: ['#e11d48', '#ffffff'], tunnel: ['#22d3ee', '#1e293b'], wood: null, stone: ['#e8dcc4', '#8b8378'] };

  function makeRoad(group) {
    const byMat = {};
    const deco = new Batch();
    let vAcc = 0;
    for (let k = 0; k < N; k++) {
      const a = S[k], b = S[(k + 1) % N];
      const type = Z[a.zone].road;
      const o = byMat[type] || (byMat[type] = { P: [], U: [] });
      const al = a.p.clone().addScaledVector(a.r, -a.w), ar = a.p.clone().addScaledVector(a.r, a.w);
      const bl = b.p.clone().addScaledVector(b.r, -b.w), br = b.p.clone().addScaledVector(b.r, b.w);
      const v0 = vAcc / 14, v1 = (vAcc + T.STEP) / 14;
      vAcc += T.STEP;
      o.P.push(al.x, al.y, al.z, br.x, br.y, br.z, bl.x, bl.y, bl.z, al.x, al.y, al.z, ar.x, ar.y, ar.z, br.x, br.y, br.z);
      o.U.push(0, v0, 1, v1, 0, v1, 0, v0, 1, v0, 1, v1);

      // 路肩
      const cc = CURB[type];
      const band = (Math.floor(k / 2) % 2);
      for (const sd of [-1, 1]) {
        const w0 = a.w, w1 = a.w + 1.1, x0 = b.w, x1 = b.w + 1.1;
        const p0 = a.p.clone().addScaledVector(a.r, sd * w0), p1 = a.p.clone().addScaledVector(a.r, sd * w1);
        const q0 = b.p.clone().addScaledVector(b.r, sd * x0), q1 = b.p.clone().addScaledVector(b.r, sd * x1);
        if (cc) { p0.y += 0.03; p1.y += 0.03; q0.y += 0.03; q1.y += 0.03; deco.quad(p0, q0, q1, p1, cc[band]); }
        else deco.quad(p0, q0, q1, p1, '#7a4f2a');
        // 侧裙（遮住路和地形的缝）
        const depth = a.zone === 'bridge' ? 1.0 : 4.5;
        const r0 = p1.clone(), r1 = q1.clone(), r2 = q1.clone(), r3 = p1.clone();
        r2.y -= depth; r3.y -= depth;
        deco.quad(r0, r1, r2, r3, a.zone === 'bridge' ? '#6b4424' : '#8a6b4a');
        // 护栏
        const wl = WALLS[Z[a.zone].wall];
        const wc = wl.cols[Math.floor(k / wl.len) % wl.cols.length];
        const ww0 = a.p.clone().addScaledVector(a.r, sd * (a.w + 1.25)), ww1 = b.p.clone().addScaledVector(b.r, sd * (b.w + 1.25));
        const t0 = ww0.clone(), t1 = ww1.clone(); t0.y += wl.h; t1.y += wl.h;
        if (Z[a.zone].wall === 'fence') {
          if (k % 2 === 0) { const t2 = ww0.clone(); t2.y += wl.h * 0.55; const t3 = ww1.clone(); t3.y += wl.h * 0.55; deco.quad(t2, t3, t1, t0, wc); }
          if (k % 3 === 0) deco.add(gBox(), '#fffaf0', M(ww0.x, ww0.y + 0.6, ww0.z, a.heading, 0.25, 1.3, 0.25));
        } else if (Z[a.zone].wall === 'rope') {
          const t2 = ww0.clone(), t3 = ww1.clone(); t2.y += wl.h - 0.18; t3.y += wl.h - 0.18;
          deco.quad(t2, t3, t1, t0, '#c9a46a');
          const t4 = ww0.clone(), t5 = ww1.clone(); t4.y += 0.45; t5.y += 0.45; const t6 = t4.clone(), t7 = t5.clone(); t6.y += 0.14; t7.y += 0.14;
          deco.quad(t4, t5, t7, t6, '#c9a46a');
          if (k % 4 === 0) deco.add(gBox(), '#6b4424', M(ww0.x, ww0.y + 0.55, ww0.z, a.heading, 0.3, 1.4, 0.3));
        } else {
          deco.quad(ww0, ww1, t1, t0, wc);
          if (Z[a.zone].wall === 'stone' && k % 2 === 0) deco.add(gBox(), '#9d9486', M(t0.x, t0.y + 0.3, t0.z, a.heading, 0.9, 0.6, 1.2));
        }
      }
    }
    for (const type in byMat) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(byMat[type].P, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(byMat[type].U, 2));
      g.computeVertexNormals();
      const mesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ map: roadTex[type]() }));
      group.add(mesh);
    }
    group.add(deco.build(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })));

    // 起点格子线
    const chk = canvasTex(256, 64, (g, w, h) => {
      for (let x = 0; x < 16; x++) for (let y = 0; y < 4; y++) { g.fillStyle = (x + y) % 2 ? '#111' : '#fff'; g.fillRect(x * 16, y * 16, 16, 16); }
    });
    chk.wrapS = chk.wrapT = THREE.ClampToEdgeWrapping;
    const s0 = S[0];
    const line = new THREE.Mesh(new THREE.PlaneGeometry(s0.w * 2, 4), new THREE.MeshLambertMaterial({ map: chk }));
    line.rotation.set(-Math.PI / 2, 0, s0.heading, 'YXZ');
    line.rotation.order = 'YXZ'; line.rotation.set(-Math.PI / 2, s0.heading, 0);
    line.position.set(s0.p.x, s0.y + 0.05, s0.p.z);
    group.add(line);

    // 加速带
    const arrow = canvasTex(128, 256, (g, w, h) => {
      g.fillStyle = 'rgba(255,90,20,0.9)'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 3; i++) {
        g.fillStyle = i % 2 ? '#fff36b' : '#ffffff';
        g.beginPath(); const y = 30 + i * 75; g.moveTo(w / 2, y); g.lineTo(w - 14, y + 50); g.lineTo(w - 38, y + 50); g.lineTo(w / 2, y + 22); g.lineTo(38, y + 50); g.lineTo(14, y + 50); g.closePath(); g.fill();
      }
    });
    arrow.wrapS = arrow.wrapT = THREE.RepeatWrapping;
    const boostMat = new THREE.MeshBasicMaterial({ map: arrow, transparent: true, opacity: 0.95 });
    W.boostMat = boostMat;
    for (const b of T.BOOSTS) {
      const a = T.at(b.s);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(5, 9), boostMat);
      m.rotation.order = 'YXZ'; m.rotation.set(-Math.PI / 2, a.heading, 0);
      const y = a.p.y + 0.06;
      m.position.set(a.p.x, y, a.p.z);
      group.add(m);
    }
    // 跳台黄黑条纹
    for (const r of T.RAMPS) {
      const a = T.at(r.s - 1);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(a.w * 2, 1.2), new THREE.MeshBasicMaterial({ map: canvasTex(128, 16, (g) => { for (let i = 0; i < 16; i++) { g.fillStyle = i % 2 ? '#111' : '#ffd21f'; g.fillRect(i * 8, 0, 8, 16); } }) }));
      m.rotation.order = 'YXZ'; m.rotation.set(-Math.PI / 2, a.heading, 0);
      m.position.set(a.p.x, a.p.y + 0.08, a.p.z);
      group.add(m);
    }
  }

  // ---------- 摆放工具 ----------
  function spot(zone, dmin, dmax, sideSign, tries = 25) {
    const ids = ZS[zone];
    for (let t = 0; t < tries; t++) {
      const i = ids[(Math.random() * ids.length) | 0], smp = S[i];
      const side = sideSign || (Math.random() < 0.5 ? -1 : 1);
      const d = smp.w + dmin + Math.random() * (dmax - dmin);
      const x = smp.p.x + smp.r.x * side * d + smp.th.x * rand(-6, 6);
      const z = smp.p.z + smp.r.z * side * d + smp.th.z * rand(-6, 6);
      const rd = T.roadDist(x, z);
      if (rd.d < dmin * 0.85) continue;
      return { x, z, y: T.terrainHeight(x, z), i, side, smp, face: Math.atan2(-side * smp.r.x, -side * smp.r.z) };
    }
    return null;
  }
  function beside(i, side, off) {
    const smp = S[(i + N) % N];
    const d = smp.w + off;
    const x = smp.p.x + smp.r.x * side * d, z = smp.p.z + smp.r.z * side * d;
    return { x, z, y: T.terrainHeight(x, z), smp, side, face: Math.atan2(-side * smp.r.x, -side * smp.r.z) };
  }
  const idxOf = s => Math.round((((s % T.L) + T.L) % T.L) / T.STEP) % N;
  const zoneStart = z => T.ctrlS[T.CTRL.findIndex(c => c[3] === z)];

  // ---------- 动画对象 ----------
  const W = { anims: [], kids: [] };
  function anim(fn) { W.anims.push(fn); }

  function kid(scene, x, y, z, opt = {}) {
    const color = opt.color || pick(KID.COLORS);
    const h = opt.h || 2.6;
    const body = new THREE.Sprite(new THREE.SpriteMaterial({ map: KID.standTex(color, opt.wave !== false), transparent: true }));
    body.center.set(0.5, 0);
    body.scale.set(h * 64 / 112, h, 1);
    const g = new THREE.Group(); g.position.set(x, y, z); g.add(body);
    let arm = null;
    if (opt.wave !== false) {
      arm = new THREE.Sprite(new THREE.SpriteMaterial({ map: KID.armTex(color), transparent: true }));
      arm.center.set(0.28, 0.97);
      const k = h / 112;
      arm.scale.set(13.54 * k, 19.21 * k, 1);
      g.add(arm);
    }
    if (opt.lie) { body.material.rotation = Math.PI / 2; body.center.set(0.5, 0.5); }
    scene.add(g);
    const k = h / 112;
    W.kids.push({ g, body, arm, ph: Math.random() * 10, y, jump: opt.jump !== false && !opt.lie, speed: rand(6, 10), ox: 14.3 * k, oy: 38.3 * k });
    return g;
  }

  // ---------- 各区域 ----------
  function buildTown(scene, B) {
    const ids = ZS.town;
    const pastel = ['#ffd6e0', '#ffe9a8', '#c9f2ff', '#d9ffc9', '#ffd8b0', '#e5d4ff', '#fff3e0'];
    const roofs = ['#e2463c', '#3b82f6', '#f59e0b', '#10b981', '#8b5cf6', '#ef6aa8'];
    for (const side of [-1, 1]) {
      for (let k = 40; k < ids.length - 10; k += 8) {
        const b = beside(ids[k], side, rand(12, 16));
        if (T.roadDist(b.x, b.z).d < 9) continue;
        const w = rand(8, 11), h = rand(6, 10), d = rand(8, 10), f = b.face;
        const col = pick(pastel), roof = pick(roofs);
        B.add(gBox(), col, M(b.x, b.y + h / 2, b.z, f, w, h, d));
        B.add(gCone(4), roof, M(b.x, b.y + h + 2.2, b.z, f + Math.PI / 4, w * 0.78, 4.4, d * 0.78));
        // 窗户、门
        const fx = Math.sin(f), fz = Math.cos(f), rx = Math.cos(f), rz = -Math.sin(f);
        for (const wx of [-w * 0.28, w * 0.28]) for (const wy of [h * 0.35, h * 0.72]) {
          if (wy < h * 0.5 && Math.abs(wx) < 2) continue;
          B.add(gBox(), '#7dd3fc', M(b.x + fx * (d / 2 + 0.05) + rx * wx, b.y + wy, b.z + fz * (d / 2 + 0.05) + rz * wx, f, 1.6, 1.6, 0.15), 0);
        }
        B.add(gBox(), '#8b5a2b', M(b.x + fx * (d / 2 + 0.06), b.y + 1.3, b.z + fz * (d / 2 + 0.06), f, 1.6, 2.6, 0.15), 0);
        if (Math.random() < 0.5) { // 条纹遮阳棚
          for (let s = 0; s < 6; s++) B.add(gBox(), s % 2 ? '#ffffff' : pick(['#ef4444', '#22c55e', '#3b82f6']), M(b.x + fx * (d / 2 + 1) + rx * (s - 2.5) * 0.9, b.y + 3.3, b.z + fz * (d / 2 + 1) + rz * (s - 2.5) * 0.9, f, 0.9, 0.15, 2.2, -0.35), 0);
        }
        B.add(gCyl(6), '#9ca3af', M(b.x + fx * 1.5 + rx * w * 0.3, b.y + h + 2, b.z + fz * 1.5 + rz * w * 0.3, 0, 0.5, 2.5, 0.5)); // 烟囱
      }
      // 路灯
      for (let k = 10; k < ids.length; k += 15) {
        const b = beside(ids[k], side, 2.6);
        B.add(gCyl(6), '#334155', M(b.x, b.y + 2.6, b.z, 0, 0.12, 5.2, 0.12));
        B.add(gSph(8), '#fff3b0', M(b.x, b.y + 5.4, b.z, 0, 0.45, 0.45, 0.45), 0);
      }
    }
    // 看台 + 观众（起点前后）
    for (const side of [-1, 1]) {
      for (let seg = -1; seg <= 0; seg++) {
        const i0 = idxOf(seg * 34 + 4);
        const b = beside(i0, side, 5);
        const f = b.face, fx = Math.sin(f), fz = Math.cos(f), rx = Math.cos(f), rz = -Math.sin(f);
        for (let tier = 0; tier < 4; tier++) {
          const off = -tier * 2.2;
          B.add(gBox(), tier % 2 ? '#e5e7eb' : '#cbd5e1', M(b.x + fx * off, b.y + tier * 1.1 + 0.55, b.z + fz * off, f, 30, 1.1 + tier * 0, 2.2));
          for (let s = 0; s < 8; s++) {
            const lx = (s - 3.5) * 3.6 + rand(-0.6, 0.6);
            if (Math.random() < 0.15) continue;
            kid(scene, b.x + fx * off + rx * lx, b.y + tier * 1.1 + 1.1, b.z + fz * off + rz * lx, { h: 2.3, wave: Math.random() < 0.7 });
          }
        }
        // 顶棚
        for (let s = 0; s < 10; s++) B.add(gBox(), s % 2 ? '#ffffff' : '#ef4444', M(b.x + fx * -3.3 + rx * (s - 4.5) * 3, b.y + 8.2, b.z + fz * -3.3 + rz * (s - 4.5) * 3, f, 3, 0.25, 9.5, 0.12), 0);
        for (const px of [-14.5, 14.5]) B.add(gCyl(6), '#64748b', M(b.x + fx * -7.5 + rx * px, b.y + 4.5, b.z + fz * -7.5 + rz * px, 0, 0.25, 9, 0.25));
      }
    }
    // 起点门楼
    const s0 = S[0], gw = s0.w + 3;
    for (const side of [-1, 1]) {
      const x = s0.p.x + s0.r.x * side * gw, z = s0.p.z + s0.r.z * side * gw;
      B.add(gBox(), '#1e293b', M(x, 5, z, s0.heading, 1.6, 10, 1.6));
      B.add(gSph(10), '#ffd23f', M(x, 10.6, z, 0, 1.2, 1.2, 1.2), 0);
    }
    const ban = canvasTex(1024, 160, (g, w, h) => {
      for (let x = 0; x < 64; x++) for (let y = 0; y < 2; y++) { g.fillStyle = (x + y) % 2 ? '#111' : '#fff'; g.fillRect(x * 16, y * 16, 16, 16); g.fillRect(x * 16, h - 32 + y * 16, 16, 16); }
      const gr = g.createLinearGradient(0, 32, 0, h - 32); gr.addColorStop(0, '#ff3d5a'); gr.addColorStop(1, '#c81e3a');
      g.fillStyle = gr; g.fillRect(0, 32, w, h - 64);
      g.font = '900 60px "PingFang SC","Microsoft YaHei",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineWidth = 8; g.strokeStyle = '#7f1022'; g.strokeText('小白卡丁车 · 梦游大奖赛', w / 2, h / 2 + 2);
      g.fillStyle = '#fff'; g.fillText('小白卡丁车 · 梦游大奖赛', w / 2, h / 2 + 2);
      const hd = KID.head(); g.drawImage(hd, 20, 30, 66, 98); g.drawImage(hd, w - 86, 30, 66, 98);
    });
    ban.wrapS = ban.wrapT = THREE.ClampToEdgeWrapping;
    const banner = new THREE.Mesh(new THREE.BoxGeometry(gw * 2 + 1.6, 3.2, 0.6), [0, 0, 0, 0, 1, 1].map(i => i ? new THREE.MeshBasicMaterial({ map: ban }) : new THREE.MeshLambertMaterial({ color: 0x7f1022 })));
    banner.position.set(s0.p.x, 9.2, s0.p.z); banner.rotation.y = s0.heading;
    scene.add(banner);
  }

  function buildBeach(scene, B, q) {
    const ids = ZS.beach;
    const seaSide = (smp) => (smp.p.z + smp.r.z < smp.p.z ? 1 : -1);
    // 椰子树
    const palm = (x, y, z) => {
      const lean = rand(-0.35, 0.35), dir = rand(0, 6.28);
      let px = x, py = y, pz = z;
      for (let i = 0; i < 6; i++) {
        const tilt = lean * (i / 6);
        B.add(gTaper(0.85, 7), i % 2 ? '#a0703f' : '#8a5d33', M(px, py + 0.8, pz, dir, 0.42 - i * 0.03, 1.7, 0.42 - i * 0.03, tilt));
        px += Math.sin(dir) * Math.sin(tilt) * 1.6; pz += Math.cos(dir) * Math.sin(tilt) * 1.6; py += 1.6;
      }
      for (let l = 0; l < 7; l++) {
        const a = l / 7 * Math.PI * 2;
        B.add(gBox(), pick(['#2f9e44', '#37b24d', '#2b8a3e']), M(px + Math.sin(a) * 2.2, py + 0.1, pz + Math.cos(a) * 2.2, a, 1.1, 0.12, 4.8, 0.45));
      }
      B.add(gSph(6), '#6b4f2a', M(px, py - 0.4, pz, 0, 0.45, 0.45, 0.45));
    };
    for (let k = 0; k < ids.length; k += 9) {
      const smp = S[ids[k]], ss = seaSide(smp);
      const b = beside(ids[k], -ss, rand(4, 14)); palm(b.x, b.y, b.z);
      if (k % 18 === 0) { const c = beside(ids[k], ss, rand(5, 9)); palm(c.x, c.y, c.z); }
    }
    // 遮阳伞、浴巾、小屋
    const umb = ['#ef4444', '#f59e0b', '#3b82f6', '#ec4899', '#10b981'];
    let sleeper = null;
    for (let k = 20; k < ids.length - 10; k += 14) {
      const smp = S[ids[k]], ss = seaSide(smp);
      const b = beside(ids[k], ss, rand(14, 30));
      if (b.y < -2.5) continue;
      B.add(gCyl(5), '#f8fafc', M(b.x, b.y + 1.8, b.z, 0, 0.08, 3.6, 0.08));
      B.add(gCone(10), pick(umb), M(b.x, b.y + 3.8, b.z, 0, 2.4, 1.0, 2.4));
      B.add(gBox(), pick(['#fde68a', '#bae6fd', '#fbcfe8', '#ffffff']), M(b.x + 1.8, b.y + 0.06, b.z + 0.5, b.face, 1.6, 0.08, 3.2), 0);
      if (!sleeper) sleeper = b;
      else if (Math.random() < 0.35) kid(scene, b.x - 1.5, b.y, b.z - 1, { h: 2.2 });
    }
    if (sleeper) {
      kid(scene, sleeper.x + 1.8, sleeper.y + 0.35, sleeper.z + 0.5, { h: 2.8, lie: true, wave: false });
      const zz = [];
      for (let i = 0; i < 3; i++) {
        const s = KID.textSprite(['Z', 'z', 'z'][i], 1.2 - i * 0.2, { color: '#c7d2fe', stroke: '#312e81', size: 64 });
        scene.add(s); zz.push(s);
      }
      anim((dt, t) => zz.forEach((s, i) => {
        const u = ((t * 0.35 + i / 3) % 1);
        s.position.set(sleeper.x + 2.4 + u * 1.5, sleeper.y + 1.6 + u * 3, sleeper.z + 0.2);
        s.material.opacity = Math.sin(u * Math.PI);
      }));
    }
    // 海
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(6000, 3400, q.mobile ? 40 : 90, q.mobile ? 20 : 40),
      new THREE.MeshPhongMaterial({ color: 0x1b9fd8, specular: 0xbfefff, shininess: 60, transparent: true, opacity: 0.9, flatShading: true }));
    sea.geometry.rotateX(-Math.PI / 2);
    sea.position.set(200, -1.4, -640 - 1700 + 30);
    scene.add(sea);
    const sp = sea.geometry.attributes.position, base = sp.array.slice();
    let frame = 0;
    anim((dt, t) => {
      if ((frame++ & 1) && q.mobile) return;
      for (let i = 0; i < sp.count; i++) {
        const x = base[i * 3], z = base[i * 3 + 2];
        sp.array[i * 3 + 1] = Math.sin(x * 0.03 + t * 1.2) * 0.45 + Math.cos(z * 0.05 + t * 0.9) * 0.35;
      }
      sp.needsUpdate = true;
      if (frame % 3 === 0) sea.geometry.computeVertexNormals();
    });
    // 灯塔
    const lh = { x: 330, z: -735 };
    B.add(gDode(), '#8d8a83', M(lh.x, -4, lh.z, 0.3, 16, 7, 14));
    B.add(gDode(), '#a3a096', M(lh.x + 9, -3, lh.z + 6, 1.1, 8, 5, 7));
    for (let i = 0; i < 6; i++) B.add(gTaper(0.93, 14), i % 2 ? '#ffffff' : '#e11d48', M(lh.x, 2.5 + i * 3, lh.z, 0, 3.2 - i * 0.2, 3, 3.2 - i * 0.2));
    B.add(gCyl(10), '#1f2937', M(lh.x, 20.6, lh.z, 0, 2.6, 0.4, 2.6));
    B.add(gCyl(10), '#fff7c2', M(lh.x, 22.2, lh.z, 0, 1.8, 2.8, 1.8), 0);
    B.add(gCone(10), '#e11d48', M(lh.x, 25, lh.z, 0, 2.3, 2.8, 2.3));
    const beam = new THREE.Mesh(new THREE.ConeGeometry(7, 60, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff3a0, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    beam.geometry.translate(0, -30, 0); beam.geometry.rotateX(Math.PI / 2);
    const beamG = new THREE.Group(); beamG.position.set(lh.x, 22.2, lh.z); beamG.add(beam); scene.add(beamG);
    anim((dt, t) => { beamG.rotation.y = t * 0.8; });
    // 帆船
    for (let i = 0; i < 6; i++) {
      const g = new THREE.Group();
      const hull = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.1, 7), new THREE.MeshLambertMaterial({ color: pick([0xffffff, 0xef4444, 0x3b82f6, 0xf59e0b]) }));
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 9), new THREE.MeshLambertMaterial({ color: 0x5b3a1e }));
      mast.position.y = 5;
      const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(0, 8); sh.lineTo(4.5, 0.5); sh.lineTo(0, 0);
      const sail = new THREE.Mesh(new THREE.ShapeGeometry(sh), new THREE.MeshLambertMaterial({ color: pick([0xffffff, 0xfff1a8, 0xffd1dc, 0xc7f0ff]), side: THREE.DoubleSide }));
      sail.position.set(0, 1, 0); sail.rotation.y = Math.PI / 2;
      g.add(hull, mast, sail);
      const bx = rand(-200, 700), bz = rand(-760, -900), sp2 = rand(3, 7) * (Math.random() < 0.5 ? 1 : -1);
      g.rotation.y = sp2 > 0 ? -Math.PI / 2 : Math.PI / 2;
      scene.add(g);
      anim((dt, t) => {
        g.position.set(((bx + t * sp2 + 1100) % 1100 + 1100) % 1100 - 300, -1 + Math.sin(t * 1.5 + i) * 0.3, bz);
        g.rotation.z = Math.sin(t * 1.1 + i) * 0.06;
      });
    }
    // 海鸥
    const gullMat = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    for (let i = 0; i < (q.mobile ? 6 : 12); i++) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.3, 1.1), gullMat);
      const wl = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.05, 0.6), gullMat); wl.geometry.translate(0.9, 0, 0);
      const wr = wl.clone(); wr.scale.x = -1;
      g.add(body, wl, wr); scene.add(g);
      const c = S[ids[(Math.random() * ids.length) | 0]].p, rad = rand(20, 60), h = rand(14, 30), spd = rand(0.2, 0.45), ph = rand(0, 7);
      anim((dt, t) => {
        const a = t * spd + ph;
        g.position.set(c.x + Math.cos(a) * rad, h + Math.sin(t * 0.7 + ph) * 2, c.z - 40 + Math.sin(a) * rad);
        g.rotation.y = -a;
        const fl = Math.sin(t * 9 + ph) * 0.5;
        wl.rotation.z = fl; wr.rotation.z = -fl;
      });
    }
  }

  function buildTunnel(scene, B, q) {
    const ids = ZS.tunnel.slice();
    const pre = [], post = [];
    for (let d = 1; d <= 6; d++) { pre.push((ids[0] - d + N) % N); post.push((ids[ids.length - 1] + d) % N); }
    const all = pre.reverse().concat(ids, post);
    const SEG = 14;
    const P = [], NRM = [];
    const ring = (smp) => {
      const R = smp.w + 2.6, pts = [];
      for (let a = 0; a <= SEG; a++) {
        const ang = a / SEG * Math.PI;
        pts.push(smp.p.clone().addScaledVector(smp.r, Math.cos(ang) * R).addScaledVector(UP, Math.sin(ang) * R * 0.82 - 0.3));
      }
      return pts;
    };
    let prev = ring(S[all[0]]);
    for (let k = 1; k < all.length; k++) {
      const cur = ring(S[all[k]]);
      for (let a = 0; a < SEG; a++) {
        const v = [prev[a], cur[a], cur[a + 1], prev[a], cur[a + 1], prev[a + 1]];
        for (const p of v) { P.push(p.x, p.y, p.z); }
      }
      prev = cur;
    }
    const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); gg.computeVertexNormals();
    const glass = new THREE.Mesh(gg, new THREE.MeshPhongMaterial({ color: 0x8fe8ff, transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false, shininess: 90, specular: 0xffffff }));
    glass.renderOrder = 2;
    scene.add(glass);
    // 灯带拱肋
    const glow = new Batch();
    const torus = geo('tor', () => new THREE.TorusGeometry(1, 0.03, 5, 20, Math.PI));
    const basis = new THREE.Matrix4();
    for (let k = 0; k < all.length; k += 7) {
      const smp = S[all[k]], R = smp.w + 2.6;
      basis.makeBasis(smp.r, UP, smp.th.clone().negate());
      const m = new THREE.Matrix4().makeTranslation(smp.p.x, smp.p.y - 0.3, smp.p.z).multiply(basis).multiply(new THREE.Matrix4().makeScale(R, R * 0.82, 8));
      glow.add(torus, (k / 7) % 2 ? '#5ff6ff' : '#ff7ae6', m, 0);
    }
    scene.add(glow.build(new THREE.MeshBasicMaterial({ vertexColors: true })));
    // 入口拱门
    for (const end of [all[0], all[all.length - 1]]) {
      const smp = S[end], R = smp.w + 3.6;
      basis.makeBasis(smp.r, UP, smp.th.clone().negate());
      const m = new THREE.Matrix4().makeTranslation(smp.p.x, smp.p.y - 0.3, smp.p.z).multiply(basis).multiply(new THREE.Matrix4().makeScale(R, R * 0.85, 30));
      B.add(torus, '#64748b', m);
      const s = KID.textSprite('🐠 海底隧道', 2.6, { bg: 'rgba(8,47,73,.85)', color: '#a5f3fc', size: 56 });
      s.position.set(smp.p.x, smp.p.y + R * 0.85 + 1.5, smp.p.z); scene.add(s);
    }
    // 海草、珊瑚
    for (let k = 0; k < ids.length; k += 3) for (const side of [-1, 1]) {
      const b = beside(ids[k], side, rand(4.5, 14));
      if (Math.random() < 0.6) B.add(gCone(5), pick(['#16a34a', '#15803d', '#22c55e']), M(b.x, b.y + 2.5, b.z, rand(0, 6), 0.5, rand(3, 6), 0.5, rand(-0.2, 0.2)));
      else B.add(gIco(), pick(['#fb7185', '#f472b6', '#fb923c', '#facc15', '#c084fc']), M(b.x, b.y + 0.6, b.z, rand(0, 6), rand(0.8, 1.6), rand(0.6, 1.4), rand(0.8, 1.6)));
    }
    // 鱼
    const fishTex = ['🐠', '🐟', '🐡', '🦑', '🐢'].map(e => new THREE.CanvasTexture(KID.textCanvas(e, { size: 96, pad: 4 })));
    const fishes = [];
    for (let i = 0; i < (q.mobile ? 18 : 36); i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: pick(fishTex), transparent: true }));
      const sz = rand(1.2, 2.6); s.scale.set(sz, sz, 1);
      scene.add(s);
      fishes.push({ s, off: rand(0, 1), side: Math.random() < 0.5 ? -1 : 1, d: rand(3.5, 12), h: rand(1, 9), spd: rand(0.015, 0.04), ph: rand(0, 7) });
    }
    const tlen = ids.length;
    anim((dt, t) => {
      for (const f of fishes) {
        const u = (f.off + t * f.spd) % 1, smp = S[ids[Math.floor(u * (tlen - 1))]];
        const d = smp.w + 2.6 + f.d;
        f.s.position.set(smp.p.x + smp.r.x * f.side * d, smp.p.y + f.h + Math.sin(t * 2 + f.ph) * 0.6, smp.p.z + smp.r.z * f.side * d);
      }
    });
    // 水母
    const jMat = new THREE.MeshLambertMaterial({ color: 0xff9ee8, transparent: true, opacity: 0.55, emissive: 0x7a2a66 });
    for (let i = 0; i < 8; i++) {
      const smp = S[ids[(Math.random() * ids.length) | 0]], side = Math.random() < 0.5 ? -1 : 1, d = smp.w + rand(5, 12);
      const j = new THREE.Mesh(new THREE.SphereGeometry(1.2, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), jMat);
      const x = smp.p.x + smp.r.x * side * d, z = smp.p.z + smp.r.z * side * d, h0 = rand(3, 9), ph = rand(0, 7);
      scene.add(j);
      anim((dt, t) => { j.position.set(x, h0 + Math.sin(t * 0.8 + ph) * 1.5, z); j.scale.set(1 + Math.sin(t * 3 + ph) * 0.12, 1 - Math.sin(t * 3 + ph) * 0.12, 1 + Math.sin(t * 3 + ph) * 0.12); });
    }
    W.tunnelIds = ids;
  }

  function buildFlower(scene, B, q) {
    const ids = ZS.flower;
    // 花
    const cnt = q.mobile ? 1600 : 3600;
    const im = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.55, 0), new THREE.MeshLambertMaterial(), cnt);
    const m4 = new THREE.Matrix4();
    let placed = 0;
    for (let t = 0; t < cnt * 3 && placed < cnt; t++) {
      const sp = spot('flower', 3, 110);
      if (!sp || sp.y < -1) continue;
      const col = STRIPES[((Math.floor((sp.x * 0.6 + sp.z * 0.8) / 14) % 5) + 5) % 5];
      const s = rand(0.7, 1.3);
      m4.compose(new THREE.Vector3(sp.x, sp.y + 0.55 * s, sp.z), new THREE.Quaternion(), new THREE.Vector3(s, s * 0.8, s));
      im.setMatrixAt(placed, m4); im.setColorAt(placed, _c.set(col).multiplyScalar(rand(0.9, 1.1)));
      placed++;
    }
    im.count = placed;
    scene.add(im);
    // 风车
    for (let i = 0; i < 4; i++) {
      const sp = beside(ids[Math.floor((i + 0.5) / 4 * ids.length)], i % 2 ? 1 : -1, rand(30, 45));
      B.add(gTaper(0.6, 8), '#fef3e2', M(sp.x, sp.y + 8, sp.z, 0, 3.6, 16, 3.6));
      B.add(gCone(8), '#9a3412', M(sp.x, sp.y + 18, sp.z, 0, 3, 4, 3));
      B.add(gBox(), '#7c2d12', M(sp.x + Math.sin(sp.face) * 3.1, sp.y + 1.5, sp.z + Math.cos(sp.face) * 3.1, sp.face, 1.6, 3, 0.3));
      const hub = new THREE.Group();
      hub.position.set(sp.x + Math.sin(sp.face) * 3.4, sp.y + 16.5, sp.z + Math.cos(sp.face) * 3.4);
      hub.rotation.y = sp.face;
      const blades = new THREE.Group(); hub.add(blades);
      const bm = new THREE.MeshLambertMaterial({ color: 0xffffff }), fm = new THREE.MeshLambertMaterial({ color: 0x8b5a2b });
      for (let b = 0; b < 4; b++) {
        const arm = new THREE.Group(); arm.rotation.z = b * Math.PI / 2;
        const spar = new THREE.Mesh(new THREE.BoxGeometry(0.35, 10, 0.3), fm); spar.position.y = 5;
        const sail = new THREE.Mesh(new THREE.BoxGeometry(2.4, 7.5, 0.1), bm); sail.position.set(1.3, 6, 0);
        arm.add(spar, sail); blades.add(arm);
      }
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.8, 10, 8), fm); hub.add(cap);
      scene.add(hub);
      const spd = rand(0.8, 1.4);
      anim((dt, t) => { blades.rotation.z = t * spd; });
    }
    // 奶牛、草垛、谷仓、稻草人
    for (let i = 0; i < 7; i++) {
      const sp = spot('flower', 15, 70); if (!sp) continue;
      const f = rand(0, 6.28), fx = Math.sin(f), fz = Math.cos(f);
      B.add(gBox(), '#ffffff', M(sp.x, sp.y + 1.5, sp.z, f, 1.3, 1.2, 2.5));
      B.add(gBox(), '#111827', M(sp.x + 0.66 * Math.cos(f), sp.y + 1.6, sp.z - 0.66 * Math.sin(f), f, 0.05, 0.7, 0.9), 0);
      B.add(gBox(), '#111827', M(sp.x, sp.y + 2.12, sp.z, f, 0.7, 0.05, 0.8), 0);
      B.add(gBox(), '#ffffff', M(sp.x + fx * 1.6, sp.y + 2, sp.z + fz * 1.6, f, 0.9, 0.9, 1));
      B.add(gBox(), '#fbcfe8', M(sp.x + fx * 2.1, sp.y + 1.8, sp.z + fz * 2.1, f, 0.7, 0.45, 0.2), 0);
      for (const lx of [-0.45, 0.45]) for (const lz of [-0.9, 0.9]) B.add(gBox(), '#f1f5f9', M(sp.x + Math.cos(f) * lx + fx * lz, sp.y + 0.45, sp.z - Math.sin(f) * lx + fz * lz, f, 0.3, 0.9, 0.3));
    }
    for (let i = 0; i < 14; i++) { const sp = spot('flower', 8, 60); if (sp) B.add(gCyl(10), '#facc15', M(sp.x, sp.y + 1.1, sp.z, rand(0, 6), 1.1, 2.2, 1.1, Math.PI / 2)); }
    const barn = spot('flower', 50, 70);
    if (barn) {
      B.add(gBox(), '#c62828', M(barn.x, barn.y + 5, barn.z, barn.face, 16, 10, 12));
      B.add(gCyl(3), '#5d4037', M(barn.x, barn.y + 11, barn.z, barn.face + Math.PI / 2, 7.5, 16.2, 7.5, 0, Math.PI / 2));
      B.add(gBox(), '#ffffff', M(barn.x + Math.sin(barn.face) * 6.05, barn.y + 3, barn.z + Math.cos(barn.face) * 6.05, barn.face, 5, 6, 0.1), 0);
    }
    for (let i = 0; i < 3; i++) {
      const sp = spot('flower', 10, 30); if (!sp) continue;
      B.add(gBox(), '#8b5a2b', M(sp.x, sp.y + 1.8, sp.z, sp.face, 0.25, 3.6, 0.25));
      B.add(gBox(), '#8b5a2b', M(sp.x, sp.y + 2.8, sp.z, sp.face, 3, 0.22, 0.22));
      B.add(gBox(), '#2563eb', M(sp.x, sp.y + 2.4, sp.z, sp.face, 1.3, 1.3, 0.6));
      B.add(gSph(8), '#fde68a', M(sp.x, sp.y + 3.6, sp.z, 0, 0.55, 0.6, 0.55));
      B.add(gCone(10), '#a16207', M(sp.x, sp.y + 4.15, sp.z, 0, 0.9, 0.6, 0.9));
    }
    // 蝴蝶
    const bt = new THREE.CanvasTexture(KID.textCanvas('🦋', { size: 96, pad: 4 }));
    for (let i = 0; i < (q.mobile ? 8 : 16); i++) {
      const sp = spot('flower', 2, 30); if (!sp) continue;
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: bt, transparent: true })); s.scale.set(0.9, 0.9, 1);
      scene.add(s);
      const ph = rand(0, 7), r = rand(2, 6);
      anim((dt, t) => {
        s.position.set(sp.x + Math.cos(t * 0.6 + ph) * r, sp.y + 1.6 + Math.sin(t * 2.3 + ph) * 0.6, sp.z + Math.sin(t * 0.8 + ph) * r);
        s.scale.x = 0.9 * (0.4 + Math.abs(Math.sin(t * 12 + ph)) * 0.6);
      });
    }
  }

  function tree(B, x, y, z, s = 1) {
    B.add(gCyl(6), '#6b4226', M(x, y + 1.5 * s, z, 0, 0.45 * s, 3 * s, 0.45 * s));
    const greens = ['#1f6b34', '#2d7d3a', '#236b2e', '#358a42'];
    B.add(gCone(8), pick(greens), M(x, y + 5 * s, z, rand(0, 6), 3.2 * s, 5.5 * s, 3.2 * s));
    B.add(gCone(8), pick(greens), M(x, y + 7.8 * s, z, rand(0, 6), 2.4 * s, 4.5 * s, 2.4 * s));
    B.add(gCone(8), pick(greens), M(x, y + 10 * s, z, rand(0, 6), 1.5 * s, 3.4 * s, 1.5 * s));
  }

  function buildForest(scene, B, q) {
    const ids = ZS.forest;
    const cnt = q.mobile ? 260 : 520;
    for (let i = 0; i < cnt; i++) {
      const sp = spot('forest', 3.5, 140);
      if (!sp || sp.y < -2) continue;
      tree(B, sp.x, sp.y - 0.3, sp.z, rand(0.8, 1.5));
    }
    // 山丘上更多树
    for (let i = 0; i < cnt / 2; i++) {
      const x = rand(430, 820), z = rand(230, 560);
      if (T.roadDist(x, z).d < 5) continue;
      const y = T.terrainHeight(x, z); if (y < 0) continue;
      tree(B, x, y - 0.3, z, rand(0.9, 1.6));
    }
    // 蘑菇屋
    for (let i = 0; i < 6; i++) {
      const sp = spot('forest', 8, 25); if (!sp) continue;
      const s = rand(1, 1.6);
      B.add(gTaper(0.85, 12), '#fff7ed', M(sp.x, sp.y + 1.6 * s, sp.z, 0, 2 * s, 3.2 * s, 2 * s));
      B.add(gBox(), '#8b5a2b', M(sp.x + Math.sin(sp.face) * 1.85 * s, sp.y + 1.1 * s, sp.z + Math.cos(sp.face) * 1.85 * s, sp.face, 0.9 * s, 1.8 * s, 0.2));
      B.add(gHemi(), '#e11d48', M(sp.x, sp.y + 3 * s, sp.z, 0, 3.6 * s, 2.6 * s, 3.6 * s));
      for (let d = 0; d < 7; d++) {
        const a = rand(0, 6.28), e = rand(0.25, 1.2);
        B.add(gSph(6), '#ffffff', M(sp.x + Math.cos(a) * Math.cos(e) * 3.5 * s, sp.y + 3 * s + Math.sin(e) * 2.5 * s, sp.z + Math.sin(a) * Math.cos(e) * 3.5 * s, 0, 0.45 * s, 0.3 * s, 0.45 * s), 0);
      }
    }
    for (let i = 0; i < 30; i++) { const sp = spot('forest', 3, 40); if (sp) B.add(gDode(), '#8b8f94', M(sp.x, sp.y, sp.z, rand(0, 6), rand(0.8, 2.2), rand(0.6, 1.6), rand(0.8, 2.2))); }
    // 光柱
    const shaftMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    for (let i = 0; i < 9; i++) {
      const sp = spot('forest', -4, 20); if (!sp) continue;
      const m = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 4.5, 46, 12, 1, true), shaftMat);
      m.position.set(sp.x, sp.y + 20, sp.z); m.rotation.set(0.35, rand(0, 6), 0.2);
      scene.add(m);
    }
    // 观景台
    let top = ids[0]; for (const i of ids) if (S[i].y > S[top].y) top = i;
    const lk = beside(top - 12, -1, 4.5);
    B.add(gBox(), '#8b5a2b', M(lk.x, lk.y + 0.5, lk.z, lk.face, 8, 1, 6));
    for (const dx of [-3.6, 3.6]) B.add(gBox(), '#6b4424', M(lk.x + Math.cos(lk.face) * dx, lk.y + 1.6, lk.z - Math.sin(lk.face) * dx, lk.face, 0.3, 1.4, 6));
    kid(scene, lk.x, lk.y + 1, lk.z, { h: 2.6 });
    kid(scene, lk.x + Math.cos(lk.face) * 2, lk.y + 1, lk.z - Math.sin(lk.face) * 2, { h: 2.4 });
    const tag = KID.textSprite('⛰ 观景台', 1.8, { bg: 'rgba(22,101,52,.85)', size: 48 });
    tag.position.set(lk.x, lk.y + 5.4, lk.z); scene.add(tag);
  }

  function buildBridge(scene, B, q) {
    const ids = ZS.bridge;
    // 桥墩
    for (let k = 10; k < ids.length - 10; k += 22) {
      const smp = S[ids[k]];
      for (const side of [-1, 1]) {
        const x = smp.p.x + smp.r.x * side * (smp.w - 1), z = smp.p.z + smp.r.z * side * (smp.w - 1);
        const bot = Math.min(T.terrainHeight(x, z), -15), h = smp.y - 1 - bot;
        if (h < 1) continue;
        B.add(gCyl(8), '#9b8f80', M(x, bot + h / 2, z, 0, 1.1, h, 1.1));
      }
      B.add(gBox(), '#6b4424', M(smp.p.x, smp.y - 1.3, smp.p.z, smp.heading, smp.w * 2.2, 0.6, 1.2));
    }
    // 塔和缆索
    const towers = [ids[12], ids[ids.length - 14]];
    const tH = 20;
    const top = towers.map(i => S[i].y + tH);
    for (const i of towers) {
      const smp = S[i];
      for (const side of [-1, 1]) {
        const x = smp.p.x + smp.r.x * side * (smp.w + 2), z = smp.p.z + smp.r.z * side * (smp.w + 2);
        B.add(gBox(), '#c2410c', M(x, smp.y + tH / 2 - 1, z, smp.heading, 1.4, tH + 2, 1.4));
        B.add(gCone(4), '#7c2d12', M(x, smp.y + tH + 1.2, z, smp.heading + Math.PI / 4, 1.2, 1.6, 1.2));
      }
      B.add(gBox(), '#c2410c', M(smp.p.x, smp.y + tH - 1, smp.p.z, smp.heading, smp.w * 2 + 5, 1.2, 1.2));
      B.add(gBox(), '#c2410c', M(smp.p.x, smp.y + tH - 5, smp.p.z, smp.heading, smp.w * 2 + 5, 0.8, 0.8));
    }
    const lines = [];
    const a0 = ids.indexOf(towers[0]), a1 = ids.indexOf(towers[1]);
    for (const side of [-1, 1]) {
      let prev = null;
      for (let k = a0; k <= a1; k++) {
        const smp = S[ids[k]], u = (k - a0) / (a1 - a0);
        const deck = smp.y + 1.2, topY = top[0] + (top[1] - top[0]) * u;
        const y = deck + 1.5 + (topY - deck - 1.5) * (2 * u - 1) ** 2;
        const x = smp.p.x + smp.r.x * side * (smp.w + 2), z = smp.p.z + smp.r.z * side * (smp.w + 2);
        const p = new THREE.Vector3(x, y, z);
        if (prev) lines.push(prev, p);
        if (k % 4 === 0) lines.push(p, new THREE.Vector3(smp.p.x + smp.r.x * side * (smp.w + 1.25), deck, smp.p.z + smp.r.z * side * (smp.w + 1.25)));
        prev = p;
      }
    }
    scene.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(lines), new THREE.LineBasicMaterial({ color: 0x7c2d12 })));
    // 云海
    for (let i = 0; i < (q.mobile ? 50 : 110); i++) {
      const x = rand(10, 470), z = rand(525, 690);
      const y = rand(-11, -5);
      if (T.roadDist(x, z).d < 2 && y > -6) continue;
      for (let j = 0; j < 3; j++) B.add(gSph(8), '#ffffff', M(x + rand(-4, 4), y + rand(-0.6, 0.6), z + rand(-4, 4), 0, rand(3, 7), rand(1.5, 3), rand(3, 7)), 0.03);
    }
    // 河
    const river = new THREE.Mesh(new THREE.PlaneGeometry(560, 200), new THREE.MeshPhongMaterial({ color: 0x3bb0e0, shininess: 80, transparent: true, opacity: 0.92 }));
    river.rotation.x = -Math.PI / 2; river.position.set(230, -14.6, 600); scene.add(river);
    // 瀑布
    const wfTex = canvasTex(64, 256, (g, w, h) => {
      g.fillStyle = '#bfeeff'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 90; i++) { g.fillStyle = pick(['#ffffff', '#8fd8f8', '#e0f7ff']); g.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 4, 20 + Math.random() * 40); }
    });
    const wfx = 485, wfz = 640, wtop = Math.max(2, T.terrainHeight(wfx + 18, wfz));
    const wf = new THREE.Mesh(new THREE.PlaneGeometry(16, wtop + 14.6), new THREE.MeshBasicMaterial({ map: wfTex, transparent: true, opacity: 0.88, side: THREE.DoubleSide }));
    wf.position.set(wfx, (wtop - 14.6) / 2, wfz); wf.rotation.y = -Math.PI / 2;
    scene.add(wf);
    B.add(gDode(), '#7b7f86', M(wfx + 8, wtop - 2, wfz, 0, 14, 6, 14));
    anim((dt, t) => { wfTex.offset.y = t * 1.6; });
    for (let i = 0; i < 5; i++) B.add(gSph(8), '#ffffff', M(wfx - 4 + rand(-3, 3), -14, wfz + rand(-8, 8), 0, rand(3, 5), rand(1.5, 2.5), rand(3, 5)), 0);
  }

  function buildCastle(scene, B, q) {
    const ids = ZS.castle;
    let cx = 0, cz = 0; ids.forEach(i => { cx += S[i].p.x; cz += S[i].p.z; }); cx /= ids.length; cz /= ids.length;
    W.castleCenter = { x: cx, z: cz };
    const outerSide = smp => ((smp.p.x + smp.r.x - cx) ** 2 + (smp.p.z + smp.r.z - cz) ** 2 > (smp.p.x - cx) ** 2 + (smp.p.z - cz) ** 2 ? 1 : -1);
    // 城墙与塔楼
    const flags = [];
    for (let k = 4; k < ids.length - 4; k += 5) {
      const smp = S[ids[k]], so = outerSide(smp), b = beside(ids[k], so, 7);
      B.add(gBox(), '#b9b0a2', M(b.x, b.y + 3.5, b.z, smp.heading, 2, 7, 10.6));
      if (k % 10 < 5) B.add(gBox(), '#a89f91', M(b.x, b.y + 7.6, b.z, smp.heading, 2.2, 1.2, 1.6));
      if (k % 30 === 4) {
        const t = beside(ids[k], so, 9);
        B.add(gCyl(12), '#c9c0b2', M(t.x, t.y + 7, t.z, 0, 3.6, 14, 3.6));
        B.add(gCone(12), k % 60 === 4 ? '#3b5bdb' : '#e03131', M(t.x, t.y + 17, t.z, 0, 4.4, 6, 4.4));
        B.add(gCyl(5), '#334155', M(t.x, t.y + 22, t.z, 0, 0.1, 4, 0.1));
        flags.push({ x: t.x, y: t.y + 23, z: t.z });
      }
    }
    // 城门
    const g0 = ids[8], gs = S[g0];
    for (const side of [-1, 1]) {
      const t = beside(g0, side, 4.5);
      B.add(gCyl(12), '#c9c0b2', M(t.x, t.y + 8, t.z, 0, 4, 16, 4));
      B.add(gCone(12), '#3b5bdb', M(t.x, t.y + 19, t.z, 0, 4.8, 6, 4.8));
      flags.push({ x: t.x, y: t.y + 25, z: t.z });
      B.add(gCyl(5), '#334155', M(t.x, t.y + 23, t.z, 0, 0.1, 4, 0.1));
    }
    B.add(gBox(), '#b9b0a2', M(gs.p.x, gs.y + 13, gs.p.z, gs.heading, gs.w * 2 + 8, 5, 4));
    for (let i = -3; i <= 3; i++) B.add(gBox(), '#a89f91', M(gs.p.x + gs.r.x * i * 3, gs.y + 16, gs.p.z + gs.r.z * i * 3, gs.heading, 1.6, 1.4, 4.2));
    const gt = KID.textSprite('🏰 云端城堡', 2.4, { bg: 'rgba(76,29,149,.85)', color: '#fde68a', size: 56 });
    gt.position.set(gs.p.x, gs.y + 10.3, gs.p.z); scene.add(gt);
    // 旗帜
    const flagGeo = new THREE.PlaneGeometry(3.2, 1.8, 8, 1); flagGeo.translate(1.6, 0, 0);
    flags.forEach((f, i) => {
      const m = new THREE.Mesh(flagGeo.clone(), new THREE.MeshLambertMaterial({ color: pick([0xfacc15, 0xef4444, 0x22c55e, 0xec4899]), side: THREE.DoubleSide }));
      m.position.set(f.x, f.y, f.z); scene.add(m);
      const pa = m.geometry.attributes.position, base = pa.array.slice();
      anim((dt, t) => {
        for (let v = 0; v < pa.count; v++) { const x = base[v * 3]; pa.array[v * 3 + 2] = Math.sin(x * 1.8 - t * 6 + i) * 0.25 * (x / 3.2); }
        pa.needsUpdate = true;
      });
    });
    // 主堡
    const kx = cx - 190, kz = cz + 10;
    const ky = T.terrainHeight(kx, kz);
    B.add(gBox(), '#d6cfc2', M(kx, ky + 11, kz, 0.3, 40, 22, 30));
    for (const [dx, dz] of [[-20, -15], [20, -15], [-20, 15], [20, 15]]) {
      const x = kx + dx * Math.cos(0.3) + dz * Math.sin(0.3), z = kz - dx * Math.sin(0.3) + dz * Math.cos(0.3);
      B.add(gCyl(12), '#e2dccf', M(x, ky + 15, z, 0, 5, 30, 5));
      B.add(gCone(12), '#e03131', M(x, ky + 35, z, 0, 6, 10, 6));
    }
    B.add(gCyl(12), '#e8e2d6', M(kx, ky + 30, kz, 0, 6, 18, 6));
    B.add(gCone(12), '#3b5bdb', M(kx, ky + 46, kz, 0, 7, 16, 7));
    // 喷泉
    const fy = T.terrainHeight(cx, cz);
    B.add(gCyl(24), '#cfc6b8', M(cx, fy + 0.6, cz, 0, 11, 1.2, 11));
    B.add(gCyl(24), '#5ec8f2', M(cx, fy + 1.15, cz, 0, 10.2, 0.1, 10.2), 0);
    B.add(gCyl(12), '#cfc6b8', M(cx, fy + 3, cz, 0, 1, 5, 1));
    B.add(gCyl(16), '#cfc6b8', M(cx, fy + 5.5, cz, 0, 4, 0.6, 4));
    B.add(gCyl(16), '#5ec8f2', M(cx, fy + 5.85, cz, 0, 3.6, 0.1, 3.6), 0);
    W.fountain = { x: cx, y: fy + 6, z: cz };
    for (let i = 0; i < 26; i++) {
      const a = i / 26 * Math.PI * 2, r = rand(16, 24);
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      if (T.roadDist(x, z).d < 3) continue;
      B.add(gBox(), '#2f7d32', M(x, fy + 1, z, -a, 3, 2, 1.4));
      if (i % 3 === 0) B.add(gSph(8), pick(['#f472b6', '#facc15', '#ffffff']), M(x, fy + 2.3, z, 0, 0.8, 0.8, 0.8));
    }
    for (let i = 0; i < 6; i++) kid(scene, cx + Math.cos(i) * 13, fy, cz + Math.sin(i) * 13, { h: 2.4 });
    // 路边灯笼柱
    for (let k = 0; k < ids.length; k += 12) for (const side of [-1, 1]) {
      const b = beside(ids[k], side, 2.8);
      B.add(gBox(), '#4b5563', M(b.x, b.y + 2, b.z, 0, 0.35, 4, 0.35));
      B.add(gBox(), '#ffcf5a', M(b.x, b.y + 4.3, b.z, 0, 0.8, 0.9, 0.8), 0);
    }
  }

  function buildPark(scene, B, q) {
    const ids = ZS.park;
    // 摩天轮
    const fw = { x: -118, z: 175 };
    const fy = T.terrainHeight(fw.x, fw.z), R = 28, hy = fy + R + 6;
    for (const dx of [-3, 3]) for (const dz of [-14, 14]) {
      const len = Math.hypot(dz, hy - fy);
      B.add(gBox(), '#e2e8f0', M(fw.x + dx, (fy + hy) / 2, fw.z + dz / 2, 0, 0.8, len, 0.8, Math.atan2(-dz, hy - fy)));
    }
    const wheel = new THREE.Group(); wheel.position.set(fw.x, hy, fw.z); wheel.rotation.y = Math.PI / 2; scene.add(wheel);
    const rimMat = new THREE.MeshLambertMaterial({ color: 0xff5fa8 });
    for (const dz of [-1.5, 1.5]) { const rim = new THREE.Mesh(new THREE.TorusGeometry(R, 0.5, 6, 48), rimMat); rim.position.z = dz; wheel.add(rim); }
    const spokeMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    for (let i = 0; i < 12; i++) {
      const sp = new THREE.Mesh(new THREE.BoxGeometry(0.3, R * 2, 0.3), spokeMat); sp.rotation.z = i / 12 * Math.PI; wheel.add(sp);
    }
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 4, 12), new THREE.MeshLambertMaterial({ color: 0xfacc15 })); hub.rotation.x = Math.PI / 2; wheel.add(hub);
    const cabins = [];
    const cabCols = [0xef4444, 0xf59e0b, 0x22c55e, 0x3b82f6, 0x8b5cf6, 0xec4899];
    for (let i = 0; i < 12; i++) {
      const c = new THREE.Group();
      const box = new THREE.Mesh(new THREE.BoxGeometry(3, 3, 3), new THREE.MeshLambertMaterial({ color: cabCols[i % 6] })); box.position.y = -2.2;
      const roof = new THREE.Mesh(new THREE.ConeGeometry(2.4, 1.4, 4), new THREE.MeshLambertMaterial({ color: 0xffffff })); roof.position.y = -0.2; roof.rotation.y = Math.PI / 4;
      c.add(box, roof); scene.add(c); cabins.push(c);
    }
    anim((dt, t) => {
      const a0 = t * 0.12;
      wheel.rotation.z = a0;
      cabins.forEach((c, i) => {
        const a = a0 + i / 12 * Math.PI * 2;
        c.position.set(fw.x, hy + Math.sin(a) * R, fw.z - Math.cos(a) * R);
      });
    });
    // 旋转木马
    const cr = { x: 68, z: 232 }, cy = T.terrainHeight(cr.x, cr.z);
    const car = new THREE.Group(); car.position.set(cr.x, cy, cr.z); scene.add(car);
    const plat = new THREE.Mesh(new THREE.CylinderGeometry(10, 10.5, 1.2, 24), new THREE.MeshLambertMaterial({ color: 0xfde68a }));
    plat.position.y = 0.6; car.add(plat);
    const roofG = new THREE.Group(); roofG.position.y = 8; car.add(roofG);
    for (let i = 0; i < 12; i++) {
      const w = new THREE.Mesh(new THREE.ConeGeometry(11, 4.5, 2, 1, false, i / 12 * Math.PI * 2, Math.PI * 2 / 12), new THREE.MeshLambertMaterial({ color: i % 2 ? 0xffffff : 0xec4899 }));
      w.position.y = 2.2; roofG.add(w);
    }
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.9, 10, 8), new THREE.MeshLambertMaterial({ color: 0xfacc15 })); ball.position.y = 13; car.add(ball);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 8, 10), new THREE.MeshLambertMaterial({ color: 0xa78bfa })); pole.position.y = 4.5; car.add(pole);
    const horses = [];
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * Math.PI * 2, hg = new THREE.Group();
      hg.position.set(Math.cos(a) * 7, 0, Math.sin(a) * 7); hg.rotation.y = -a;
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 7.5, 6), new THREE.MeshLambertMaterial({ color: 0xfacc15 })); p.position.y = 4.6; hg.add(p);
      const h = new THREE.Group();
      const hc = [0xffffff, 0xfbcfe8, 0xbae6fd, 0xfde68a][i % 4];
      const hm = new THREE.MeshLambertMaterial({ color: hc });
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1, 2.4), hm);
      const neck = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.4, 0.7), hm); neck.position.set(0, 0.8, 1); neck.rotation.x = -0.4;
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 1.1), hm); head.position.set(0, 1.4, 1.5);
      h.add(body, neck, head); hg.add(h); car.add(hg); horses.push(h);
    }
    anim((dt, t) => {
      car.rotation.y = t * 0.5;
      horses.forEach((h, i) => { h.position.y = 2.6 + Math.sin(t * 2.4 + i) * 0.7; });
    });
    // 过山车（横跨冲刺直道）
    const cp = [[-150, 6, 70], [-100, 18, 115], [-50, 22, 100], [0, 16, 95], [45, 24, 120], [95, 14, 80], [130, 9, 30], [110, 20, -20], [60, 12, 10], [10, 15, 40], [-60, 12, 30], [-120, 8, 20]];
    const cc = new THREE.CatmullRomCurve3(cp.map(p => new THREE.Vector3(p[0], T.terrainHeight(p[0], p[2]) + p[1], p[2])), true);
    scene.add(new THREE.Mesh(new THREE.TubeGeometry(cc, 300, 0.45, 6, true), new THREE.MeshLambertMaterial({ color: 0xef4444 })));
    for (let i = 0; i < 60; i++) {
      const p = cc.getPoint(i / 60);
      if (T.roadDist(p.x, p.z).d < 3) continue;
      const gy = T.terrainHeight(p.x, p.z), h = p.y - gy;
      if (h > 1) B.add(gCyl(6), '#f8fafc', M(p.x, gy + h / 2, p.z, 0, 0.35, h, 0.35));
    }
    const train = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.2, 2.6), new THREE.MeshLambertMaterial({ color: [0xfacc15, 0x3b82f6, 0x22c55e, 0xa855f7][i] }));
      c.userData.i = i; train.add(c);
    }
    scene.add(train);
    const tmp = new THREE.Vector3();
    anim((dt, t) => {
      train.children.forEach(c => {
        const u = ((t * 0.045 - c.userData.i * 0.006) % 1 + 1) % 1;
        cc.getPointAt(u, c.position); c.position.y += 1;
        cc.getPointAt((u + 0.003) % 1, tmp); tmp.y += 1; c.lookAt(tmp);
      });
    });
    // 马戏帐篷
    const tent = { x: 75, z: 120 };
    const ty = T.terrainHeight(tent.x, tent.z);
    for (let i = 0; i < 16; i++) {
      const col = i % 2 ? '#ffffff' : '#ef4444';
      const wedge = geo('tentW' + i, () => new THREE.CylinderGeometry(1, 1, 1, 2, 1, true, i / 16 * Math.PI * 2, Math.PI * 2 / 16));
      const cone = geo('tentC' + i, () => new THREE.ConeGeometry(1, 1, 2, 1, true, i / 16 * Math.PI * 2, Math.PI * 2 / 16));
      B.add(wedge, col, M(tent.x, ty + 3, tent.z, 0, 14, 6, 14), 0);
      B.add(cone, col, M(tent.x, ty + 10, tent.z, 0, 15, 8, 15), 0);
    }
    B.add(gCyl(6), '#facc15', M(tent.x, ty + 15, tent.z, 0, 0.2, 3, 0.2));
    // 气球
    const bcount = q.mobile ? 30 : 60;
    const bal = new THREE.InstancedMesh(new THREE.SphereGeometry(0.9, 10, 8), new THREE.MeshLambertMaterial(), bcount);
    const bs = [];
    for (let i = 0; i < bcount; i++) {
      const sp = i < bcount * 0.6 ? spot('park', 2, 25) : spot('town', 2, 10);
      if (!sp) { bs.push(null); continue; }
      bs.push({ x: sp.x, y: sp.y + rand(4, 9), z: sp.z, ph: rand(0, 7) });
      bal.setColorAt(i, _c.set(pick(['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#ec4899', '#facc15'])));
    }
    scene.add(bal);
    const bm = new THREE.Matrix4(), bq = new THREE.Quaternion(), bsc = new THREE.Vector3(1, 1.2, 1), bp = new THREE.Vector3();
    anim((dt, t) => {
      for (let i = 0; i < bcount; i++) {
        const b = bs[i]; if (!b) { bm.makeScale(0, 0, 0); bal.setMatrixAt(i, bm); continue; }
        bp.set(b.x + Math.sin(t * 0.7 + b.ph) * 0.5, b.y + Math.sin(t * 1.3 + b.ph) * 0.6, b.z);
        bm.compose(bp, bq, bsc); bal.setMatrixAt(i, bm);
      }
      bal.instanceMatrix.needsUpdate = true;
    });
    // 入口彩虹拱门
    const ai = ids[Math.floor(ids.length * 0.15)], as = S[ai];
    const archCols = ['#ef4444', '#f97316', '#facc15', '#22c55e', '#3b82f6', '#8b5cf6'];
    archCols.forEach((col, k) => {
      const R = as.w + 3 + k * 0.7;
      const basis = new THREE.Matrix4().makeBasis(as.r, UP, as.th.clone().negate());
      const m = new THREE.Matrix4().makeTranslation(as.p.x, as.y, as.p.z).multiply(basis).multiply(new THREE.Matrix4().makeScale(R, R, 20));
      B.add(geo('tor2', () => new THREE.TorusGeometry(1, 0.035, 6, 24, Math.PI)), col, m, 0);
    });
    const pt = KID.textSprite('🎡 游乐园', 2.4, { bg: 'rgba(190,24,93,.85)', size: 56 });
    pt.position.set(as.p.x, as.y + as.w + 9, as.p.z); scene.add(pt);
    // 观众
    for (let i = 0; i < 18; i++) { const sp = spot('park', 2.5, 12); if (sp) kid(scene, sp.x, sp.y, sp.z, { h: 2.4 }); }
  }

  function buildGlobal(scene, B, q) {
    // 远山
    const mb = new Batch();
    for (let i = 0; i < 46; i++) {
      const a = rand(-0.15, Math.PI + 0.15) + Math.PI * 0; // 南、东、西三面
      const ang = a;
      const r = rand(1250, 1650);
      const x = 200 + Math.cos(ang) * r, z = 0 + Math.sin(ang) * r;
      const h = rand(160, 380), w = rand(220, 380);
      mb.add(gCone(7), pick(['#7fa6c8', '#8fb3cf', '#6f97bb']), M(x, h / 2 - 10, z, rand(0, 6), w, h, w), 0.04);
      if (h > 260) mb.add(gCone(7), '#f1f5f9', M(x, h - 10 - h * 0.12, z, rand(0, 6), w * 0.25, h * 0.25, w * 0.25), 0);
    }
    for (const side of [-1, 1]) for (let i = 0; i < 10; i++) {
      const x = 200 + side * rand(1150, 1500), z = rand(-700, 0);
      const h = rand(140, 300), w = rand(200, 320);
      mb.add(gCone(7), pick(['#7fa6c8', '#8fb3cf']), M(x, h / 2 - 10, z, rand(0, 6), w, h, w), 0.04);
    }
    W.mountains = mb.build(new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }));
    scene.add(W.mountains);
    // 外围地面（只铺在地形网格外，避免盖住山谷）
    const landMat = new THREE.MeshLambertMaterial({ color: 0x78c24e });
    for (const [x0, x1, z0, z1] of [[-4500, 4900, 768, 6000], [-4500, -528, -600, 768], [928, 4900, -600, 768]]) {
      const land = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), landMat);
      land.rotation.x = -Math.PI / 2; land.position.set((x0 + x1) / 2, -0.8, (z0 + z1) / 2); scene.add(land);
    }
    // 云
    const cb = new Batch();
    for (let i = 0; i < 34; i++) {
      const a = rand(0, Math.PI * 2), r = rand(300, 1500);
      const x = 200 + Math.cos(a) * r, z = Math.sin(a) * r, y = rand(150, 260);
      for (let j = 0; j < 5; j++) cb.add(gSph(8), '#ffffff', M(x + rand(-30, 30), y + rand(-6, 6), z + rand(-14, 14), 0, rand(16, 30), rand(9, 15), rand(14, 24)), 0.02);
    }
    const clouds = cb.build(new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, transparent: true, opacity: 0.92 }));
    W.clouds = clouds;
    scene.add(clouds);
    clouds.position.set(0, 0, 0);
    anim((dt, t) => { clouds.rotation.y = t * 0.004; });
    // 热气球
    for (let i = 0; i < 5; i++) {
      const g = new THREE.Group();
      const cols = [[0xef4444, 0xfacc15], [0x3b82f6, 0xffffff], [0x22c55e, 0xfde68a], [0xa855f7, 0xf472b6], [0xf97316, 0xffffff]][i];
      for (let k = 0; k < 10; k++) {
        const seg = new THREE.Mesh(new THREE.SphereGeometry(8, 3, 12, k / 10 * Math.PI * 2, Math.PI * 2 / 10), new THREE.MeshLambertMaterial({ color: cols[k % 2] }));
        seg.scale.y = 1.2; g.add(seg);
      }
      const basket = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2, 2.6), new THREE.MeshLambertMaterial({ color: 0x8b5a2b })); basket.position.y = -13; g.add(basket);
      scene.add(g);
      const bx = rand(-300, 800), bz = rand(-500, 600), by = rand(70, 120), ph = rand(0, 7);
      anim((dt, t) => { g.position.set(bx + Math.sin(t * 0.03 + ph) * 120, by + Math.sin(t * 0.3 + ph) * 4, bz + Math.cos(t * 0.025 + ph) * 100); });
    }
  }

  // ---------- 粒子 ----------
  function makeParticles(scene, max) {
    const pos = new Float32Array(max * 3), col = new Float32Array(max * 3), size = new Float32Array(max), alpha = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('pcolor', new THREE.BufferAttribute(col, 3));
    g.setAttribute('size', new THREE.BufferAttribute(size, 1));
    g.setAttribute('alpha', new THREE.BufferAttribute(alpha, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      vertexShader: `attribute float size; attribute float alpha; attribute vec3 pcolor; varying vec3 vC; varying float vA;
        void main(){ vC = pcolor; vA = alpha; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = size * 300.0 / max(1.0, -mv.z); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying vec3 vC; varying float vA; void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d); if (r > 0.5) discard; gl_FragColor = vec4(vC, vA * smoothstep(0.5, 0.15, r)); }`
    });
    const pts = new THREE.Points(g, mat); pts.frustumCulled = false; scene.add(pts);
    const P = [];
    for (let i = 0; i < max; i++) P.push({ life: 0 });
    let head = 0;
    const FX = {
      emit(x, y, z, vx, vy, vz, color, sz, life, grav = 0) {
        const p = P[head]; head = (head + 1) % max;
        Object.assign(p, { x, y, z, vx, vy, vz, sz, life, max: life, grav });
        _c.set(color); p.r = _c.r; p.g = _c.g; p.b = _c.b;
      },
      update(dt) {
        for (let i = 0; i < max; i++) {
          const p = P[i];
          if (p.life > 0) {
            p.life -= dt; p.vy -= p.grav * dt;
            p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
            pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
            col[i * 3] = p.r; col[i * 3 + 1] = p.g; col[i * 3 + 2] = p.b;
            size[i] = p.sz * (0.6 + 0.4 * p.life / p.max); alpha[i] = Math.min(1, p.life / p.max * 1.5);
          } else alpha[i] = 0;
        }
        g.attributes.position.needsUpdate = g.attributes.pcolor.needsUpdate = g.attributes.size.needsUpdate = g.attributes.alpha.needsUpdate = true;
      }
    };
    return FX;
  }

  // ---------- 入口 ----------
  W.build = function (scene, q) {
    W.sky = makeSky(); scene.add(W.sky);
    scene.fog = new THREE.Fog(Z.town.fog, Z.town.fogNear, Z.town.fogFar);
    W.hemi = new THREE.HemisphereLight(0xffffff, 0x6b8f4e, 0.75);
    W.sun = new THREE.DirectionalLight(0xfff4e0, 0.75); W.sun.position.set(300, 500, -400);
    scene.add(W.hemi, W.sun, new THREE.AmbientLight(0xffffff, 0.12));

    scene.add(makeTerrain(q));
    const road = new THREE.Group(); makeRoad(road); scene.add(road);

    const B = new Batch();
    buildTown(scene, B, q);
    buildBeach(scene, B, q);
    buildTunnel(scene, B, q);
    buildFlower(scene, B, q);
    buildForest(scene, B, q);
    buildBridge(scene, B, q);
    buildCastle(scene, B, q);
    buildPark(scene, B, q);
    buildGlobal(scene, B, q);
    scene.add(B.build(new THREE.MeshLambertMaterial({ vertexColors: true })));

    W.fx = makeParticles(scene, q.mobile ? 500 : 1200);
    W.zoneCur = 'town';
    W.cur = { top: new THREE.Color(Z.town.skyTop), bottom: new THREE.Color(Z.town.skyBottom), fog: new THREE.Color(Z.town.fog), near: Z.town.fogNear, far: Z.town.fogFar, light: 1 };
  };

  const _t1 = new THREE.Color(), _t2 = new THREE.Color(), _t3 = new THREE.Color();
  W.update = function (dt, t, camera, zone, scene) {
    W.sky.position.copy(camera.position);
    const z = Z[zone] || Z.town, k = Math.min(1, dt * 1.4), c = W.cur;
    c.top.lerp(_t1.set(z.skyTop), k); c.bottom.lerp(_t2.set(z.skyBottom), k); c.fog.lerp(_t3.set(z.fog), k);
    c.near += (z.fogNear - c.near) * k; c.far += (z.fogFar - c.far) * k; c.light += (z.light - c.light) * k;
    W.sky.material.uniforms.top.value.copy(c.top); W.sky.material.uniforms.bottom.value.copy(c.bottom);
    scene.fog.color.copy(c.fog); scene.fog.near = c.near; scene.fog.far = c.far;
    W.hemi.intensity = 0.75 * c.light; W.sun.intensity = 0.75 * c.light;
    const open = c.far > 380;
    W.mountains.visible = W.clouds.visible = open;
    for (const a of W.anims) a(dt, t);
    const e = camera.matrixWorld.elements;
    for (const kd of W.kids) {
      const ph = kd.ph + t * kd.speed * 0.5;
      if (kd.jump) kd.g.position.y = kd.y + Math.max(0, Math.sin(ph)) * 0.35;
      if (kd.arm) {
        kd.arm.material.rotation = 2.5 + Math.sin(t * kd.speed + kd.ph) * 0.45;
        kd.arm.position.set(e[0] * kd.ox, kd.oy + e[1] * kd.ox, e[2] * kd.ox);
      }
    }
    if (W.boostMat) W.boostMat.map.offset.y = -t * 1.5;
    if (W.fountain) {
      const f = W.fountain;
      for (let i = 0; i < 3; i++) {
        const a = Math.random() * Math.PI * 2, sp = rand(1.2, 2.4);
        W.fx.emit(f.x, f.y, f.z, Math.cos(a) * sp, rand(6, 8), Math.sin(a) * sp, Math.random() < 0.5 ? '#bfeeff' : '#ffffff', 0.5, 1.6, 9.8);
      }
    }
    W.fx.update(dt);
  };

  window.WORLD = W;
})();
