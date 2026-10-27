// 赛道：控制点、分区、采样与几何查询
(function (root) {
  const THREE = root.THREE;

  const ZONES = {
    town:   { name: '小白小镇',   icon: '🏠', width: 9.5, road: 'asphalt', wall: 'town',
              skyTop: 0x4fa8ff, skyBottom: 0xd8f0ff, fog: 0xcfe8ff, fogNear: 160, fogFar: 720, light: 1.0 },
    beach:  { name: '海滨大道',   icon: '🌊', width: 9.5, road: 'asphalt', wall: 'beach',
              skyTop: 0x2f9cff, skyBottom: 0xbff0ff, fog: 0xc6eefc, fogNear: 180, fogFar: 820, light: 1.05 },
    tunnel: { name: '海底隧道',   icon: '🐠', width: 8.5, road: 'tunnel', wall: 'tunnel',
              skyTop: 0x042a52, skyBottom: 0x0a5f8f, fog: 0x0a4f7f, fogNear: 6, fogFar: 150, light: 0.6 },
    flower: { name: '风车花田',   icon: '🌷', width: 9.5, road: 'asphalt', wall: 'fence',
              skyTop: 0x5ab4ff, skyBottom: 0xfff1d6, fog: 0xffeedd, fogNear: 170, fogFar: 760, light: 1.05 },
    forest: { name: '森林山路',   icon: '🌲', width: 9, road: 'asphalt', wall: 'wood',
              skyTop: 0x3f8fd6, skyBottom: 0xd9f2c4, fog: 0xbfe0b0, fogNear: 90, fogFar: 520, light: 0.9 },
    bridge: { name: '云端吊桥',   icon: '🌉', width: 8, road: 'wood', wall: 'rope',
              skyTop: 0x6d7fe0, skyBottom: 0xffd2b8, fog: 0xf7d8d0, fogNear: 160, fogFar: 820, light: 1.0 },
    castle: { name: '云端城堡',   icon: '🏰', width: 11, road: 'stone', wall: 'stone',
              skyTop: 0x7a5cd6, skyBottom: 0xffb48a, fog: 0xf5c0a8, fogNear: 140, fogFar: 700, light: 0.95 },
    park:   { name: '游乐园冲刺', icon: '🎡', width: 10, road: 'asphalt', wall: 'park',
              skyTop: 0x3d9bff, skyBottom: 0xffe0f0, fog: 0xffe3f2, fogNear: 170, fogFar: 760, light: 1.05 }
  };

  // [x, y, z, 区域]；起点在第 0 个点，朝 -z 方向出发
  const CTRL = [
    [0, 0, 0, 'town'], [0, 0, -170, 'town'], [0, 0, -330, 'town'],
    [40, 0, -460, 'beach'], [140, 0, -545, 'beach'], [290, 0, -585, 'beach'], [440, 0, -570, 'beach'],
    [560, 0, -515, 'tunnel'], [650, 0, -430, 'tunnel'], [700, 0, -320, 'tunnel'],
    [705, 0, -210, 'flower'], [640, 0, -130, 'flower'], [650, 0, -40, 'flower'], [740, 0, 20, 'flower'],
    [770, 0, 110, 'flower'], [720, 0, 195, 'flower'],
    [700, 5, 275, 'forest'], [730, 11, 360, 'forest'], [705, 15, 435, 'forest'], [640, 18, 455, 'forest'],
    [600, 21, 400, 'forest'], [550, 25, 330, 'forest'], [485, 28, 325, 'forest'], [450, 30, 385, 'forest'],
    [460, 32, 455, 'forest'],
    [430, 31, 530, 'bridge'], [330, 24, 580, 'bridge'], [200, 14, 595, 'bridge'], [80, 5, 585, 'bridge'],
    [-50, 0, 565, 'castle'], [-170, 0, 555, 'castle'], [-275, 0, 505, 'castle'], [-320, 0, 420, 'castle'],
    [-280, 0, 340, 'castle'],
    [-175, 0, 300, 'park'], [-70, 0, 310, 'park'], [-12, 0, 255, 'park'], [0, 0, 160, 'park']
  ];

  // 跳台：在第 at 个控制点之后 off 米处达到最高点
  const RAMPS = [{ at: 10, off: 12, len: 24, h: 2.6 }, { at: 35, off: 40, len: 22, h: 2.2 }];
  // 加速带
  const BOOSTS = [{ at: 31, off: 0 }, { at: 32, off: 30 }, { at: 36, off: 60 }, { at: 1, off: -60 }];
  // 道具箱行
  const ITEM_ROWS = [{ at: 1, off: -40 }, { at: 4, off: 20 }, { at: 8, off: 0 }, { at: 12, off: 0 },
                     { at: 17, off: 20 }, { at: 22, off: 0 }, { at: 27, off: 0 }, { at: 30, off: 20 }, { at: 35, off: 0 }];

  const SUB = 80;
  const up = new THREE.Vector3(0, 1, 0);
  const curve = new THREE.CatmullRomCurve3(CTRL.map(c => new THREE.Vector3(c[0], c[1], c[2])), true, 'centripetal');
  const n = CTRL.length;

  const dense = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < SUB; j++) {
    dense.push({ p: curve.getPoint((i + j / SUB) / n), zone: CTRL[i][3] });
  }
  const cum = [0];
  for (let i = 1; i <= dense.length; i++) cum.push(cum[i - 1] + dense[i % dense.length].p.distanceTo(dense[i - 1].p));
  const L = cum[dense.length];
  const ctrlS = CTRL.map((c, i) => cum[i * SUB]);

  const N = Math.round(L / 2);
  const STEP = L / N;
  const S = []; // samples
  let j = 0;
  for (let k = 0; k < N; k++) {
    const s = k * STEP;
    while (cum[j + 1] < s) j++;
    const a = dense[j], b = dense[(j + 1) % dense.length];
    const f = (s - cum[j]) / Math.max(1e-6, cum[j + 1] - cum[j]);
    S.push({ s, p: a.p.clone().lerp(b.p, f), zone: a.zone });
  }

  const sOf = (spec) => ((ctrlS[spec.at] + (spec.off || 0)) % L + L) % L;
  for (const r of RAMPS) {
    const top = sOf(r);
    r.s = top;
    for (const smp of S) {
      let d = top - smp.s; if (d < -L / 2) d += L; if (d > L / 2) d -= L;
      if (d >= 0 && d <= r.len) smp.p.y += r.h * (1 - d / r.len);
    }
  }
  BOOSTS.forEach(b => b.s = sOf(b));
  ITEM_ROWS.forEach(b => b.s = sOf(b));

  for (let k = 0; k < N; k++) {
    const smp = S[k];
    const a = S[(k - 1 + N) % N].p, b = S[(k + 1) % N].p;
    smp.t = b.clone().sub(a).normalize();
    const th = new THREE.Vector3(smp.t.x, 0, smp.t.z).normalize();
    smp.th = th;
    smp.r = new THREE.Vector3().crossVectors(th, up).normalize();
    smp.heading = Math.atan2(-th.x, -th.z);
    smp.y = smp.p.y;
  }
  // 宽度平滑过渡
  const raw = S.map(s => ZONES[s.zone].width);
  for (let k = 0; k < N; k++) {
    let sum = 0; for (let d = -10; d <= 10; d++) sum += raw[(k + d + N) % N];
    S[k].w = sum / 21;
  }
  for (let k = 0; k < N; k++) {
    let d = S[(k + 1) % N].heading - S[k].heading;
    while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
    S[k].curv = d / STEP;
  }

  // 空间网格
  const CELL = 32;
  const grid = new Map();
  const key = (cx, cz) => cx * 100003 + cz;
  S.forEach((smp, i) => {
    const k = key(Math.floor(smp.p.x / CELL), Math.floor(smp.p.z / CELL));
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(i);
  });
  function forNear(x, z, radCells, fn) {
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
    for (let a = -radCells; a <= radCells; a++) for (let b = -radCells; b <= radCells; b++) {
      const list = grid.get(key(cx + a, cz + b));
      if (list) for (const i of list) fn(i);
    }
  }

  function nearest(x, z, hint) {
    let best = -1, bd = Infinity;
    if (hint != null && hint >= 0) {
      for (let d = -30; d <= 30; d++) {
        const i = (hint + d + N) % N, p = S[i].p;
        const dd = (p.x - x) ** 2 + (p.z - z) ** 2;
        if (dd < bd) { bd = dd; best = i; }
      }
      if (bd < 900) return best;
    }
    forNear(x, z, 2, i => {
      const p = S[i].p, dd = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (dd < bd) { bd = dd; best = i; }
    });
    if (best < 0) for (let i = 0; i < N; i++) {
      const p = S[i].p, dd = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (dd < bd) { bd = dd; best = i; }
    }
    return best;
  }

  // 把世界坐标投影到赛道：返回采样序号、赛道距离、横向偏移、路面高度
  function project(x, z, hint) {
    const i = nearest(x, z, hint);
    const smp = S[i];
    const dx = x - smp.p.x, dz = z - smp.p.z;
    const along = dx * smp.th.x + dz * smp.th.z;
    const lat = dx * smp.r.x + dz * smp.r.z;
    const o = S[(i + (along >= 0 ? 1 : -1) + N) % N];
    const f = Math.min(1, Math.abs(along) / STEP);
    const y = smp.y + (o.y - smp.y) * f;
    return { i, s: ((smp.s + along) % L + L) % L, lat, y, w: smp.w + (o.w - smp.w) * f, zone: smp.zone };
  }

  function at(s) {
    s = ((s % L) + L) % L;
    const k = Math.floor(s / STEP), f = s / STEP - k;
    const a = S[k % N], b = S[(k + 1) % N];
    return {
      i: k % N,
      p: a.p.clone().lerp(b.p, f),
      r: a.r, th: a.th, t: a.t, w: a.w + (b.w - a.w) * f, zone: a.zone, heading: a.heading
    };
  }

  function roadDist(x, z) {
    let bd = Infinity, bi = -1;
    forNear(x, z, 3, i => {
      const p = S[i].p, dd = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (dd < bd) { bd = dd; bi = i; }
    });
    return bi < 0 ? { d: 1e9, i: -1 } : { d: Math.sqrt(bd) - S[bi].w, i: bi };
  }

  const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

  function baseHeight(x, z) {
    let h = 0;
    h -= 7 * smooth(-625, -690, z);                       // 北面大海
    const vx = Math.min(smooth(-10, 40, x), smooth(500, 450, x));
    const vz = Math.min(smooth(500, 540, z), smooth(700, 650, z));
    h -= 16 * Math.min(vx, vz);                           // 吊桥下的山谷
    const fd = Math.hypot(x - 610, z - 400);
    h += 26 * Math.max(0, 1 - fd / 210) ** 1.6 * (1 - Math.min(vx, vz)); // 森林山丘
    h += Math.sin(x * 0.013) * Math.cos(z * 0.011) * 2.2 + Math.sin(x * 0.041 + z * 0.03) * 0.6;
    return h;
  }

  function terrainHeight(x, z) {
    const base = baseHeight(x, z);
    let ws = 0, ys = 0, dmin = Infinity, wmin = 10;
    forNear(x, z, 3, i => {
      const smp = S[i];
      if (smp.zone === 'bridge') return;
      const d = Math.hypot(smp.p.x - x, smp.p.z - z);
      if (d > 96) return;
      const w = 1 / (1 + (d / 5) ** 4);
      ws += w; ys += w * smp.y;
      if (d < dmin) { dmin = d; wmin = smp.w; }
    });
    if (ws === 0) return base;
    const roadH = ys / ws;
    const f = smooth(wmin + 2.5, wmin + 75, dmin);
    return roadH - 0.9 + (base - (roadH - 0.9)) * f;
  }

  root.TRACK = {
    ZONES, CTRL, RAMPS, BOOSTS, ITEM_ROWS, S, N, L, STEP, ctrlS, curve,
    project, nearest, at, roadDist, terrainHeight, baseHeight, smooth, forNear
  };
})(typeof window !== 'undefined' ? window : globalThis);
