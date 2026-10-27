// 道具：问号箱、水弹、香蕉皮、氮气、护盾、磁铁、天使
(function () {
  const T = window.TRACK;
  const { wrapS } = window.KART;

  const ITEMS = {
    water:  { icon: '💧', name: '水弹' },
    banana: { icon: '🍌', name: '香蕉皮' },
    nitro:  { icon: '🔥', name: '氮气' },
    shield: { icon: '🛡️', name: '护盾' },
    magnet: { icon: '🧲', name: '磁铁' },
    angel:  { icon: '👼', name: '天使' }
  };
  const TABLE = {
    first: { banana: 42, water: 22, shield: 28, nitro: 8 },
    mid:   { water: 32, banana: 22, nitro: 20, shield: 10, magnet: 16 },
    last:  { water: 24, nitro: 24, magnet: 20, angel: 16, shield: 10, banana: 6 }
  };
  function roll(rank, total) {
    const tb = rank === 1 ? TABLE.first : rank >= total - 1 ? TABLE.last : TABLE.mid;
    let sum = 0; for (const k in tb) sum += tb[k];
    let r = Math.random() * sum;
    for (const k in tb) { r -= tb[k]; if (r <= 0) return k; }
    return 'water';
  }

  class Items {
    constructor(scene) {
      this.scene = scene;
      this.boxes = []; this.bombs = []; this.bananas = []; this.fxs = [];
      const qc = KID.canvas(128, 128), g = qc.getContext('2d');
      const gr = g.createLinearGradient(0, 0, 128, 128);
      ['#ff4f6d', '#ffd23f', '#3ee07a', '#38bdf8', '#a855f7'].forEach((c, i) => gr.addColorStop(i / 4, c));
      g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
      g.fillStyle = 'rgba(255,255,255,.85)'; g.fillRect(10, 10, 108, 108);
      g.font = '900 92px system-ui,sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = '#ff3d7f'; g.fillText('?', 64, 70);
      const boxMat = new THREE.MeshLambertMaterial({ map: new THREE.CanvasTexture(qc), transparent: true, opacity: 0.92, emissive: 0x332200 });
      const boxGeo = new THREE.BoxGeometry(1.7, 1.7, 1.7);
      for (const row of T.ITEM_ROWS) {
        const a = T.at(row.s);
        for (const f of [-0.62, -0.2, 0.2, 0.62]) {
          const m = new THREE.Mesh(boxGeo, boxMat);
          const p = a.p.clone().addScaledVector(a.r, f * a.w); p.y += 1.5;
          m.position.copy(p); scene.add(m);
          this.boxes.push({ m, p, t: 0, ph: Math.random() * 6 });
        }
      }
      this.bananaGeo = new THREE.TorusGeometry(0.55, 0.22, 8, 12, Math.PI * 1.15);
      this.bananaMat = new THREE.MeshLambertMaterial({ color: 0xffd52e, emissive: 0x332a00 });
      this.bombGeo = new THREE.SphereGeometry(0.95, 16, 12);
      this.bombMat = new THREE.MeshPhongMaterial({ color: 0x3aa0ff, transparent: true, opacity: 0.75, specular: 0xffffff, shininess: 120 });
      this.pillarMat = new THREE.MeshBasicMaterial({ color: 0xfff6c2, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false });
    }

    reset() {
      for (const b of this.boxes) { b.t = 0; b.m.visible = true; }
      for (const b of this.bombs) this.scene.remove(b.m);
      for (const b of this.bananas) this.scene.remove(b.m);
      for (const f of this.fxs) this.scene.remove(f.m);
      this.bombs = []; this.bananas = []; this.fxs = [];
    }

    // 某车前方最近的对手
    ahead(r, racers, maxD) {
      let best = null, bd = maxD;
      for (const o of racers) {
        if (o === r || o.finished) continue;
        const d = o.dist - r.dist;
        if (d > 0.5 && d < bd) { bd = d; best = o; }
      }
      return best;
    }

    use(r, race) {
      const it = r.item;
      if (!it || r.stunT > 0) return false;
      r.item = null; r.itemHold = 0;
      const FX = WORLD.fx;
      if (it === 'water') {
        const tgt = this.ahead(r, race.racers, 260);
        const m = new THREE.Mesh(this.bombGeo, this.bombMat); this.scene.add(m);
        this.bombs.push({ m, s: r.s + 3.5, lat: r.lat, owner: r, target: tgt, life: 5, y: r.pos.y });
        race.sfx('throw');
      } else if (it === 'banana') {
        const bx = r.pos.x + Math.sin(r.heading) * 3.4, bz = r.pos.z + Math.cos(r.heading) * 3.4;
        const info = T.project(bx, bz, r.idx);
        const m = new THREE.Group();
        const peel = new THREE.Mesh(this.bananaGeo, this.bananaMat); peel.rotation.x = -Math.PI / 2; m.add(peel);
        m.position.set(bx, info.y + 0.25, bz); m.rotation.y = Math.random() * 6;
        this.scene.add(m);
        this.bananas.push({ m, x: bx, z: bz, y: info.y, s: info.s, lat: info.lat, owner: r, ownerT: 0.8 });
        if (this.bananas.length > 24) this.scene.remove(this.bananas.shift().m);
        race.sfx('drop');
      } else if (it === 'nitro') {
        r.boost(2.3, 1); race.sfx('nitro', r);
      } else if (it === 'shield') {
        r.shieldT = 6; race.sfx('shield', r);
      } else if (it === 'magnet') {
        const tgt = this.ahead(r, race.racers, 170);
        r.boost(tgt ? 2.2 : 1.2, 0.9);
        if (tgt) {
          if (tgt.shieldT > 0) { tgt.shieldT = 0; race.event('blocked', tgt, r, 'magnet'); }
          else { tgt.slowT = 2.2; race.event('magnet', tgt, r); }
          for (let i = 0; i < 24; i++) {
            const u = i / 24;
            FX.emit(r.pos.x + (tgt.pos.x - r.pos.x) * u, r.pos.y + 1.5 + (tgt.pos.y - r.pos.y) * u, r.pos.z + (tgt.pos.z - r.pos.z) * u, 0, 1, 0, i % 2 ? '#f43f5e' : '#94a3b8', 0.7, 0.8, 0);
          }
        }
        race.sfx('magnet', r);
      } else if (it === 'angel') {
        const leader = race.ranking()[0];
        if (leader && leader !== r) {
          this.hit(leader, 'angel', r, race);
          const m = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 80, 16, 1, true), this.pillarMat);
          m.position.set(leader.pos.x, leader.pos.y + 40, leader.pos.z); this.scene.add(m);
          this.fxs.push({ m, t: 1.2, follow: leader });
        }
        race.sfx('angel', r);
      }
      return true;
    }

    hit(target, kind, attacker, race) {
      if (target.finished) return false;
      if (target.shieldT > 0) { target.shieldT = 0; race.event('blocked', target, attacker, kind); return false; }
      if (kind === 'banana') { target.spinT = 1.25; target.drift = false; }
      else { target.stunT = kind === 'angel' ? 2.0 : 1.6; target.drift = false; target.boostT = 0; }
      race.event('hit', target, attacker, kind);
      return true;
    }

    update(dt, t, race) {
      const racers = race.racers, FX = WORLD.fx;
      for (const b of this.boxes) {
        if (b.t > 0) { b.t -= dt; if (b.t <= 0) b.m.visible = true; continue; }
        b.m.rotation.set(t * 0.9 + b.ph, t * 1.3 + b.ph, 0);
        b.m.position.y = b.p.y + Math.sin(t * 2.5 + b.ph) * 0.25;
        for (const r of racers) {
          const dx = r.pos.x - b.p.x, dz = r.pos.z - b.p.z, dy = r.pos.y + 1 - b.p.y;
          if (dx * dx + dz * dz < 5.3 && Math.abs(dy) < 3) {
            b.t = 2.5; b.m.visible = false;
            for (let i = 0; i < 14; i++) FX.emit(b.p.x, b.p.y, b.p.z, (Math.random() - 0.5) * 10, Math.random() * 7, (Math.random() - 0.5) * 10, ['#ff4f6d', '#ffd23f', '#3ee07a', '#38bdf8', '#a855f7'][i % 5], 0.5, 0.6, 12);
            if (!r.item && r.rollT <= 0) {
              r.pending = roll(race.rankOf(r), racers.length);
              r.rollT = r.isPlayer ? 1.0 : 0.6;
              r.emit('itemRoll');
            }
            break;
          }
        }
      }
      // 水弹
      for (let i = this.bombs.length - 1; i >= 0; i--) {
        const b = this.bombs[i];
        b.life -= dt; b.s += 82 * dt;
        if (b.target && !b.target.finished) b.lat += (b.target.lat - b.lat) * Math.min(1, dt * 3);
        const a = T.at(b.s);
        const ty = a.p.y + 1.2 + Math.sin(t * 10) * 0.15;
        b.m.position.set(a.p.x + a.r.x * b.lat, ty, a.p.z + a.r.z * b.lat);
        b.m.scale.setScalar(1 + Math.sin(t * 12) * 0.08);
        if (Math.random() < 0.6) FX.emit(b.m.position.x, ty, b.m.position.z, (Math.random() - 0.5) * 2, Math.random() * 2, (Math.random() - 0.5) * 2, '#9bd5ff', 0.4, 0.4, 2);
        let done = b.life <= 0;
        for (const r of racers) {
          if (r === b.owner || r.finished) continue;
          const dx = r.pos.x - b.m.position.x, dz = r.pos.z - b.m.position.z;
          if (dx * dx + dz * dz < 6.5 && Math.abs(r.pos.y + 1 - ty) < 3) { this.hit(r, 'water', b.owner, race); done = true; break; }
        }
        if (done) {
          for (let k = 0; k < 20; k++) FX.emit(b.m.position.x, ty, b.m.position.z, (Math.random() - 0.5) * 9, Math.random() * 7, (Math.random() - 0.5) * 9, k % 2 ? '#4fb4ff' : '#dff4ff', 0.6, 0.7, 14);
          this.scene.remove(b.m); this.bombs.splice(i, 1);
          race.sfx('splash', null, b.m.position);
        }
      }
      // 香蕉皮
      for (let i = this.bananas.length - 1; i >= 0; i--) {
        const bn = this.bananas[i];
        if (bn.ownerT > 0) bn.ownerT -= dt;
        for (const r of racers) {
          if (r.finished || (r === bn.owner && bn.ownerT > 0) || r.air) continue;
          const dx = r.pos.x - bn.x, dz = r.pos.z - bn.z;
          if (dx * dx + dz * dz < 3.6) {
            this.hit(r, 'banana', bn.owner, race);
            this.scene.remove(bn.m); this.bananas.splice(i, 1);
            race.sfx('slip', r);
            break;
          }
        }
      }
      for (let i = this.fxs.length - 1; i >= 0; i--) {
        const f = this.fxs[i]; f.t -= dt;
        if (f.follow) f.m.position.set(f.follow.pos.x, f.follow.pos.y + 40, f.follow.pos.z);
        f.m.material.opacity = Math.max(0, f.t / 1.2) * 0.55;
        if (Math.random() < 0.8 && f.follow) WORLD.fx.emit(f.follow.pos.x + (Math.random() - 0.5) * 4, f.follow.pos.y + 6 + Math.random() * 6, f.follow.pos.z + (Math.random() - 0.5) * 4, 0, -4, 0, '#fff6c2', 0.8, 1, 0);
        if (f.t <= 0) { this.scene.remove(f.m); this.fxs.splice(i, 1); }
      }
    }

    // AI 什么时候用道具
    aiUse(r, race) {
      if (!r.item || r.stunT > 0 || r.spinT > 0) return;
      const h = r.itemHold, it = r.item;
      let go = false;
      if (it === 'water') go = h > 0.6 && !!this.ahead(r, race.racers, 140);
      else if (it === 'banana') go = h > 5 || race.racers.some(o => o !== r && r.dist - o.dist > 2 && r.dist - o.dist < 26);
      else if (it === 'nitro') go = h > 1.5 && Math.abs(T.S[r.idx].curv) < 1 / 150;
      else if (it === 'shield') go = h > 1.2;
      else if (it === 'magnet') go = h > 0.6 && !!this.ahead(r, race.racers, 110);
      else if (it === 'angel') go = h > 0.5;
      if (h > 9) go = true;
      if (go) this.use(r, race);
    }
  }

  window.ITEMS = { Items, ITEMS, roll };
})();
