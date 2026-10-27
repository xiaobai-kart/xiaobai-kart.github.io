// 小孩贴图：拼合正面 / 背面 / 换色 / 挥手手臂，以及文字贴图工具
(function () {
  const M = window.MASCOT;
  const IMG = {};

  const COLORS = [
    { id: 'red',    name: '小红', hue: null, hex: 0xef3340, css: '#ef3340' },
    { id: 'blue',   name: '小蓝', hue: 212,  hex: 0x2f7cf6, css: '#2f7cf6' },
    { id: 'green',  name: '小绿', hue: 135,  hex: 0x22b455, css: '#22b455' },
    { id: 'purple', name: '小紫', hue: 272,  hex: 0x8b5cf6, css: '#8b5cf6' },
    { id: 'orange', name: '小橙', hue: 28,   hex: 0xff8a1f, css: '#ff8a1f' },
    { id: 'pink',   name: '小粉', hue: 325,  hex: 0xff5fb0, css: '#ff5fb0' }
  ];

  // 原吉祥物在 64×112 坐标系中的部件位置
  const PARTS = {
    legL:  { x: 18.77, y: 97.41, w: 9.34,  h: 14.38 },
    legR:  { x: 36.09, y: 97.41, w: 9.13,  h: 14.59 },
    torso: { x: 10.79, y: 72,    w: 42.42, h: 27.82 },
    armL:  { x: 7.22,  y: 72.42, w: 13.54, h: 19.21, rot: -8, px: 17.72, py: 73.68 },
    armR:  { x: 43.23, y: 72.42, w: 13.54, h: 19.21, rot: 8,  px: 46.28, py: 73.68 },
    head:  { x: 6,     y: 0,     w: 52,    h: 77.1 }
  };

  const KIMG = {};
  function load() {
    const one = (src, put) => new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => { put(im); res(); };
      im.onerror = rej;
      im.src = src;
    });
    return Promise.all([
      ...Object.keys(M).map(k => one(M[k], im => { IMG[k] = im; })),
      ...Object.keys(window.KART_IMG).map(k => one(window.KART_IMG[k], im => { KIMG[k] = im; }))
    ]);
  }

  // 卡丁车视角：seat 为小孩臀部所在像素；front 为盖在小孩前面的车身区域（all = 整车都在小孩前面）
  // side 为原图镜头所在的车侧（R/L），另一侧水平镜像
  const KART_VIEWS = {
    rear:    { seat: [181, 126], back: true,  front: 'all', side: null },
    rear34:  { seat: [196, 112], back: true,  front: 'all', side: 'R' },
    side:    { seat: [262, 130], back: false, front: [[0, 98, 1e4, 1e4]], side: 'L' },
    front34: { seat: [166, 170], back: false, front: [[0, 140, 1e4, 1e4], [258, 64, 1e4, 1e4], [0, 86, 100, 1e4]], side: 'R' },
    front:   { seat: [193, 142], back: false, front: [[0, 114, 1e4, 1e4], [0, 64, 148, 1e4], [244, 64, 1e4, 1e4]], side: null }
  };
  const KART_PX2M = 2.9 / 362;
  const KID_W = 212;
  const carCache = {};
  function carCanvas(color, view) {
    const key = color.id + view;
    if (carCache[key]) return carCache[key];
    const im = KIMG[view], c = canvas(im.width, im.height);
    c.getContext('2d').drawImage(im, 0, 0);
    return (carCache[key] = recolor(c, color));
  }
  // 车轮动画层（与无车手的车贴图同尺寸）：rims 为轮圈椭圆 [cx, cy, rx, ry]，tread 为正对镜头的轮胎区域 [x0, y0, x1, y1, 胎纹滚动方向]
  // 原图中 side 车头朝左，其余斜视角车头朝右，前进时轮辐转向因此相反
  const WHEELS = {
    rear:    { rims: [], tread: [[12, 122, 78, 262, -1], [284, 122, 350, 262, -1]] },
    rear34:  { rims: [[229, 199, 29, 40], [346, 148, 13, 37]], tread: [[2, 92, 50, 200, -1]] },
    side:    { rims: [[99, 189, 36, 36], [354, 187, 36, 36]], tread: [] },
    front34: { rims: [[129, 234, 22, 34], [36, 174, 21, 38]], tread: [] },
    front:   { rims: [], tread: [[18, 145, 76, 265, 1], [312, 145, 372, 265, 1]] }
  };
  const WHEEL_FRAMES = 4, SPOKES = 5, TREAD_GAP = 16;
  function wheelMask(view) {
    const im = KIMG[view], c = canvas(im.width, im.height), g = c.getContext('2d');
    g.drawImage(im, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height), a = d.data;
    for (let i = 0; i < a.length; i += 4) {
      const r = a[i], gg = a[i + 1], b = a[i + 2];
      const lum = 0.3 * r + 0.59 * gg + 0.11 * b, sat = Math.max(r, gg, b) - Math.min(r, gg, b);
      a[i + 3] = a[i + 3] > 200 && lum < 110 && sat < 60 ? 255 : 0;
    }
    g.putImageData(d, 0, 0);
    return c;
  }
  function wheelFrames(view) {
    const im = KIMG[view], Wd = WHEELS[view], mask = wheelMask(view);
    const frames = [];
    for (let f = 0; f < WHEEL_FRAMES; f++) {
      const c = canvas(im.width, im.height + 4), g = c.getContext('2d');
      g.translate(0, 4);
      for (const [cx, cy, rx, ry] of Wd.rims) {
        g.save(); g.translate(cx, cy); g.scale(rx, ry);
        g.rotate((view === 'side' ? -1 : 1) * f / WHEEL_FRAMES * Math.PI * 2 / SPOKES);
        for (let k = 0; k < SPOKES; k++) {
          g.rotate(Math.PI * 2 / SPOKES);
          g.fillStyle = '#a7adb8'; g.fillRect(0.26, -0.08, 0.62, 0.16);
          g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(0.26, 0.04, 0.62, 0.04);
        }
        g.restore();
      }
      for (const [x0, y0, x1, y1, dir] of Wd.tread) {
        g.save(); g.beginPath(); g.rect(x0, y0, x1 - x0, y1 - y0); g.clip();
        g.fillStyle = 'rgba(130,136,148,.55)';
        const off = f / WHEEL_FRAMES * TREAD_GAP * dir;
        for (let y = y0 - TREAD_GAP; y < y1 + TREAD_GAP; y += TREAD_GAP) g.fillRect(x0, y + off, x1 - x0, 4);
        g.restore();
      }
      g.globalCompositeOperation = 'destination-in';
      g.drawImage(mask, 0, 0);
      frames.push(c);
    }
    return frames;
  }

  // 返回 { canvas, w, h（米）, cy（锚点高度比例）}
  function kartCanvas(color, view, scale = 1, noKid = false) {
    const V = KART_VIEWS[view], car = carCanvas(color, view);
    if (noKid) {
      const W = car.width, H = car.height + 4;
      const c = canvas(Math.round(W * scale), Math.round(H * scale)), g = c.getContext('2d');
      g.scale(scale, scale); g.drawImage(car, 0, 4);
      return { canvas: c, w: W * KART_PX2M, h: H * KART_PX2M, cy: 6 / H };
    }
    const kid = figure(color, { legs: false, back: V.back });
    const kw = KID_W, kh = kw * kid.height / kid.width;
    const kx = V.seat[0] - kw / 2, ky = V.seat[1] - kh;
    const top = Math.min(0, ky) - 4;
    const W = car.width, H = car.height - top;
    const c = canvas(Math.round(W * scale), Math.round(H * scale)), g = c.getContext('2d');
    g.scale(scale, scale); g.translate(0, -top);
    if (V.front === 'all') {
      g.drawImage(kid, kx, ky, kw, kh);
      g.drawImage(car, 0, 0);
    } else {
      g.drawImage(car, 0, 0);
      g.drawImage(kid, kx, ky, kw, kh);
      g.save(); g.beginPath();
      for (const [x0, y0, x1, y1] of V.front) g.rect(x0, y0, Math.min(x1, W) - x0, Math.min(y1, car.height) - y0);
      g.clip(); g.drawImage(car, 0, 0); g.restore();
    }
    return { canvas: c, w: W * KART_PX2M, h: H * KART_PX2M, cy: 6 / H };
  }

  const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

  function drawPart(ctx, name, k, img) {
    const p = PARTS[name];
    ctx.save();
    if (p.rot) {
      ctx.translate(p.px * k, p.py * k);
      ctx.rotate(p.rot * Math.PI / 180);
      ctx.translate(-p.px * k, -p.py * k);
    }
    ctx.drawImage(img || IMG[name], p.x * k, p.y * k, p.w * k, p.h * k);
    ctx.restore();
  }

  let backHeadCache = null;
  function backHead() {
    if (backHeadCache) return backHeadCache;
    const im = IMG.head, c = canvas(im.width, im.height), g = c.getContext('2d');
    const W = c.width, H = c.height;
    g.drawImage(im, 0, 0);
    g.globalCompositeOperation = 'source-atop';
    const hair = g.createRadialGradient(W * 0.42, H * 0.3, W * 0.05, W * 0.5, H * 0.45, W * 0.75);
    hair.addColorStop(0, '#3b302c'); hair.addColorStop(0.5, '#1d1715'); hair.addColorStop(1, '#0e0b0a');
    g.fillStyle = hair; g.fillRect(0, 0, W, H);
    g.fillStyle = '#e8bea2';
    g.beginPath(); g.ellipse(W * 0.03, H * 0.56, W * 0.1, H * 0.09, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(W * 0.97, H * 0.56, W * 0.1, H * 0.09, 0, 0, Math.PI * 2); g.fill();
    const neck = g.createLinearGradient(0, H * 0.74, 0, H);
    neck.addColorStop(0, 'rgba(232,190,162,0)'); neck.addColorStop(0.35, '#e3b597'); neck.addColorStop(1, '#d9a888');
    g.fillStyle = neck; g.fillRect(W * 0.2, H * 0.74, W * 0.6, H * 0.26);
    g.strokeStyle = 'rgba(255,255,255,.08)'; g.lineWidth = 2;
    for (let i = 0; i < 14; i++) {
      g.beginPath(); const x = W * (0.15 + i * 0.05);
      g.moveTo(x, H * 0.12); g.quadraticCurveTo(x + 6, H * 0.4, x - 2, H * 0.68); g.stroke();
    }
    backHeadCache = c;
    return c;
  }

  function rgb2hsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
    if (mx === mn) return [0, 0, l];
    const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    let h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [h * 60, s, l];
  }
  function hsl2rgb(h, s, l) {
    h /= 360;
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    const f = t => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
    return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
  }
  function recolor(c, color) {
    if (color.hue == null) return c;
    const g = c.getContext('2d'), d = g.getImageData(0, 0, c.width, c.height), a = d.data;
    for (let i = 0; i < a.length; i += 4) {
      if (a[i + 3] < 8) continue;
      const [h, s, l] = rgb2hsl(a[i], a[i + 1], a[i + 2]);
      if (s > 0.4 && (h > 320 || h < 16) && l > 0.2) {
        const [r, gg, b] = hsl2rgb(color.hue, Math.min(1, s * 0.95), color.id === 'pink' ? Math.min(0.75, l + 0.12) : l);
        a[i] = r; a[i + 1] = gg; a[i + 2] = b;
      }
    }
    g.putImageData(d, 0, 0);
    return c;
  }

  // 拼一个小孩：opts.legs 是否画腿；opts.back 背面；opts.noArmR 去掉右臂（挥手时单独画）
  function figure(color, opts = {}) {
    const k = opts.k || 4;
    const hgt = opts.legs === false ? 100 : 112;
    const c = canvas(64 * k, hgt * k), g = c.getContext('2d');
    if (opts.legs !== false) { drawPart(g, 'legL', k); drawPart(g, 'legR', k); }
    drawPart(g, 'torso', k);
    drawPart(g, 'armL', k);
    if (!opts.noArmR) drawPart(g, 'armR', k);
    recolor(c, color);
    drawPart(g, 'head', k, opts.back ? backHead() : IMG.head);
    return c;
  }

  function armCanvas(color) {
    const k = 4, c = canvas(IMG.armR.width, IMG.armR.height);
    c.getContext('2d').drawImage(IMG.armR, 0, 0);
    return recolor(c, color);
  }

  const texCache = {};
  function tex(key, make) {
    if (!texCache[key]) {
      const t = new THREE.CanvasTexture(make());
      t.anisotropy = 4;
      texCache[key] = t;
    }
    return texCache[key];
  }

  function textCanvas(text, opt = {}) {
    const size = opt.size || 64, pad = opt.pad == null ? 14 : opt.pad;
    const g0 = canvas(8, 8).getContext('2d');
    const font = `${opt.weight || 900} ${size}px "PingFang SC","Microsoft YaHei",system-ui,sans-serif`;
    g0.font = font;
    const w = Math.ceil(g0.measureText(text).width) + pad * 2, h = Math.ceil(size * 1.35) + pad;
    const c = canvas(w, h), g = c.getContext('2d');
    if (opt.bg) {
      g.fillStyle = opt.bg;
      const r = h / 2.4;
      g.beginPath(); g.moveTo(r, 0); g.arcTo(w, 0, w, h, r); g.arcTo(w, h, 0, h, r); g.arcTo(0, h, 0, 0, r); g.arcTo(0, 0, w, 0, r); g.fill();
    }
    g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
    if (opt.stroke) { g.lineWidth = size / 7; g.strokeStyle = opt.stroke; g.strokeText(text, w / 2, h / 2 + 2); }
    g.fillStyle = opt.color || '#fff';
    g.fillText(text, w / 2, h / 2 + 2);
    return c;
  }

  function textSprite(text, height, opt) {
    const c = textCanvas(text, opt);
    const t = new THREE.CanvasTexture(c);
    const m = new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, fog: opt && opt.fog !== undefined ? opt.fog : true });
    const s = new THREE.Sprite(m);
    s.scale.set(height * c.width / c.height, height, 1);
    return s;
  }

  window.KID = {
    COLORS, load, figure, armCanvas, recolor, tex, textCanvas, textSprite, canvas,
    head: () => IMG.head, backHead,
    driverTex: (color, back) => tex(`drv-${color.id}-${back ? 'b' : 'f'}`, () => figure(color, { legs: false, back })),
    standTex: (color, noArm) => tex(`std-${color.id}-${noArm ? 1 : 0}`, () => figure(color, { noArmR: noArm })),
    armTex: (color) => tex(`arm-${color.id}`, () => armCanvas(color)),
    figureURL: (color, opts) => figure(color, opts).toDataURL(),
    KART_VIEWS, kartCanvas,
    wheelTex(view) {
      const key = `wheel-${view}`;
      if (!texCache[key]) texCache[key] = wheelFrames(view).map(c => { const t = new THREE.CanvasTexture(c); t.anisotropy = 4; return t; });
      return texCache[key];
    },
    WHEEL_FRAMES, SPOKES,
    kartTex(color, view, scale = 1, noKid = false) {
      const key = `kart-${color.id}-${view}-${scale}-${noKid ? 0 : 1}`;
      if (!texCache[key]) {
        const k = kartCanvas(color, view, scale, noKid);
        const t = new THREE.CanvasTexture(k.canvas);
        t.anisotropy = 4;
        texCache[key] = Object.assign(t, { kw: k.w, kh: k.h, cy: k.cy });
      }
      return texCache[key];
    },
    kartURL: (color, view) => kartCanvas(color, view).canvas.toDataURL()
  };
})();
