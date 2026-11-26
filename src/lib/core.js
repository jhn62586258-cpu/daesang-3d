/* 대상건축사사무소 AI 건축 3D 시뮬레이터 — 공통 데이터·문장 분석·면적/건축비·태양 위치 */

const PY = 3.3058;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fmt = (n, d = 0) => Number(n).toLocaleString('ko-KR', { maximumFractionDigits: d, minimumFractionDigits: d });
const D2R = Math.PI / 180;


/* ───────── 재질 · 지붕 · 기본 스펙 ───────── */
const MATS = {
  paint:    { name: '도장(스타코)', color: '#F4F3EF', unit: 0 },
  wood:     { name: '우드',         color: '#C48A55', unit: 40 },
  brick:    { name: '벽돌',         color: '#B8603F', unit: 60 },
  concrete: { name: '노출콘크리트', color: '#BDBBB5', unit: 50 },
  zinc:     { name: '징크(금속)',   color: '#4A4D52', unit: 70 },
  stone:    { name: '석재',         color: '#D6CDBB', unit: 90 },
};
const ROOFS = { flat: '평지붕(파라펫)', gable: '박공지붕', hip: '모임지붕', shed: '외쪽 경사지붕' };
const BASE = { land: 60, floors: 2, material: 'paint', wallColor: '#F4F3EF', colorName: '화이트', glass: 0.38, roof: 'flat', roofColor: '#4A4D52',
  terrace: false, shop: false, piloti: false, use: '단독·전원주택' };
const BCR = 0.6;       // 건폐율 가정

/* ───────── 규칙 기반(키 없이) 문장 분석 ───────── */
const COLORS = [ // [패턴, HEX, 표시명, 색만 말했을 때 재질]
  ['청하늘색?|스카이\\s*블루', '#87CEEB', '청하늘색'], ['연하늘색?', '#A9D8EE', '연하늘색'], ['하늘색?', '#87CEEB', '하늘색'],
  ['진회색|차콜|다크\\s*그레이', '#4A4A4A', '차콜'], ['연회색|라이트\\s*그레이', '#C9C9C9', '연회색'], ['회색|그레이|잿빛', '#9A9A9A', '회색'],
  ['아이보리', '#F2EAD8', '아이보리'], ['크림', '#F3E7C9', '크림'], ['베이지', '#D9C7A7', '베이지'],
  ['화이트|흰색|흰|하얀|하양|백색', '#F4F3EF', '화이트', 'paint'],
  ['블랙|검정|검은|까만|흑색', '#2B2B2B', '블랙', 'zinc'],
  ['네이비|남색', '#1F3A5F', '네이비'], ['청록', '#2F8F8F', '청록'], ['민트', '#98D8C8', '민트'], ['파란|파랑|블루|청색', '#3F6FB5', '블루'],
  ['연두', '#A6CF6B', '연두'], ['올리브', '#7D7F45', '올리브'], ['초록|녹색|그린', '#5F8F52', '그린'],
  ['밤색', '#6B3F2A', '밤색', 'wood'], ['갈색|브라운', '#8B5A3C', '브라운', 'wood'],
  ['테라코타', '#C66B4A', '테라코타'], ['와인|버건디', '#7A2E3A', '버건디'], ['빨간|빨강|레드|적색', '#B8403A', '레드'],
  ['노란|노랑|옐로', '#E8C34A', '옐로'], ['주황|오렌지', '#F08A24', '오렌지'], ['분홍|핑크', '#E8A6B5', '핑크'],
  ['보라|퍼플|라벤더', '#8A6BB0', '퍼플'], ['금색|골드', '#C9A45C', '골드'], ['은색|실버', '#C0C4C8', '실버'],
].map(([p, h, n, m]) => [new RegExp(p, 'g'), h, n, m]);
const MAT_RX = [
  ['wood', /우드|목재|나무|원목|목조|따뜻/g], ['brick', /적벽돌|벽돌|브릭/g], ['concrete', /노출\s*콘크리트|콘크리트|인더스트리얼/g],
  ['zinc', /징크|금속|메탈|알루미늄/g], ['stone', /석재|화강석|대리석|스톤|돌\s*마감/g], ['paint', /스타코|도장|페인트/g],
];
const ROOF_RX = [['gable', /박공|맞배|뾰족|삼각\s*지붕/g], ['hip', /모임\s*지붕|사면\s*지붕|우진각|모임/g], ['shed', /외쪽|한쪽\s*경사|경사\s*지붕|모노\s*피치/g], ['flat', /평지붕|평평한\s*지붕|플랫\s*지붕|평슬래브/g]];
const NEG = /^\s*(?:색|색상|색깔|재질|마감|지붕|느낌|스타일)?\s*(?:은|는|이|가|을|를|으로|로)?\s*(?:말고|말구|제외|빼고|빼줘|아니|없이|없는|없애|싫|별로|대신|노노)/;

function hits(re, str) {
  const out = []; re.lastIndex = 0; let m;
  while ((m = re.exec(str))) { out.push({ i: m.index, t: m[0], neg: NEG.test(str.slice(m.index + m[0].length, m.index + m[0].length + 14)) }); if (!m[0].length) re.lastIndex++; }
  return out;
}
function ruleParse(raw, prev) {
  const s = raw.replace(/(\d),(\d)/g, '$1$2');
  const sp = { ...prev };
  let m;
  // 대지
  m = s.match(/(?:대지|땅|부지|토지)[^\d]{0,6}(\d+(?:\.\d+)?)\s*평/) || s.match(/(\d+(?:\.\d+)?)\s*평\s*(?:짜리\s*)?(?:의\s*)?(?:땅|대지|부지|토지)/);
  let land = m ? +m[1] : null;
  if (!land) { m = s.match(/(\d+(?:\.\d+)?)\s*(?:㎡|m2|m²|제곱미터|평방미터)/i); if (m) land = +m[1] / PY; }
  if (!land) { m = s.match(/(\d+(?:\.\d+)?)\s*평(?!\s*당)/); if (m && !/연면적|건평/.test(s)) land = +m[1]; }
  if (land) sp.land = clamp(Math.round(land * 10) / 10, 20, 600);
  // 층수
  const fl = [...s.matchAll(/(지하\s*)?(\d+)\s*층(?!\s*(?:은|는|의|만|을|에는|에서))/g)].filter(x => !x[1]).map(x => +x[2]);
  if (fl.length) sp.floors = Math.max(...fl);
  else {
    const ko = { 단층: 1, 이층: 2, 삼층: 3, 사층: 4, 오층: 5 }; for (const k in ko) if (s.includes(k)) sp.floors = ko[k];
    if (/(한|1)\s*층\s*(?:더\s*)?(?:올|높|추가|늘|증축)/.test(s) || /층\s*(?:을|를)?\s*(?:하나\s*)?더\s*(?:올|높|추가|늘)/.test(s)) sp.floors = prev.floors + 1;
    if (/(한|1)\s*층\s*(?:을|를)?\s*(?:내|낮|줄|빼|없애)/.test(s) || /층\s*(?:을|를)?\s*(?:하나\s*)?(?:낮|줄|빼)/.test(s)) sp.floors = prev.floors - 1;
  }
  sp.floors = clamp(sp.floors, 1, 7);
  // 재질
  let matHit = null; const matNeg = [];
  for (const [k, re] of MAT_RX) for (const h of hits(re, s)) { if (h.neg) matNeg.push(k); else if (!matHit || h.i > matHit.i) matHit = { k, i: h.i }; }
  // 색상 (절 단위: '지붕'이 있는 절은 지붕색)
  let wallC = null, roofC = null;
  for (const c0 of s.split(/[,.\n;!?]|그리고|하고\s/)) {
    let c = c0, best = null;
    const hx = c.match(/#([0-9a-f]{6})\b/i); if (hx) best = { hex: '#' + hx[1].toUpperCase(), name: '#' + hx[1].toUpperCase(), i: hx.index };
    for (const [re, hex, name, mat] of COLORS) {
      for (const h of hits(re, c)) if (!h.neg && (!best || h.i >= best.i)) best = { hex, name, mat, i: h.i };
      c = c.replace(re, t => ' '.repeat(t.length));
    }
    if (best) { if (/지붕/.test(c0) && !/외벽|벽면/.test(c0)) roofC = best; else wallC = best; }
  }
  if (matHit) { sp.material = matHit.k; if (!wallC) { sp.wallColor = MATS[matHit.k].color; sp.colorName = MATS[matHit.k].name + ' 기본색'; } }
  else if (matNeg.includes(sp.material) && !wallC) { sp.material = 'paint'; sp.wallColor = '#F4F3EF'; sp.colorName = '화이트'; }
  if (wallC) { sp.wallColor = wallC.hex; sp.colorName = wallC.name; if (!matHit) sp.material = wallC.mat || 'paint'; }
  if (roofC) sp.roofColor = roofC.hex;
  // 지붕 형태
  let roofHit = null;
  for (const [k, re] of ROOF_RX) for (const h of hits(re, s)) { if (h.neg) { if (sp.roof === k) sp.roof = k === 'flat' ? 'gable' : 'flat'; } else if (!roofHit || h.i > roofHit.i) roofHit = { k, i: h.i }; }
  if (roofHit) sp.roof = roofHit.k;
  // 창호
  const gl = hits(/통창|전면\s*창|커튼월|파노라마|유리\s*벽|큰\s*창/g, s);
  if (gl.some(h => !h.neg)) sp.glass = 0.72; else if (gl.length) sp.glass = 0.38;
  if (/(?:창|창문)\s*(?:을|를|은|는)?\s*(?:더\s*)?(?:크게|넓게|키워)/.test(s)) sp.glass = clamp(prev.glass + 0.15, 0.1, 0.85);
  if (/(?:창|창문)\s*(?:을|를|은|는)?\s*(?:더\s*)?(?:작게|좁게|줄여)/.test(s)) sp.glass = clamp(prev.glass - 0.15, 0.1, 0.85);
  if (/프라이버시|사생활/.test(s)) sp.glass = 0.2;
  // 옵션
  const opt = (re, key) => { const h = hits(re, s); if (h.length) sp[key] = !h[h.length - 1].neg; };
  opt(/테라스|옥상\s*정원|옥상|루프탑/g, 'terrace');
  opt(/상가|카페|근생|근린|점포|매장|가게/g, 'shop');
  opt(/필로티|주차/g, 'piloti');
  if (sp.shop) sp.piloti = false;
  if (sp.shop && !prev.shop) sp.use = '상가주택(1층 근린생활)';
  else if (!sp.shop && prev.shop) sp.use = '단독·전원주택';
  if (/사옥|오피스|업무/.test(s)) sp.use = '업무시설(사옥)';
  else if (/다가구|원룸|임대/.test(s)) sp.use = '다가구주택';
  else if (/단독|전원주택/.test(s) && !sp.shop) sp.use = '단독·전원주택';
  return sp;
}

/* ───────── 스펙 변경점 · 검증 ───────── */
function diff(a, b) {
  const out = [];
  if (a.land !== b.land) out.push(`대지 ${fmt(b.land, 1)}평`);
  if (a.floors !== b.floors) out.push(`지상 ${b.floors}층`);
  if (a.material !== b.material) out.push(`외장 ${MATS[b.material].name}`);
  if (a.wallColor !== b.wallColor) out.push(`외벽색 ${b.colorName || b.wallColor} ${b.wallColor}`);
  if (a.glass !== b.glass) out.push(`창호 ${glassName(b.glass)}`);
  if (a.roof !== b.roof) out.push(ROOFS[b.roof]);
  if (a.roofColor !== b.roofColor) out.push(`지붕색 ${b.roofColor}`);
  if (a.terrace !== b.terrace) out.push(b.terrace ? '테라스 추가' : '테라스 제외');
  if (a.shop !== b.shop) out.push(b.shop ? '1층 상가' : '상가 제외');
  if (a.piloti !== b.piloti) out.push(b.piloti ? '필로티 주차' : '필로티 제외');
  if (a.use !== b.use && !out.some(x => x.includes('상가'))) out.push(b.use);
  return out;
}
const glassName = g => g >= 0.6 ? `통창(${Math.round(g * 100)}%)` : g < 0.3 ? `작은 창(${Math.round(g * 100)}%)` : `일반 창(${Math.round(g * 100)}%)`;
const hexOk = v => typeof v === 'string' && /^#?[0-9a-f]{6}$/i.test(v.trim()) ? ('#' + v.trim().replace('#', '')).toUpperCase() : null;
function sanitize(prev, o) {
  const sp = { ...prev }; if (!o || typeof o !== 'object') return sp;
  if (isFinite(o.land) && o.land !== null) sp.land = clamp(Math.round(+o.land * 10) / 10, 20, 600);
  if (isFinite(o.floors) && o.floors !== null) sp.floors = clamp(Math.round(+o.floors), 1, 7);
  if (MATS[o.material]) sp.material = o.material;
  if (hexOk(o.wallColor)) { sp.wallColor = hexOk(o.wallColor); sp.colorName = typeof o.colorName === 'string' && o.colorName.trim() ? o.colorName.trim().slice(0, 16) : sp.wallColor; }
  if (isFinite(o.glass) && o.glass !== null) sp.glass = clamp(Math.round(+o.glass * 100) / 100, 0.1, 0.9);
  if (ROOFS[o.roof]) sp.roof = o.roof;
  if (hexOk(o.roofColor)) sp.roofColor = hexOk(o.roofColor);
  for (const k of ['terrace', 'shop', 'piloti']) if (typeof o[k] === 'boolean') sp[k] = o[k];
  if (typeof o.use === 'string' && o.use.trim()) sp.use = o.use.trim().slice(0, 24);
  if (sp.shop) sp.piloti = false;
  return sp;
}

/* ───────── 면적 · 공사비 ───────── */
const TIERS = {
  basic:    { name: '실속형',   unit: 750,  desc: '합리적 마감·표준 창호' },
  standard: { name: '표준형',   unit: 900,  desc: '중상급 마감·시스템 창호' },
  high:     { name: '하이엔드', unit: 1100, desc: '고급 외장·특화 설계' },
};
function calcText(sp) {
  const landM2 = sp.land * PY, foot = landM2 * BCR; let gfa = 0;
  for (let i = 0; i < sp.floors; i++) {
    if (sp.piloti && i === 0) { gfa += 20; continue; }
    gfa += (sp.terrace && sp.floors > 1 && i === sp.floors - 1) ? foot * 0.72 : foot;
  }
  return { landM2, building: foot, gfa };
}
function estimate(sp, tier = 'standard') {
  if (!sp) return null;
  let building, gfa, landM2 = null;
  if (sp.kind === 'plan' || sp.kind === 'mass') { building = sp.fpArea; gfa = building * sp.floors; }
  else { const c = calcText(sp); building = c.building; gfa = c.gfa; landM2 = c.landM2; }
  const unit = TIERS[tier].unit, gfaPy = gfa / PY, cost = gfaPy * unit / 10000;
  return { building, gfa, gfaPy, landM2, unit, cost, low: cost * 0.93, high: cost * 1.08,
    bcr: landM2 ? building / landM2 * 100 : null, far: landM2 ? gfa / landM2 * 100 : null };
}
function summary(sp, tier = 'standard') {
  if (!sp) return [];
  const e = estimate(sp, tier), rows = [];
  if (sp.kind === 'mass') {
    rows.push(['생성 방식', '도면 외곽선 트레이싱 → 3D'], ['도면', sp.name], ['층수', `지상 ${sp.floors}층`],
      ['건축면적', `${fmt(e.building, 1)}㎡ (${fmt(e.building / PY, 1)}평)`]);
  } else if (sp.kind === 'plan') {
    rows.push(['생성 방식', '평면도 자동 벽체 인식 → 3D'], ['도면', sp.name], ['층수', `지상 ${sp.floors}층`],
      ['창호', `외벽 개구부 ${sp.openCount}곳 유리 처리`], ['건축면적(추정)', `${fmt(e.building, 1)}㎡ (${fmt(e.building / PY, 1)}평)`]);
  } else {
    rows.push(['생성 방식', '문장 입력 → 3D'], ['대지면적', `${fmt(sp.land, 1)}평 (${fmt(e.landM2, 1)}㎡)`],
      ['층수', `지상 ${sp.floors}층${sp.piloti ? ' (1층 필로티)' : ''}`], ['용도', sp.use],
      ['외장', `${MATS[sp.material].name} · ${sp.colorName} ${sp.wallColor}`], ['창호', glassName(sp.glass)],
      ['지붕', `${ROOFS[sp.roof]}${sp.roof !== 'flat' ? ' ' + sp.roofColor : ''}`], ['옥상·테라스', sp.terrace ? '포함' : '없음']);
  }
  rows.push(['연면적', `${fmt(e.gfa, 1)}㎡ (${fmt(e.gfaPy, 1)}평)`],
    ['마감 수준', `${TIERS[tier].name} (평당 ${fmt(TIERS[tier].unit)}만 원)`],
    ['예상 건축비', `약 ${fmt(e.cost, 1)}억 원 (${fmt(e.low, 1)}~${fmt(e.high, 1)}억)`]);
  return rows;
}

/* ───────── 태양 위치 (안양 37.39°N, 126.95°E, KST) ───────── */
const DECL = { summer: 23.44, equinox: 0, winter: -23.44 };
const SEASON_KO = { summer: '하지(6월)', equinox: '춘·추분', winter: '동지(12월)' };
const SOLAR_OFFSET = (135 - 126.95) / 15;
function sunPos(clock, season) {
  const lat = 37.39 * D2R, dec = DECL[season] * D2R, H = (clock - SOLAR_OFFSET - 12) * 15 * D2R;
  const sinA = Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(H), alt = Math.asin(sinA);
  let az = Math.acos(clamp((Math.sin(dec) - sinA * Math.sin(lat)) / (Math.cos(alt) * Math.cos(lat)), -1, 1)); if (H > 0) az = 2 * Math.PI - az;
  const H0 = Math.acos(clamp(-Math.tan(lat) * Math.tan(dec), -1, 1)) / D2R / 15, noon = 12 + SOLAR_OFFSET;
  return { alt, az, altDeg: alt / D2R, azDeg: az / D2R, rise: noon - H0, set: noon + H0, noon };
}
const hm = h => { const t = Math.round(h * 60); return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; };
const dirKo = a => ['북', '북동', '동', '남동', '남', '남서', '서', '북서'][Math.round(a / 45) % 8];

export {
  PY, clamp, fmt, D2R, MATS, ROOFS, BASE, BCR, COLORS, MAT_RX, ROOF_RX, NEG, hits, ruleParse, diff, glassName, hexOk, sanitize, TIERS, calcText, estimate, summary, DECL, SEASON_KO, SOLAR_OFFSET, sunPos, hm, dirKo,
};
