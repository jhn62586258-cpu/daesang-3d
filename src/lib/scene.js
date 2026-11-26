/* 대상건축사사무소 AI 건축 3D 시뮬레이터 — Three.js 모델·도면 분석·씬 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { clamp, D2R, calcText } from './core.js';

/* ───────── 재질 텍스처 (회색조 → 외벽색으로 틴트) ───────── */
const texCache = {};
function texCanvas(kind) {
  if (texCache[kind]) return texCache[kind];
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
  let seed = 11; const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  const gray = (v, a = 1) => `rgba(${v | 0},${v | 0},${v | 0},${a})`;
  if (kind === 'wood') {
    for (let x = 0; x < 256; x += 32) {
      g.fillStyle = gray(215 + rnd() * 35); g.fillRect(x, 0, 32, 256);
      g.strokeStyle = gray(120, .22); for (let k = 0; k < 4; k++) { g.beginPath(); const gx = x + 4 + rnd() * 24; g.moveTo(gx, 0); g.bezierCurveTo(gx + 3, 90, gx - 3, 170, gx, 256); g.stroke(); }
      g.fillStyle = gray(90, .7); g.fillRect(x, 0, 2, 256);
    }
  } else if (kind === 'brick') {
    g.fillStyle = gray(250); g.fillRect(0, 0, 256, 256);
    for (let r = 0; r < 16; r++) for (let x = -32; x < 256; x += 64) { g.fillStyle = gray(200 + rnd() * 45); g.fillRect(x + (r % 2) * 32 + 2, r * 16 + 2, 60, 12); }
  } else if (kind === 'concrete') {
    g.fillStyle = gray(238); g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 2600; i++) { g.fillStyle = gray(rnd() > .5 ? 255 : 150, rnd() * .14); g.fillRect(rnd() * 256, rnd() * 256, 2, 2); }
    g.strokeStyle = gray(150, .6); g.lineWidth = 1.5; g.strokeRect(0, 0, 256, 128); g.strokeRect(0, 128, 256, 128); g.beginPath(); g.moveTo(128, 0); g.lineTo(128, 256); g.stroke();
    g.fillStyle = gray(120, .7); for (let x = 32; x < 256; x += 64) for (let y = 32; y < 256; y += 64) { g.beginPath(); g.arc(x, y, 3, 0, 7); g.fill(); }
  } else if (kind === 'zinc') {
    g.fillStyle = gray(225); g.fillRect(0, 0, 256, 256);
    for (let x = 0; x < 256; x += 32) { g.fillStyle = gray(255, .9); g.fillRect(x, 0, 3, 256); g.fillStyle = gray(140, .8); g.fillRect(x + 3, 0, 2, 256); }
  } else if (kind === 'stone') {
    g.fillStyle = gray(170); g.fillRect(0, 0, 256, 256);
    for (let r = 0; r < 8; r++) for (let x = -64; x < 256; x += 128) { g.fillStyle = gray(205 + rnd() * 45); g.fillRect(x + (r % 2) * 64 + 2, r * 32 + 2, 124, 28); }
  } else {
    g.fillStyle = gray(248); g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 3000; i++) { g.fillStyle = gray(rnd() > .5 ? 255 : 200, rnd() * .25); g.fillRect(rnd() * 256, rnd() * 256, 2, 2); }
  }
  return (texCache[kind] = c);
}
function wallMat(material, color, rw, rh) {
  const t = new THREE.CanvasTexture(texCanvas(material));
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.encoding = THREE.sRGBEncoding; t.anisotropy = 4;
  const per = { wood: 2.4, brick: 1.6, concrete: 2.4, zinc: 1.8, stone: 2.4, paint: 3 }[material];
  t.repeat.set(Math.max(1, rw / per), Math.max(1, rh / per));
  return new THREE.MeshStandardMaterial({ map: t, color: new THREE.Color(color), roughness: material === 'zinc' ? .45 : .88, metalness: material === 'zinc' ? .35 : 0 });
}
const lum = hex => { const c = new THREE.Color(hex); return .299 * c.r + .587 * c.g + .114 * c.b; };

/* ───────── 공통 지오메트리 도우미 ───────── */
function box(w, h, d, mat, x, y, z, shadow = true) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z);
  m.castShadow = shadow; m.receiveShadow = true; return m;
}
function boxes(list, mat, cast = true) {
  const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, Math.max(1, list.length));
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
  list.forEach((b, i) => { p.set(b[0], b[1], b[2]); s.set(b[3], b[4], b[5]); m4.compose(p, q, s); im.setMatrixAt(i, m4); });
  im.count = list.length; im.castShadow = cast; im.receiveShadow = true; im.frustumCulled = false; return im;
}
const TRUNK = () => new THREE.MeshStandardMaterial({ color: '#6B4F36', roughness: 1 });
function tree(x, z, s = 1, tint = '#6F8F55') {
  const g = new THREE.Group();
  g.add(box(.22 * s, 1.8 * s, .22 * s, TRUNK(), 0, .9 * s, 0));
  const c = new THREE.Mesh(new THREE.IcosahedronGeometry(1.25 * s, 1), new THREE.MeshStandardMaterial({ color: tint, roughness: 1, flatShading: true }));
  c.position.y = 2.75 * s; c.scale.y = 1.12; c.castShadow = true; g.add(c); g.position.set(x, 0, z); return g;
}
let pavingCanvas = null;
function pavingMat(w, d) {
  if (!pavingCanvas) {
    pavingCanvas = document.createElement('canvas'); pavingCanvas.width = pavingCanvas.height = 128; const g = pavingCanvas.getContext('2d');
    g.fillStyle = '#A9A59D'; g.fillRect(0, 0, 128, 128);
    let seed = 3; const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
    for (let r = 0; r < 4; r++) for (let c = -1; c < 4; c++) { const v = 205 + rnd() * 30 | 0; g.fillStyle = `rgb(${v},${v - 3},${v - 8})`; g.fillRect(c * 32 + (r % 2) * 16 + 1, r * 32 + 1, 30, 30); }
  }
  const t = new THREE.CanvasTexture(pavingCanvas); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.encoding = THREE.sRGBEncoding; t.repeat.set(w / 1.2, d / 1.2);
  return new THREE.MeshStandardMaterial({ map: t, roughness: .95 });
}
/* 건축 모형 대지: 베이스판 · 잔디 · 진입로 · 보도블록 · 연석 · 전면 2차선 도로 · 가로수 */
function siteBase(g, ext, opt = {}) {
  const side = 5, front = opt.front ?? 4;
  const x0 = ext.x0 - side, x1 = ext.x1 + side, zN = ext.z0 - side;
  const zYard = ext.z1 + front, zWalk = zYard + 3, zRoad = zWalk + 7.2, zEnd = zRoad + 1.2;
  const W = x1 - x0, cx = (x0 + x1) / 2;
  const flat = (w, d, mat, x, z, y) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), typeof mat === 'string' ? new THREE.MeshStandardMaterial({ color: mat, roughness: 1 }) : mat); m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); m.receiveShadow = true; g.add(m); return m; };
  g.add(box(W + .8, .7, zEnd - zN + .8, new THREE.MeshStandardMaterial({ color: '#E9DCC3', roughness: .9 }), cx, -.35, (zN + zEnd) / 2, false));
  flat(W, zYard - zN, '#7FA05E', cx, (zN + zYard) / 2, .01);
  flat(W, zWalk - zYard, pavingMat(W, zWalk - zYard), cx, (zYard + zWalk) / 2, .06);
  g.add(box(W, .18, .22, new THREE.MeshStandardMaterial({ color: '#D9D6CF' }), cx, .09, zWalk));
  flat(W, zRoad - zWalk, '#55585D', cx, (zWalk + zRoad) / 2, .015);
  const lane = (z, color, dash) => { if (!dash) flat(W, .12, color, cx, z, .025); else for (let x = x0 + 1; x < x1 - 1; x += 4) flat(2, .12, color, x + 1, z, .025); };
  const mid = (zWalk + zRoad) / 2;
  lane(mid - .1, '#F2C230'); lane(mid + .1, '#F2C230'); lane(zWalk + .35, '#EDEDED'); lane(zRoad - .35, '#EDEDED');
  for (let i = 0; i < 6; i++) flat(.45, 2.6, '#EDEDED', x1 - 4 - i * .9, mid, .026); // 횡단보도
  const doorX = opt.doorX ?? cx;
  flat(1.8, front + .1, pavingMat(1.8, front), doorX, ext.z1 + front / 2, .03);
  for (let x = x0 + 3.5; x < x1 - 2; x += 7) { if (Math.abs(x - doorX) < 2) continue; flat(1.2, 1.2, '#5E4A38', x, zYard + 1.3, .07); g.add(tree(x, zYard + 1.3, .82, '#6E9152')); }
  [[x0 + 2.2, zN + 2.2, 1], [x1 - 2.4, zN + 2.6, .9], [x0 + 2.6, (zN + zYard) / 2, .8]].forEach(([x, z, s]) => { if (x < ext.x0 - 1.5 || x > ext.x1 + 1.5 || z < ext.z0 - 1.5) g.add(tree(x, z, s, '#7A9C5C')); });
  if (opt.lot) {
    const L = opt.lot, pts = [[L.x0, L.z0], [L.x1, L.z0], [L.x1, L.z1], [L.x0, L.z1]].map(([x, z]) => new THREE.Vector3(x, .09, z));
    g.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: '#FD9F28' })));
  }
  return { R: Math.max(Math.abs(x0), Math.abs(x1), Math.abs(zN), Math.abs(zEnd)) * 1.05 };
}
/* 다각형 유틸 (x,z 좌표) */
const polyArea = P => P.reduce((s, p, i) => { const q = P[(i + 1) % P.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0) / 2;
function edgeNormals(P) {
  const sg = polyArea(P) > 0 ? 1 : -1;
  return P.map((p, i) => { const q = P[(i + 1) % P.length], dx = q[0] - p[0], dz = q[1] - p[1], L = Math.hypot(dx, dz) || 1; return [sg * dz / L, -sg * dx / L]; });
}
function offsetPoly(P, d) {
  const N = edgeNormals(P);
  return P.map((p, i) => {
    const n1 = N[(i - 1 + P.length) % P.length], n2 = N[i]; let mx = n1[0] + n2[0], mz = n1[1] + n2[1]; const L = Math.hypot(mx, mz) || 1; mx /= L; mz /= L;
    const k = d / Math.max(.35, mx * n1[0] + mz * n1[1]); return [p[0] + mx * k, p[1] + mz * k];
  });
}
function extrudePoly(P, h, mat, y, hole) {
  const sh = new THREE.Shape(P.map(([x, z]) => new THREE.Vector2(x, -z)));
  if (hole) sh.holes.push(new THREE.Path(hole.map(([x, z]) => new THREE.Vector2(x, -z))));
  const m = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: h, bevelEnabled: false }), mat);
  m.rotation.x = -Math.PI / 2; m.position.y = y; m.castShadow = true; m.receiveShadow = true; return m;
}

/* ───────── 3D 모델: 문장 기반 건물 ───────── */
function buildText(sp) {
  const g = new THREE.Group(), b = new THREE.Group(); g.add(b);
  const { landM2, building } = calcText(sp);
  const lotW = Math.sqrt(landM2 * 1.25), lotD = landM2 / lotW;
  let W = Math.sqrt(building * 1.35), D = building / W;
  if (W > lotW - 2) { W = lotW - 2; D = building / W; }
  if (D > lotD - 2) D = lotD - 2;
  const zc = (lotD - D) / 2 * 0.35;

  const frameC = lum(sp.wallColor) > .55 ? '#3A3A3A' : '#ECE8E0';
  const frameM = new THREE.MeshStandardMaterial({ color: frameC, roughness: .6, metalness: .2 });
  const slabM = new THREE.MeshStandardMaterial({ color: lum(sp.wallColor) > .55 ? '#8E8A84' : '#E4E0D8', roughness: .8 });
  const glassM = new THREE.MeshStandardMaterial({ color: '#86A9C2', roughness: .08, metalness: .35, transparent: true, opacity: .8 });

  const pane = (face, u, yc, w, h, d, zz) => {
    const grp = new THREE.Group();
    grp.add(box(w, h, .05, glassM, 0, 0, 0, false));
    grp.add(box(w + .12, .09, .12, frameM, 0, h / 2, 0), box(w + .12, .09, .12, frameM, 0, -h / 2, 0), box(.09, h, .12, frameM, -w / 2, 0, 0), box(.09, h, .12, frameM, w / 2, 0, 0));
    const n = Math.floor(w / 1.6); for (let k = 1; k <= n; k++) grp.add(box(.06, h, .1, frameM, -w / 2 + k * w / (n + 1), 0, 0, false));
    if (face === 'S') grp.position.set(u, yc, zz + d / 2 + .04);
    if (face === 'N') grp.position.set(u, yc, zz - d / 2 - .04);
    if (face === 'E') { grp.position.set(W / 2 + .04, yc, zz + u); grp.rotation.y = Math.PI / 2; }
    if (face === 'W') { grp.position.set(-W / 2 - .04, yc, zz + u); grp.rotation.y = Math.PI / 2; }
    b.add(grp);
  };
  const windows = (y, fh, d, zz, ground) => {
    const big = sp.glass >= 0.6;
    if (ground && sp.shop) { pane('S', 0, y + fh * .45, W * .9, fh * .78, d, zz); b.add(box(W * .96, .18, 1.4, frameM, 0, y + fh * .9, zz + d / 2 + .7)); }
    else if (big) pane('S', 0, y + fh * .48, Math.min(W * .92, W * (sp.glass + .14)), fh * .78, d, zz);
    else { const n = Math.max(2, Math.round(W / 3.4)), w = Math.max(.7, Math.min(W / n - .8, W * sp.glass * 1.7 / n)); for (let i = 0; i < n; i++) pane('S', -W / 2 + (i + .5) * W / n, y + fh * .52, w, fh * .5, d, zz); }
    const ne = Math.max(1, Math.round(d / 4.5)), we = big ? Math.min(d / ne - .8, 2.6) : Math.min(d / ne - 1, 0.6 + sp.glass * 2);
    for (let i = 0; i < ne; i++) { const u = -d / 2 + (i + .5) * d / ne; pane('E', u, y + fh * .52, we, fh * (big ? .65 : .45), d, zz); pane('W', u, y + fh * .52, we, fh * .45, d, zz); }
    const nn = Math.max(1, Math.round(W / 5)); for (let i = 0; i < nn; i++) pane('N', -W / 2 + (i + .5) * W / nn, y + fh * .7, .9, .6, d, zz);
  };

  let y = 0, lastD = D, lastZ = zc;
  for (let i = 0; i < sp.floors; i++) {
    const ground = i === 0, top = i === sp.floors - 1, fh = ground && sp.shop ? 4.2 : 3.2;
    const setback = sp.terrace && sp.floors > 1 && top;
    const d = setback ? D * .72 : D, zz = setback ? zc - (D - d) / 2 : zc;
    if (ground && sp.piloti) {
      const cm = new THREE.MeshStandardMaterial({ color: '#BDBAB3' });
      [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, -1], [0, 1]].forEach(([a, c]) => b.add(box(.45, fh, .45, cm, a * (W / 2 - .3), fh / 2, zc + c * (D / 2 - .3))));
      b.add(box(4, fh, 5, wallMat(sp.material, sp.wallColor, 4, fh), W / 2 - 2.2, fh / 2, zc - D / 2 + 2.6));
      const car = c => new THREE.MeshStandardMaterial({ color: c, roughness: .4, metalness: .3 });
      b.add(box(1.8, 1.3, 4.3, car('#D7D9DC'), -W / 4, .7, zc + .5), box(1.8, 1.3, 4.3, car('#4D5866'), -W / 4 + 2.6, .7, zc + .5));
    } else {
      b.add(box(W, fh, d, wallMat(sp.material, sp.wallColor, W, fh), 0, y + fh / 2, zz));
      windows(y, fh, d, zz, ground);
    }
    b.add(box(W + .3, .28, d + .3, slabM, 0, y + fh, zz));
    if (setback) {
      const tz = zc + D / 2 - (D - d) / 2;
      const railM = new THREE.MeshStandardMaterial({ color: '#A9C6D6', transparent: true, opacity: .45, roughness: .1 });
      b.add(box(W, 1.1, .05, railM, 0, y + .55, zc + D / 2 + .1, false), box(.05, 1.1, D - d, railM, W / 2 + .1, y + .55, tz, false), box(.05, 1.1, D - d, railM, -W / 2 - .1, y + .55, tz, false));
      const pm = new THREE.MeshStandardMaterial({ color: '#7C6A58' }), lm = new THREE.MeshStandardMaterial({ color: '#7A9C5C', flatShading: true });
      for (let k = -1; k <= 1; k += 2) { b.add(box(1.6, .5, .6, pm, k * W / 3, y + .25, zc + D / 2 - .5)); b.add(box(1.4, .5, .45, lm, k * W / 3, y + .7, zc + D / 2 - .5)); }
    }
    y += fh; lastD = d; lastZ = zz;
  }
  const top = y + .14, pz = lastZ, pd = lastD;
  if (sp.roof === 'flat') {
    b.add(box(W + .3, .8, .2, slabM, 0, y + .4, pz + pd / 2 + .05), box(W + .3, .8, .2, slabM, 0, y + .4, pz - pd / 2 - .05),
      box(.2, .8, pd + .3, slabM, W / 2 + .05, y + .4, pz), box(.2, .8, pd + .3, slabM, -W / 2 - .05, y + .4, pz));
    if (sp.terrace && sp.floors === 1) b.add(box(W * .5, .5, .5, new THREE.MeshStandardMaterial({ color: '#7A9C5C' }), 0, y + .5, pz));
  } else {
    const roofM = new THREE.MeshStandardMaterial({ color: sp.roofColor, roughness: .55, metalness: .15, side: THREE.DoubleSide });
    const ov = .45, rh = Math.min(pd * .38, 4.2);
    if (sp.roof === 'hip') {
      const c = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 4, 1), roofM);
      c.geometry.rotateY(Math.PI / 4); c.geometry.translate(0, .5, 0);
      c.scale.set((W + ov * 2) / Math.SQRT2, rh, (pd + ov * 2) / Math.SQRT2); c.position.set(0, top, pz); c.castShadow = true; c.receiveShadow = true; b.add(c);
    } else {
      const sh = new THREE.Shape(), hw = pd / 2 + ov;
      if (sp.roof === 'gable') { sh.moveTo(-hw, 0); sh.lineTo(hw, 0); sh.lineTo(0, rh); sh.lineTo(-hw, 0); }
      else { sh.moveTo(-hw, 0); sh.lineTo(hw, 0); sh.lineTo(hw, .35); sh.lineTo(-hw, rh); sh.lineTo(-hw, 0); }
      const geo = new THREE.ExtrudeGeometry(sh, { depth: W + ov * 2, bevelEnabled: false }); geo.translate(0, 0, -(W + ov * 2) / 2);
      const m = new THREE.Mesh(geo, roofM); m.rotation.y = Math.PI / 2; m.position.set(0, top, pz); m.castShadow = true; m.receiveShadow = true; b.add(m);
    }
    y += rh;
  }
  const site = siteBase(g, { x0: -lotW / 2, x1: lotW / 2, z0: -lotD / 2, z1: lotD / 2 }, { front: 1.2, lot: { x0: -lotW / 2, x1: lotW / 2, z0: -lotD / 2, z1: lotD / 2 } });
  const tw = lotW / 2 - 1.3, td = lotD / 2 - 1.3;
  [[-tw, -td], [tw, -td]].forEach(([x, z]) => { if (Math.abs(x) > W / 2 + 1.2 || Math.abs(z - zc) > D / 2 + 1.2) g.add(tree(x, z, .75, '#7A9C5C')); });
  const focus = new THREE.Box3(new THREE.Vector3(-W / 2, 0, zc - D / 2), new THREE.Vector3(W / 2, y + .8, zc + D / 2));
  return { group: g, focus, siteR: site.R };
}

/* ───────── 평면도 분석: 잡선 제거 → 벽체 · 외곽 · 개구부 ───────── */
function morph(src, gw, gh, k, erode) {
  const a = Math.floor((k - 1) / 2), lo = erode ? -a : -(k - 1 - a), hi = erode ? k - 1 - a : a;
  const tmp = new Uint8Array(gw * gh), out = new Uint8Array(gw * gh);
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
    let v = erode ? 1 : 0;
    for (let d = lo; d <= hi; d++) { const xx = x + d, val = xx < 0 || xx >= gw ? 0 : src[y * gw + xx]; if (erode ? !val : val) { v = erode ? 0 : 1; break; } }
    tmp[y * gw + x] = v;
  }
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
    let v = erode ? 1 : 0;
    for (let d = lo; d <= hi; d++) { const yy = y + d, val = yy < 0 || yy >= gh ? 0 : tmp[yy * gw + x]; if (erode ? !val : val) { v = erode ? 0 : 1; break; } }
    out[y * gw + x] = v;
  }
  return out;
}
function components(mask, gw, gh, eight) {
  const lab = new Int32Array(gw * gh).fill(-1), comps = [], st = [];
  for (let i = 0; i < gw * gh; i++) {
    if (!mask[i] || lab[i] >= 0) continue;
    const c = { id: comps.length, n: 0, x0: gw, y0: gh, x1: 0, y1: 0 }; comps.push(c); lab[i] = c.id; st.push(i);
    while (st.length) {
      const p = st.pop(), x = p % gw, y = (p - x) / gw; c.n++;
      if (x < c.x0) c.x0 = x; if (x > c.x1) c.x1 = x; if (y < c.y0) c.y0 = y; if (y > c.y1) c.y1 = y;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue; if (!eight && dx && dy) continue;
        const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= gw || yy >= gh) continue;
        const q = yy * gw + xx; if (mask[q] && lab[q] < 0) { lab[q] = c.id; st.push(q); }
      }
    }
  }
  return { lab, comps };
}
function mergeRects(mask, gw, gh) {
  const rects = []; let active = new Map();
  for (let y = 0; y < gh; y++) {
    const na = new Map(); let x = 0;
    while (x < gw) {
      if (!mask[y * gw + x]) { x++; continue; }
      let e = x; while (e < gw && mask[y * gw + e]) e++;
      const key = x * 100000 + (e - x); let r = active.get(key);
      if (r) r.h++; else { r = { x, y, w: e - x, h: 1 }; rects.push(r); }
      na.set(key, r); x = e;
    }
    active = na;
  }
  return rects;
}
function extractPlan(src, threshold = 110, k = 2) {
  const iw = src.naturalWidth || src.width, ih = src.naturalHeight || src.height;
  const G = 240, sc = G / Math.max(iw, ih), gw = Math.max(16, Math.round(iw * sc)), gh = Math.max(16, Math.round(ih * sc)), N = gw * gh;
  const c = document.createElement('canvas'); c.width = gw * 3; c.height = gh * 3;
  const x = c.getContext('2d', { willReadFrequently: true }); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(src, 0, 0, c.width, c.height);
  const d = x.getImageData(0, 0, c.width, c.height).data;
  const dark = new Uint8Array(N);
  for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) {
    let n = 0;
    for (let sy = 0; sy < 3; sy++) for (let sx = 0; sx < 3; sx++) { const i = ((gy * 3 + sy) * c.width + gx * 3 + sx) * 4; if (d[i + 3] > 40 && .299 * d[i] + .587 * d[i + 1] + .114 * d[i + 2] < threshold) n++; }
    dark[gy * gw + gx] = n >= 3 ? 1 : 0;
  }
  // 1) 굵은 선만 남기기: k×k 열림 연산 → 얇은 치수선·글씨·점선·문 호 제거
  const opened = k > 1 ? morph(morph(dark, gw, gh, k, true), gw, gh, k, false) : dark;
  // 2) 길이 필터 + 외곽 여백 요소 제거
  const { lab, comps } = components(opened, gw, gh, true);
  const minLen = Math.max(8, Math.round(Math.max(gw, gh) * 0.06));
  const cand = comps.filter(cc => Math.max(cc.x1 - cc.x0, cc.y1 - cc.y0) + 1 >= minLen);
  if (!cand.length) return { empty: true };
  const main = cand.reduce((a, b2) => b2.n > a.n ? b2 : a);
  const pad = Math.round(G * .02), mb = { x0: main.x0 - pad, y0: main.y0 - pad, x1: main.x1 + pad, y1: main.y1 + pad };
  const keep = new Set(cand.filter(cc => cc === main || (cc.x0 >= mb.x0 && cc.x1 <= mb.x1 && cc.y0 >= mb.y0 && cc.y1 <= mb.y1)).map(cc => cc.id));
  const removed = comps.length - keep.size;
  const wall = new Uint8Array(N); const bb = { x0: gw, y0: gh, x1: -1, y1: -1 };
  for (let i = 0; i < N; i++) if (lab[i] >= 0 && keep.has(lab[i])) { wall[i] = 1; const xx = i % gw, yy = (i - xx) / gw; bb.x0 = Math.min(bb.x0, xx); bb.x1 = Math.max(bb.x1, xx); bb.y0 = Math.min(bb.y0, yy); bb.y1 = Math.max(bb.y1, yy); }
  // 3) 벽 두께 추정
  const hr = new Uint16Array(N), vr = new Uint16Array(N);
  for (let y = 0; y < gh; y++) { let s0 = -1; for (let xx = 0; xx <= gw; xx++) { const v = xx < gw && wall[y * gw + xx]; if (v && s0 < 0) s0 = xx; if (!v && s0 >= 0) { for (let t = s0; t < xx; t++) hr[y * gw + t] = xx - s0; s0 = -1; } } }
  for (let xx = 0; xx < gw; xx++) { let s0 = -1; for (let y = 0; y <= gh; y++) { const v = y < gh && wall[y * gw + xx]; if (v && s0 < 0) s0 = y; if (!v && s0 >= 0) { for (let t = s0; t < y; t++) vr[t * gw + xx] = y - s0; s0 = -1; } } }
  const th = []; for (let i = 0; i < N; i += 2) if (wall[i]) th.push(Math.min(hr[i], vr[i]));
  th.sort((a, b2) => a - b2); const t = clamp(th[th.length >> 1] || 2, 2, 8);
  // 4) 건물 외곽(직교 볼록 껍질) → 바닥 슬래브 / 외벽 띠 / 개구부
  const rowL = new Int32Array(gh).fill(gw), rowR = new Int32Array(gh).fill(-1), colT = new Int32Array(gw).fill(gh), colB = new Int32Array(gw).fill(-1);
  for (let i = 0; i < N; i++) if (wall[i]) { const xx = i % gw, yy = (i - xx) / gw; rowL[yy] = Math.min(rowL[yy], xx); rowR[yy] = Math.max(rowR[yy], xx); colT[xx] = Math.min(colT[xx], yy); colB[xx] = Math.max(colB[xx], yy); }
  // 출입구·창 틈 때문에 외곽선이 안쪽으로 파이는 것을 막기 위해 1차원 닫힘 연산으로 윤곽을 보정
  const win = Math.round(G * .15);
  const smooth = (arr, maxFirst) => {
    const n = arr.length, pass = (src, useMax) => { const o = new Int32Array(n); for (let i = 0; i < n; i++) { let v = src[i]; for (let j = Math.max(0, i - win); j <= Math.min(n - 1, i + win); j++) v = useMax ? Math.max(v, src[j]) : Math.min(v, src[j]); o[i] = v; } return o; };
    return pass(pass(arr, maxFirst), !maxFirst);
  };
  const cT = smooth(colT, false), cB = smooth(colB, true), rL = smooth(rowL, false), rR = smooth(rowR, true);
  for (let i = 0; i < gw; i++) { colT[i] = cT[i]; colB[i] = cB[i]; } for (let i = 0; i < gh; i++) { rowL[i] = rL[i]; rowR[i] = rR[i]; }
  const fp = new Uint8Array(N); let fpN = 0;
  for (let yy = 0; yy < gh; yy++) for (let xx = 0; xx < gw; xx++) if (xx >= rowL[yy] && xx <= rowR[yy] && yy >= colT[xx] && yy <= colB[xx]) { fp[yy * gw + xx] = 1; fpN++; }
  const inner = morph(fp, gw, gh, 2 * t + 1, true);
  const band = new Uint8Array(N), open = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (fp[i] && !inner[i]) { band[i] = 1; if (!wall[i]) open[i] = 1; }
  // 외벽 띠 안에서 외벽보다 확연히 얇은 선(창호 기호: 얇은 2·3중선)은 창으로 재분류
  const perp = new Uint16Array(N), ext = [];
  for (let i = 0; i < N; i++) {
    if (!band[i] || !wall[i]) continue; const xx = i % gw, yy = (i - xx) / gw;
    const vE = yy - colT[xx] <= t + 1 || colB[xx] - yy <= t + 1, hE = xx - rowL[yy] <= t + 1 || rowR[yy] - xx <= t + 1;
    if (vE === hE) continue; perp[i] = vE ? vr[i] : hr[i]; ext.push(perp[i]);
  }
  ext.sort((p, q) => p - q); const extT = ext[ext.length >> 1] || t;
  for (let i = 0; i < N; i++) if (perp[i] && perp[i] < extT * .78) { wall[i] = 0; open[i] = 1; }
  const opens = components(open, gw, gh, false).comps.map(o => ({ x0: o.x0, y0: o.y0, x1: o.x1, y1: o.y1 }));
  // 미리보기: 원본(흐리게) + 인식 벽체(오렌지) + 창호(파랑)
  x.fillStyle = 'rgba(255,255,255,.72)'; x.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < N; i++) {
    if (!wall[i] && !open[i]) continue; const xx = i % gw, yy = (i - xx) / gw;
    x.fillStyle = wall[i] ? '#FD9F28' : '#4AA3DF'; x.fillRect(xx * 3, yy * 3, 3, 3);
  }
  return { gw, gh, bbox: bb, t, removed,
    wallRects: mergeRects(wall, gw, gh), fpRects: mergeRects(fp, gw, gh), bandRects: mergeRects(band, gw, gh), opens, fpN, preview: c.toDataURL('image/png') };
}

/* ───────── 3D 모델: 도면 매스 모델 ───────── */
function buildPlan(sp) {
  const g = new THREE.Group(), cell = sp.cell, slabT = .3, wallH = 2.8, fh = slabT + wallH, MINW = .25;
  const ox = (sp.bbox.x0 + sp.bbox.x1 + 1) / 2, oz = (sp.bbox.y0 + sp.bbox.y1 + 1) / 2;
  const R = (r, inflate = 0) => {
    let w = r.w * cell, d = r.h * cell; const cx = (r.x + r.w / 2 - ox) * cell, cz = (r.y + r.h / 2 - oz) * cell;
    return [cx, cz, Math.max(w, MINW) + inflate, Math.max(d, MINW) + inflate];
  };
  const wallL = [], slabL = [], glassL = [], paraL = [];
  const opens = sp.opens.map(o => {
    const w = (o.x1 - o.x0 + 1) * cell, d = (o.y1 - o.y0 + 1) * cell, horiz = w >= d;
    return { cx: ((o.x0 + o.x1 + 1) / 2 - ox) * cell, cz: ((o.y0 + o.y1 + 1) / 2 - oz) * cell, w: Math.max(w, MINW), d: Math.max(d, MINW), len: Math.max(w, d), horiz };
  });
  for (let f = 0; f < sp.floors; f++) {
    const y0 = f * fh;
    sp.fpRects.forEach(r => { const [cx, cz, w, d] = R(r); slabL.push([cx, y0 + slabT / 2, cz, w + .2, slabT, d + .2]); });
    sp.wallRects.forEach(r => { const [cx, cz, w, d] = R(r); wallL.push([cx, y0 + slabT + wallH / 2, cz, w, wallH, d]); });
    opens.forEach(o => {
      const yb = y0 + slabT;
      if (o.len < .5) { wallL.push([o.cx, yb + wallH / 2, o.cz, o.w, wallH, o.d]); return; }
      const sill = o.len >= 2.4 ? .12 : .9, head = 2.3;
      wallL.push([o.cx, yb + sill / 2, o.cz, o.w, sill, o.d], [o.cx, yb + (head + wallH) / 2, o.cz, o.w, wallH - head, o.d]);
      glassL.push([o.cx, yb + (sill + head) / 2, o.cz, o.horiz ? o.w : .07, head - sill, o.horiz ? .07 : o.d]);
    });
  }
  const H = sp.floors * fh;
  if (sp.roofOn) {
    sp.fpRects.forEach(r => { const [cx, cz, w, d] = R(r); slabL.push([cx, H + slabT / 2, cz, w + .2, slabT, d + .2]); });
    sp.bandRects.forEach(r => { const [cx, cz, w, d] = R(r); paraL.push([cx, H + slabT + .45, cz, w, .9, d]); });
  }
  const wallM = new THREE.MeshStandardMaterial({ color: '#F5F3EF', roughness: .92 });
  const slabM = new THREE.MeshStandardMaterial({ color: '#8F8B85', roughness: .85 });
  const glassM = new THREE.MeshStandardMaterial({ color: '#8DB4D2', roughness: .05, metalness: .3, transparent: true, opacity: .55 });
  const b = new THREE.Group();
  b.add(boxes(slabL, slabM), boxes(wallL, wallM), boxes(paraL, slabM), boxes(glassL, glassM, false));
  g.add(b);
  const site = siteBase(g, { x0: -sp.bw / 2, x1: sp.bw / 2, z0: -sp.bd / 2, z1: sp.bd / 2 });
  const focus = new THREE.Box3(new THREE.Vector3(-sp.bw / 2, 0, -sp.bd / 2), new THREE.Vector3(sp.bw / 2, H + (sp.roofOn ? 1.2 : 0), sp.bd / 2));
  return { group: g, focus, siteR: site.R };
}
function planSpec(ex, name, realW, floors, roofOn) {
  const pxW = ex.bbox.x1 - ex.bbox.x0 + 1, pxH = ex.bbox.y1 - ex.bbox.y0 + 1, cell = realW / pxW;
  const openCount = ex.opens.filter(o => Math.max(o.x1 - o.x0 + 1, o.y1 - o.y0 + 1) * cell >= .5).length;
  return { kind: 'plan', name, cell, bw: pxW * cell, bd: pxH * cell, floors, realW, roofOn, bbox: ex.bbox,
    wallRects: ex.wallRects, fpRects: ex.fpRects, bandRects: ex.bandRects, opens: ex.opens, openCount,
    fpArea: ex.fpN * cell * cell, fitKey: `${name}|${realW}|${floors}` };
}

/* ───────── 3D 모델: 트레이싱 외곽선 → 매스 모형 ───────── */
function buildMass(sp) {
  const g = new THREE.Group(), b = new THREE.Group(); g.add(b);
  const P = sp.poly, fh = 3.2, slabT = .32, wallH = fh - slabT;
  const xs = P.map(p => p[0]), zs = P.map(p => p[1]);
  const ext = { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) };
  const N = edgeNormals(P);
  // 남측(도로 쪽)에서 가장 긴 변의 가운데를 현관 진입로로
  let door = (ext.x0 + ext.x1) / 2, best = 0;
  P.forEach((p, i) => { const q = P[(i + 1) % P.length], L = Math.hypot(q[0] - p[0], q[1] - p[1]); if (N[i][1] > .7 && L > best) { best = L; door = (p[0] + q[0]) / 2; } });
  const site = siteBase(g, ext, { doorX: door });

  const wallM = new THREE.MeshStandardMaterial({ color: '#F6F4F0', roughness: .9 });
  const slabM = new THREE.MeshStandardMaterial({ color: '#8F8B85', roughness: .85 });
  const capM = new THREE.MeshStandardMaterial({ color: '#B4B0A9', roughness: .85 });
  const glassM = new THREE.MeshStandardMaterial({ color: '#7FA8C9', roughness: .05, metalness: .35, transparent: true, opacity: .72 });
  const frameM = new THREE.MeshStandardMaterial({ color: '#3C3F44', roughness: .5, metalness: .3 });
  const outer = offsetPoly(P, .16);

  for (let f = 0; f < sp.floors; f++) {
    const y0 = f * fh;
    b.add(extrudePoly(outer, slabT, slabM, y0));
    b.add(extrudePoly(P, wallH, wallM, y0 + slabT));
    P.forEach((p, i) => {
      const q = P[(i + 1) % P.length], dx = q[0] - p[0], dz = q[1] - p[1], L = Math.hypot(dx, dz);
      if (L < 1.6) return;
      const south = N[i][1] > .6, big = south || (f === 0 && sp.shopFront && south);
      const n = Math.max(1, Math.floor(L / (big ? 4.2 : 3.2))), w = Math.max(.9, Math.min(big ? 3.6 : 2.2, L / n - (big ? .5 : 1)));
      const h = big ? 2.25 : 1.45, sill = big ? .2 : .95, ang = Math.atan2(-dz, dx);
      for (let k = 0; k < n; k++) {
        const t = (k + .5) / n, cx = p[0] + dx * t + N[i][0] * .05, cz = p[1] + dz * t + N[i][1] * .05, yc = y0 + slabT + sill + h / 2;
        const grp = new THREE.Group();
        grp.add(box(w, h, .08, glassM, 0, 0, 0, false), box(w + .12, .08, .12, frameM, 0, h / 2, 0, false), box(w + .12, .08, .12, frameM, 0, -h / 2, 0, false),
          box(.07, h, .12, frameM, -w / 2, 0, 0, false), box(.07, h, .12, frameM, w / 2, 0, 0, false));
        for (let m = 1; m < Math.floor(w / 1.2) + 1; m++) grp.add(box(.05, h, .1, frameM, -w / 2 + m * w / (Math.floor(w / 1.2) + 1), 0, 0, false));
        grp.position.set(cx, yc, cz); grp.rotation.y = ang; b.add(grp);
      }
    });
  }
  const H = sp.floors * fh;
  b.add(extrudePoly(outer, slabT, slabM, H));
  b.add(extrudePoly(outer, .9, wallM, H + slabT, offsetPoly(P, -.15)));
  b.add(extrudePoly(outer, .06, capM, H + slabT + .9, offsetPoly(P, -.15)));
  // 현관 캐노피
  b.add(box(2.6, .14, 1.4, frameM, door, 2.75, ext.z1 + .7));
  const focus = new THREE.Box3(new THREE.Vector3(ext.x0, 0, ext.z0), new THREE.Vector3(ext.x1, H + 1.3, ext.z1));
  return { group: g, focus, siteR: site.R };
}
function massSpec(tr) {
  const P0 = tr.pts; const xs = P0.map(p => p[0]), ys = P0.map(p => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const s = tr.realW / Math.max(1, maxX - minX), cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const poly = P0.map(([x, y]) => [(x - cx) * s, (y - cy) * s]);
  return { kind: 'mass', name: tr.img.name, poly, floors: tr.floors, realW: tr.realW, fpArea: Math.abs(polyArea(poly)),
    depth: (maxY - minY) * s, fitKey: `mass|${tr.ver}|${tr.realW}|${tr.floors}` };
}

/* ───────── 샘플 평면도 (치수선 · 글씨 포함 — 잡선 필터 시연) ───────── */
function drawSample(type) {
  const c = document.createElement('canvas'); c.width = 900; c.height = 680; const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, 900, 680);
  const H = (y, segs, t) => segs.forEach(([a, b]) => g.fillRect(a - t / 2, y - t / 2, b - a + t, t));
  const V = (x, segs, t) => segs.forEach(([a, b]) => g.fillRect(x - t / 2, a - t / 2, t, b - a + t));
  const ink = '#111';
  const win = (x1, y1, x2, y2) => { g.strokeStyle = ink; g.lineWidth = 1.5; g.beginPath();
    if (y1 === y2) { g.moveTo(x1, y1 - 3); g.lineTo(x2, y1 - 3); g.moveTo(x1, y1 + 3); g.lineTo(x2, y1 + 3); g.moveTo(x1, y1); g.lineTo(x2, y1); }
    else { g.moveTo(x1 - 3, y1); g.lineTo(x1 - 3, y2); g.moveTo(x1 + 3, y1); g.lineTo(x1 + 3, y2); g.moveTo(x1, y1); g.lineTo(x1, y2); } g.stroke(); };
  const lab = (t, x, y, s = 22) => { g.fillStyle = ink; g.font = `700 ${s}px "Noto Sans KR",sans-serif`; g.textAlign = 'center'; g.fillText(t, x, y); };
  const door = (x, y, r, a0, a1) => { g.strokeStyle = ink; g.lineWidth = 1.2; g.beginPath(); g.arc(x, y, r, a0, a1); g.stroke(); };
  const dimH = (x1, x2, y, t) => { g.strokeStyle = ink; g.lineWidth = 1; g.beginPath(); g.moveTo(x1, y); g.lineTo(x2, y); [x1, x2].forEach(xx => { g.moveTo(xx, y - 8); g.lineTo(xx, y + 8); g.moveTo(xx - 5, y + 5); g.lineTo(xx + 5, y - 5); }); g.stroke(); lab(t, (x1 + x2) / 2, y - 6, 14); };
  const dimV = (y1, y2, x, t) => { g.strokeStyle = ink; g.lineWidth = 1; g.beginPath(); g.moveTo(x, y1); g.lineTo(x, y2); [y1, y2].forEach(yy => { g.moveTo(x - 8, yy); g.lineTo(x + 8, yy); g.moveTo(x - 5, yy + 5); g.lineTo(x + 5, yy - 5); }); g.stroke(); g.save(); g.translate(x - 8, (y1 + y2) / 2); g.rotate(-Math.PI / 2); lab(t, 0, 0, 14); g.restore(); };
  g.fillStyle = ink;
  if (type === 'house') {
    const oy = 20;
    g.save(); g.translate(0, oy); g.fillStyle = ink;
    H(60, [[60, 140], [320, 640], [780, 840]], 16); H(580, [[60, 110], [380, 450], [530, 620], [800, 840]], 16);
    V(60, [[60, 380], [520, 580]], 16); V(840, [[60, 120], [260, 580]], 16);
    V(420, [[60, 180], [260, 400]], 10); V(560, [[60, 240], [300, 420], [480, 580]], 10);
    H(200, [[420, 470], [520, 560]], 10); H(320, [[560, 840]], 10); H(460, [[420, 450], [530, 560]], 10); H(300, [[60, 230]], 10);
    win(140, 60, 320, 60); win(640, 60, 780, 60); win(110, 580, 380, 580); win(620, 580, 800, 580); win(840, 120, 840, 260); win(60, 380, 60, 520);
    door(470, 200, 50, 0, Math.PI / 2); door(560, 240, 60, Math.PI / 2, Math.PI); door(560, 420, 60, Math.PI / 2, Math.PI); door(450, 580, 80, -Math.PI / 2, 0);
    g.strokeStyle = ink; g.lineWidth = 1.2; g.strokeRect(80, 80, 280, 40); g.setLineDash([6, 6]); g.strokeRect(600, 340, 220, 60); g.setLineDash([]);
    lab('주방 · 식당', 240, 210); lab('거실', 240, 460, 26); lab('욕실', 490, 140, 18); lab('현관', 490, 530, 18); lab('침실', 700, 220); lab('안방', 700, 480);
    dimH(60, 840, 30, '14,000'); dimH(60, 420, 625, '6,400'); dimH(420, 840, 625, '7,600'); dimV(60, 580, 22, '9,300');
    g.restore();
    lab('단독주택 1층 평면도  S: 1/100', 450, 672, 16);
  } else {
    g.fillStyle = ink;
    H(80, [[80, 180], [260, 420], [560, 820]], 16); H(610, [[80, 140], [560, 660], [760, 820]], 16);
    V(80, [[80, 350], [500, 610]], 16); V(820, [[80, 610]], 16);
    H(280, [[80, 250], [310, 460], [520, 600]], 10); V(320, [[80, 280]], 10); V(640, [[80, 150]], 10); H(220, [[640, 820]], 10);
    V(600, [[280, 610]], 10); H(350, [[600, 680], [750, 820]], 10);
    win(180, 80, 260, 80); win(420, 80, 560, 80); win(80, 350, 80, 500); win(140, 610, 560, 610);
    g.strokeStyle = ink; g.lineWidth = 1.2; for (let y = 380; y <= 580; y += 22) { g.beginPath(); g.moveTo(620, y); g.lineTo(800, y); g.stroke(); }
    g.beginPath(); g.moveTo(710, 370); g.lineTo(710, 590); g.stroke(); door(760, 610, 90, Math.PI, 1.5 * Math.PI);
    lab('매장 (근린생활시설)', 340, 460, 26); lab('창고', 200, 190); lab('사무실 · 탕비', 460, 190, 20); lab('화장실', 730, 160, 18); lab('계단실', 710, 640, 16);
    dimH(80, 820, 40, '12,000'); dimV(80, 610, 40, '8,600'); dimH(600, 820, 655, '3,600');
    lab('상가주택 1층 평면도  S: 1/100', 330, 672, 16);
  }
  return c;
}

/* ───────── Three.js 씬 ───────── */
const REDUCED = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
function initScene(el) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.outputEncoding = THREE.sRGBEncoding;
  el.appendChild(renderer.domElement);
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#DFE7EE');
  const camera = new THREE.PerspectiveCamera(36, 1, .3, 3000);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = .08; controls.maxPolarAngle = Math.PI * .48; controls.minDistance = 3; controls.maxDistance = 400;
  const hemi = new THREE.HemisphereLight(0xffffff, 0x9a9384, .55); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff2dc, 1.2); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -.0004; sun.shadow.normalBias = .03; scene.add(sun, sun.target);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200), new THREE.MeshStandardMaterial({ color: '#DCD8CF', roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -.7; ground.receiveShadow = true; scene.add(ground);
  const nc = document.createElement('canvas'); nc.width = nc.height = 128; const nx = nc.getContext('2d');
  nx.fillStyle = '#FD9F28'; nx.beginPath(); nx.arc(64, 64, 52, 0, 7); nx.fill(); nx.fillStyle = '#fff'; nx.font = '900 64px "Noto Sans KR",sans-serif'; nx.textAlign = 'center'; nx.textBaseline = 'middle'; nx.fillText('N', 64, 68);
  const north = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(nc) })); scene.add(north);

  let group = null, siteR = 20, raf = 0, last = null, lastKey = null, focus = null, moved = false, rise = null;
  controls.addEventListener('start', () => { moved = true; });
  const resize = () => {
    const w = el.clientWidth, h = el.clientHeight; if (!w || !h) return;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    if (!moved && focus) api.resetView();
  };
  const loop = now => {
    if (rise && group) { const t = clamp((now - rise) / 900, 0, 1); group.userData.bldg.scale.y = Math.max(.001, 1 - Math.pow(1 - t, 3)); if (t >= 1) rise = null; }
    controls.update(); renderer.render(scene, camera); raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);

  // 건물 박스의 8개 꼭짓점을 실제 화면에 투영해, 가장 긴 방향이 화면의 FILL(=78%)을 채우도록 거리와 중심을 계산
  const FILL = .78, EL = 34 * D2R, AZ = 45 * D2R;
  const fit = () => {
    const c = focus.getCenter(new THREE.Vector3()), r = Math.max(focus.getSize(new THREE.Vector3()).length() / 2, 2);
    const dir = new THREE.Vector3(Math.cos(EL) * Math.sin(AZ), Math.sin(EL), Math.cos(EL) * Math.cos(AZ));
    const pts = []; for (let i = 0; i < 8; i++) pts.push(new THREE.Vector3(i & 1 ? focus.max.x : focus.min.x, i & 2 ? focus.max.y : focus.min.y, i & 4 ? focus.max.z : focus.min.z));
    const target = c.clone(), v = new THREE.Vector3();
    const measure = d => {
      camera.position.copy(target).addScaledVector(dir, d); camera.lookAt(target); camera.updateMatrixWorld();
      let a = 9, b2 = -9, e = 9, f = -9; for (const p of pts) { v.copy(p).project(camera); a = Math.min(a, v.x); b2 = Math.max(b2, v.x); e = Math.min(e, v.y); f = Math.max(f, v.y); }
      return { w: (b2 - a) / 2, h: (f - e) / 2, cx: (a + b2) / 2, cy: (e + f) / 2 };
    };
    let d = r * 3;
    for (let it = 0; it < 3; it++) {
      let lo = r * 1.05, hi = r * 30;
      for (let k = 0; k < 32; k++) { const mid = (lo + hi) / 2, m = measure(mid); if (Math.max(m.w, m.h) <= FILL) hi = mid; else lo = mid; }
      d = hi; const m = measure(d);
      const halfH = d * Math.tan(camera.fov * D2R / 2), halfW = halfH * camera.aspect;
      const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0), up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
      target.addScaledVector(right, m.cx * halfW).addScaledVector(up, m.cy * halfH);
    }
    camera.position.copy(target).addScaledVector(dir, d); controls.target.copy(target); controls.maxDistance = d * 5; controls.minDistance = r * .4; controls.update();
  };
  const api = {
    setModel(sp) {
      if (group) { scene.remove(group); group.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } }); }
      const b = sp.kind === 'plan' ? buildPlan(sp) : sp.kind === 'mass' ? buildMass(sp) : buildText(sp);
      group = b.group; siteR = b.siteR; focus = b.focus;
      group.userData.bldg = group.children.find(o => o.isGroup) || group;
      scene.add(group);
      north.position.set(focus.min.x - 3, 1.4, focus.min.z - 3.5); north.scale.setScalar(2.2);
      if (sp.fitKey !== lastKey) { lastKey = sp.fitKey; api.resetView(); if (!REDUCED) { rise = performance.now(); group.userData.bldg.scale.y = .001; } }
      if (last) api.setSun(last);
    },
    resetView() { if (focus) { fit(); moved = false; } },
    setSun(s) {
      last = s; const { alt, az } = s;
      const dir = new THREE.Vector3(Math.sin(az) * Math.cos(alt), Math.sin(alt), -Math.cos(az) * Math.cos(alt)), R = siteR * 3;
      sun.position.copy(dir.multiplyScalar(R)); sun.target.position.set(0, 0, 0);
      const cam = sun.shadow.camera, e = siteR * 1.1; cam.left = -e; cam.right = e; cam.top = e; cam.bottom = -e; cam.near = .5; cam.far = R * 2.5; cam.updateProjectionMatrix();
      const k = clamp(Math.sin(alt) / .6, 0, 1);
      sun.intensity = alt > 0 ? .35 + .95 * k : 0; hemi.intensity = alt > 0 ? .42 + .25 * k : .25;
      const day = new THREE.Color('#D3E2EF'), dusk = new THREE.Color('#F0C9A2'), night = new THREE.Color('#2E3846');
      scene.background = alt > 0 ? dusk.clone().lerp(day, clamp(Math.sin(alt) / .35, 0, 1)) : night;
      sun.color.set(alt > 0 && Math.sin(alt) < .25 ? '#FFD2A0' : '#FFF2DC');
    },
    setAuto(v) { controls.autoRotate = v; controls.autoRotateSpeed = 1.2; },
    dispose() { cancelAnimationFrame(raf); ro.disconnect(); controls.dispose(); renderer.dispose(); if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement); },
  };
  const ro = new ResizeObserver(resize); ro.observe(el); resize();
  return api;
}

export {
  texCache, texCanvas, wallMat, lum, box, boxes, TRUNK, tree, pavingCanvas, pavingMat, siteBase, polyArea, edgeNormals, offsetPoly, extrudePoly, buildText, morph, components, mergeRects, extractPlan, buildPlan, planSpec, buildMass, massSpec, drawSample, REDUCED, initScene,
};
