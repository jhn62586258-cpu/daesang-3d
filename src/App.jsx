/* 대상건축사사무소 AI 건축 3D 시뮬레이터 — 화면(React) */
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { PY, fmt, MATS, ROOFS, BASE, ruleParse, diff, glassName, sanitize, TIERS, estimate, summary, SEASON_KO, sunPos, hm, dirKo } from './lib/core.js';
import { extractPlan, planSpec, massSpec, drawSample, initScene } from './lib/scene.js';
import { submitInquiry } from './firebase.js';

function Viewer({ spec, sun }) {
  const mount = useRef(null), ctx = useRef(null);
  const [auto, setAuto] = useState(false), [fail, setFail] = useState(false);
  useEffect(() => { try { ctx.current = initScene(mount.current); } catch (e) { console.error(e); setFail(true); } return () => ctx.current && ctx.current.dispose(); }, []);
  useEffect(() => { if (ctx.current && spec) { try { ctx.current.setModel(spec); } catch (e) { console.error(e); } } }, [spec]);
  useEffect(() => { if (ctx.current) ctx.current.setSun(sun); }, [sun, spec]);
  useEffect(() => { if (ctx.current) ctx.current.setAuto(auto); }, [auto]);
  return (
    <div ref={mount} style={{ position: 'absolute', inset: 0 }}>
      {fail && <div className="loading">이 기기에서 3D(WebGL)를 실행하지 못했습니다.</div>}
      <div className="hud">
        <button onClick={() => ctx.current && ctx.current.resetView()}>조감도 시점</button>
        <button aria-pressed={auto} onClick={() => setAuto(!auto)}>자동 회전</button>
      </div>
      <div className="hint">드래그: 360° 회전 · 휠/핀치: 확대 · 우클릭 드래그: 이동</div>
    </div>
  );
}

/* ───────── 트레이싱 보드 (3D 뷰어 위에 겹쳐 표시) ───────── */
function TraceBoard({ tr, set, onClose }) {
  const wrap = useRef(null), cv = useRef(null);
  const [size, setSize] = useState({ w: 0, h: 0 }), [hover, setHover] = useState(null);
  useEffect(() => { const ro = new ResizeObserver(() => wrap.current && setSize({ w: wrap.current.clientWidth, h: wrap.current.clientHeight })); ro.observe(wrap.current); return () => ro.disconnect(); }, []);
  const img = tr.img, pad = 18, top = 58;
  const s = img && size.w ? Math.min((size.w - pad * 2) / img.w, (size.h - pad - top) / img.h) : 1;
  const ox = (size.w - img.w * s) / 2, oy = top + (size.h - top - pad - img.h * s) / 2;
  const toScr = ([x, y]) => [ox + x * s, oy + y * s];
  const snap = (x, y) => {
    if (!tr.ortho || !tr.pts.length) return [x, y];
    const [px, py] = tr.pts[tr.pts.length - 1]; let nx = x, ny = y;
    if (Math.abs(x - px) < Math.abs(y - py) * .2) nx = px; else if (Math.abs(y - py) < Math.abs(x - px) * .2) ny = py;
    if (tr.pts.length >= 2) { const [fx, fy] = tr.pts[0]; if (Math.abs(nx - fx) * s < 10) nx = fx; if (Math.abs(ny - fy) * s < 10) ny = fy; }
    return [nx, ny];
  };
  const local = e => { const r = cv.current.getBoundingClientRect(); return [(e.clientX - r.left - ox) / s, (e.clientY - r.top - oy) / s]; };
  const nearFirst = (x, y) => { if (tr.pts.length < 3) return false; const [a, b] = toScr(tr.pts[0]), [c, d] = toScr([x, y]); return Math.hypot(a - c, b - d) < 16; };
  const click = e => {
    if (tr.closed) return; let [x, y] = local(e);
    if (x < 0 || y < 0 || x > img.w || y > img.h) return;
    if (nearFirst(x, y)) { set({ closed: true, ver: tr.ver + 1 }); setTimeout(onClose, 350); return; }
    [x, y] = snap(x, y); set({ pts: [...tr.pts, [x, y]] });
  };
  useEffect(() => {
    const c = cv.current; if (!c || !size.w) return; const dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = size.w * dpr; c.height = size.h * dpr; const g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#EFEDE8'; g.fillRect(0, 0, size.w, size.h);
    g.fillStyle = '#fff'; g.fillRect(ox, oy, img.w * s, img.h * s); g.drawImage(img.el, ox, oy, img.w * s, img.h * s);
    const P = tr.pts.map(toScr);
    if (P.length) {
      g.lineJoin = 'round'; g.lineWidth = 3; g.strokeStyle = '#FD9F28'; g.beginPath(); P.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y));
      if (tr.closed) { g.closePath(); g.fillStyle = 'rgba(253,159,40,.22)'; g.fill(); }
      g.stroke();
      if (!tr.closed && hover) {
        const [hx, hy] = toScr(nearFirst(...hover) ? tr.pts[0] : snap(...hover));
        g.setLineDash([6, 5]); g.beginPath(); g.moveTo(...P[P.length - 1]); g.lineTo(hx, hy); g.stroke(); g.setLineDash([]);
      }
      P.forEach(([x, y], i) => { g.beginPath(); g.arc(x, y, i === 0 ? 8 : 5.5, 0, 7); g.fillStyle = i === 0 ? '#FD9F28' : '#fff'; g.fill(); g.lineWidth = 2.5; g.strokeStyle = i === 0 ? '#fff' : '#FD9F28'; g.stroke(); });
    }
  }, [size, tr, hover]);
  const msg = tr.closed ? '외곽선이 완성되었습니다. 3D 보기로 확인하세요.' : !tr.pts.length ? '① 건물 외곽의 한 꼭짓점을 클릭해 시작하세요' : tr.pts.length < 3 ? `② 다음 꼭짓점을 차례로 클릭하세요 (현재 ${tr.pts.length}개)` : `③ 첫 점(주황)을 다시 누르면 3D 건물이 완성됩니다 (현재 ${tr.pts.length}개)`;
  return (
    <div className="board" ref={wrap}>
      <canvas ref={cv} onClick={click} onPointerMove={e => setHover(local(e))} onPointerLeave={() => setHover(null)} aria-label="도면 위에 건물 외곽선 그리기" />
      <div className="boardbar">
        <span className="bmsg">{msg}</span>
        <button onClick={() => set(tr.closed ? { closed: false } : { pts: tr.pts.slice(0, -1) })} disabled={!tr.pts.length}>한 점 되돌리기</button>
        <button onClick={() => set({ pts: [], closed: false })} disabled={!tr.pts.length}>다시 그리기</button>
        {tr.closed && <button className="go" onClick={onClose}>3D 보기</button>}
      </div>
    </div>
  );
}

/* ───────── 좌측: 모드 A (도면) ───────── */
const SAMPLE_OUTLINE = { house: [[52, 72], [848, 72], [848, 608], [52, 608]], shop: [[72, 72], [828, 72], [828, 618], [72, 618]] };
function makeSample(type) {
  const c = drawSample(type);
  return { el: c, w: c.width, h: c.height, name: type === 'house' ? '샘플: 단독주택 평면도' : '샘플: 상가주택 평면도', sample: type };
}
function DropZone({ onFile }) {
  const [drag, setDrag] = useState(false), ref = useRef(null);
  return (
    <div className={'drop' + (drag ? ' on' : '')} role="button" tabIndex={0}
      onClick={() => ref.current.click()} onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && ref.current.click()}
      onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
      onDrop={e => { e.preventDefault(); setDrag(false); onFile(e.dataTransfer.files[0]); }}>
      <strong>도면 파일 올리기</strong>클릭하거나 이미지를 끌어다 놓으세요 (JPG·PNG)
      <input ref={ref} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={e => { onFile(e.target.files[0]); e.target.value = ''; }} />
    </div>
  );
}
const loadImageFile = (file, ok, bad) => {
  if (!file || !/image\/(png|jpe?g|webp)/.test(file.type)) { bad('JPG 또는 PNG 이미지 파일을 올려 주세요.'); return; }
  const url = URL.createObjectURL(file), img = new Image();
  img.onload = () => ok({ el: img, w: img.naturalWidth, h: img.naturalHeight, name: file.name, url });
  img.onerror = () => bad('이미지를 읽지 못했습니다.'); img.src = url;
};

function TracePanel({ tr, set, board, setBoard }) {
  const [err, setErr] = useState('');
  const sp = tr.closed && tr.pts.length >= 3 ? massSpec(tr) : null;
  const pick = (img, realW) => { setErr(''); set({ img, pts: [], closed: false, realW: realW || tr.realW }); setBoard(true); };
  return (
    <div>
      <p className="lead">도면 위에서 건물 외곽 꼭짓점을 차례로 클릭해 다각형을 닫으면, 그 모양 그대로 3D 건물이 솟아오릅니다. 얇은 CAD 도면도 정확하게 만들 수 있습니다.</p>
      <DropZone onFile={f => loadImageFile(f, img => pick(img, 12), setErr)} />
      <div className="lbl" style={{ marginTop: 12 }}>도면이 없으신가요? <span>샘플로 체험</span></div>
      <div className="samples">
        <button className="btn sec" onClick={() => pick(makeSample('house'), 14)}>단독주택 평면도</button>
        <button className="btn sec" onClick={() => pick(makeSample('shop'), 12)}>상가주택 평면도</button>
      </div>
      {err && <p className="err">{err}</p>}
      <div className="tstat">
        <b>{tr.img.name}</b>
        <span>{tr.closed ? `외곽선 완성 · 꼭짓점 ${tr.pts.length}개` : `그리는 중 · 꼭짓점 ${tr.pts.length}개`}</span>
      </div>
      <div className="tools tools3">
        <button className="btn sec" onClick={() => { set(tr.closed ? { closed: false } : { pts: tr.pts.slice(0, -1) }); setBoard(true); }} disabled={!tr.pts.length}>한 점 되돌리기</button>
        <button className="btn sec" onClick={() => { set({ pts: [], closed: false }); setBoard(true); }} disabled={!tr.pts.length}>다시 그리기</button>
        {board ? <button className="btn gray" onClick={() => setBoard(false)} disabled={!tr.closed}>3D 보기</button>
          : <button className="btn gray" onClick={() => setBoard(true)}>도면 수정</button>}
      </div>
      {tr.img.sample && !tr.closed && <button className="linkbtn" onClick={() => { set({ pts: SAMPLE_OUTLINE[tr.img.sample], closed: true, ver: tr.ver + 1 }); setBoard(false); }}>그리기가 번거로우면: 샘플 외곽선 자동 입력</button>}
      <label className="chk"><input type="checkbox" checked={tr.ortho} onChange={e => set({ ortho: e.target.checked })} />직각 보정 <span className="muted">(가로·세로선을 반듯하게)</span></label>
      <div className="field"><label>외곽선 가로 실제 길이 <span>{tr.realW} m</span></label>
        <input type="range" min="5" max="40" step="0.5" value={tr.realW} onChange={e => set({ realW: +e.target.value })} /></div>
      <div className="field"><label>층수</label>
        <div className="seg">{[1, 2, 3, 4, 5].map(n => <button key={n} aria-pressed={tr.floors === n} onClick={() => set({ floors: n })}>{n}층</button>)}</div></div>
      {sp && <p className="muted" style={{ marginTop: 10 }}>건축면적 {fmt(sp.fpArea, 1)}㎡ ({fmt(sp.fpArea / PY, 1)}평) · 세로 약 {fmt(sp.depth, 1)}m</p>}
    </div>
  );
}

function AutoPanel({ spec, setSpec }) {
  const [src, setSrc] = useState(null);
  const [thr, setThr] = useState(110), [k, setK] = useState(2), [realW, setRealW] = useState(14), [floors, setFloors] = useState(2), [roofOn, setRoofOn] = useState(true);
  const [err, setErr] = useState(''), [info, setInfo] = useState(null);
  const exRef = useRef(null);
  const apply = (s, w, f, r) => {
    const ex = exRef.current;
    if (!ex || ex.wallRects.length < 4) { setErr('주요 벽체 선을 찾지 못했습니다. 얇은 CAD 도면은 "외곽선 따라 그리기"를 이용해 주세요.'); return; }
    setErr(''); const sp = planSpec(ex, s.name, w, f, r); setSpec(sp);
    setInfo({ preview: ex.preview, walls: ex.wallRects.length, opens: sp.openCount, removed: ex.removed, t: ex.t * sp.cell });
  };
  const full = (s, t, kk, w, f, r) => { if (!s) return; const ex = extractPlan(s.el, t, kk); exRef.current = ex.empty ? null : ex; apply(s, w, f, r); };
  const loadSample = type => { const s = makeSample(type), w = type === 'house' ? 14 : 12, f = type === 'house' ? 2 : 3; setSrc(s); setRealW(w); setFloors(f); setThr(110); setK(2); full(s, 110, 2, w, f, roofOn); };
  useEffect(() => { if (!spec) loadSample('house'); }, []);
  return (
    <div>
      <p className="lead">굵은 벽체 선을 자동으로 찾아 세웁니다. 치수선·글씨·점선은 걸러냅니다. 벽이 진하게 칠해진 도면에 적합합니다.</p>
      <DropZone onFile={f => loadImageFile(f, img => { setSrc(img); full(img, thr, k, realW, floors, roofOn); }, setErr)} />
      <div className="samples" style={{ marginTop: 12 }}>
        <button className="btn sec" onClick={() => loadSample('house')}>단독주택 평면도</button>
        <button className="btn sec" onClick={() => loadSample('shop')}>상가주택 평면도</button>
      </div>
      {err && <p className="err">{err}</p>}
      {src && info && <div className="thumb">
        <img src={info.preview} alt="벽체 인식 결과" />
        <div className="legend"><span><i style={{ background: '#FD9F28' }} />인식된 벽체</span><span><i style={{ background: '#4AA3DF' }} />창호·출입구</span></div>
        <p>{src.name} · 벽체 블록 {fmt(info.walls)}개 · 개구부 {info.opens}곳 · 잡선·글씨 {fmt(info.removed)}개 제거</p>
      </div>}
      <div className="field"><label>도면 가로 실제 길이 <span>{realW} m</span></label>
        <input type="range" min="6" max="40" step="0.5" value={realW} onChange={e => { const v = +e.target.value; setRealW(v); src && apply(src, v, floors, roofOn); }} /></div>
      <div className="field"><label>층수 (같은 평면 반복)</label>
        <div className="seg">{[1, 2, 3, 4].map(n => <button key={n} aria-pressed={floors === n} onClick={() => { setFloors(n); src && apply(src, realW, n, roofOn); }}>{n}층</button>)}</div></div>
      <label className="chk"><input type="checkbox" checked={roofOn} onChange={e => { const v = e.target.checked; setRoofOn(v); src && apply(src, realW, floors, v); }} />평지붕·파라펫 표시 <span className="muted">(끄면 내부 평면)</span></label>
      <div className="field"><label>잡선 제거 강도 <span>{['', '약', '보통', '강', '최강'][k]}</span></label>
        <input type="range" min="1" max="4" step="1" value={k} onChange={e => { const v = +e.target.value; setK(v); full(src, thr, v, realW, floors, roofOn); }} /></div>
      <div className="field"><label>선 인식 감도 <span>{thr}</span></label>
        <input type="range" min="50" max="200" step="5" value={thr} onChange={e => { const v = +e.target.value; setThr(v); full(src, v, k, realW, floors, roofOn); }} /></div>
    </div>
  );
}

function PlanPanel({ mode, setMode, tr, setTr, board, setBoard, autoSp, setAutoSp }) {
  return (
    <div className="card">
      <h2>평면도로 3D 만들기</h2>
      <div className="subtabs" role="tablist">
        <button role="tab" aria-selected={mode === 'trace'} onClick={() => setMode('trace')}>외곽선 따라 그리기<small>기본 · 모든 도면</small></button>
        <button role="tab" aria-selected={mode === 'auto'} onClick={() => setMode('auto')}>자동 벽체 인식<small>보조 · 진한 벽 도면</small></button>
      </div>
      <div hidden={mode !== 'trace'}><TracePanel tr={tr} set={setTr} board={board} setBoard={setBoard} /></div>
      <div hidden={mode !== 'auto'}><AutoPanel spec={autoSp} setSpec={setAutoSp} /></div>
    </div>
  );
}

/* ───────── 좌측: 모드 B (문장 + AI) ───────── */
const EXAMPLES = [
  '80평 땅에 3층 건물, 따뜻한 느낌에 통창이었으면 좋겠어',
  '50평 대지에 2층 모던 화이트 단독주택, 옥상 테라스가 있으면 좋겠어요',
  '120평 땅에 4층 상가주택, 1층은 카페로 쓰고 노출콘크리트 스타일',
];
const MODS = ['청하늘색으로 바꿔줘', '박공지붕에 지붕은 진회색', '한 층 더 올려줘', '통창 말고 일반 창으로', '우드 말고 벽돌로', '테라스는 빼줘'];
const Swatch = ({ c }) => <span className="sw" style={{ background: c }} />;

function SpecCard({ sp }) {
  if (!sp) return null;
  return (
    <div className="specs" aria-label="현재 설계 조건">
      <b>현재 설계 조건 — 다음 요청은 이 상태에서 이어서 수정됩니다</b>
      <span className="tagc">대지 {fmt(sp.land, 1)}평</span><span className="tagc">지상 {sp.floors}층</span>
      <span className="tagc"><Swatch c={sp.wallColor} />{MATS[sp.material].name} · {sp.colorName}</span>
      <span className="tagc">{glassName(sp.glass)}</span>
      <span className="tagc">{sp.roof !== 'flat' && <Swatch c={sp.roofColor} />}{ROOFS[sp.roof]}</span>
      {sp.terrace && <span className="tagc">테라스</span>}{sp.shop && <span className="tagc">1층 상가</span>}{sp.piloti && <span className="tagc">필로티 주차</span>}
    </div>
  );
}

/* AI 요청: 우리 Vercel 서버리스 함수(/api/generate)로만 보냅니다. 키는 서버에만 있습니다. */
async function askServer(prev, text, history) {
  const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const cur = { ...prev }; delete cur.kind; delete cur.fitKey;
    const r = await fetch('/api/generate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctrl.signal,
      body: JSON.stringify({ prev: cur, text, history: history.filter(m => m.role !== 's').slice(-6).map(m => ({ role: m.role, text: m.text })) }),
    });
    if (!r.ok) return null;
    const j = await r.json();
    return j && j.spec && typeof j.spec === 'object' ? j : null;
  } catch (e) { return null; } finally { clearTimeout(timer); }
}

function TextPanel({ spec, setSpec }) {
  const [msgs, setMsgs] = useState([]), [val, setVal] = useState(''), [busy, setBusy] = useState(false), [hist, setHist] = useState([]);
  const box_ = useRef(null), specRef = useRef(spec), msgRef = useRef(msgs);
  specRef.current = spec; msgRef.current = msgs;
  useEffect(() => { if (box_.current) box_.current.scrollTop = box_.current.scrollHeight; }, [msgs, busy]);

  const send = async (t, fresh, offline) => {
    const text = (t ?? val).trim(); if (!text || busy) return;
    const prev = fresh ? BASE : (specRef.current || BASE);
    const history = fresh ? [] : msgRef.current;
    setMsgs(m => [...(fresh ? [] : m), { role: 'u', text }]); setVal(''); setBusy(true);
    const res = offline ? null : await askServer(prev, text, history);
    let next, reply = '', eng;
    if (res) { next = sanitize(prev, res.spec); reply = typeof res.reply === 'string' ? res.reply.slice(0, 400) : ''; eng = 'AI 설계 보조'; }
    else { next = ruleParse(text, prev); eng = '자동 분석'; }
    next = { ...next, kind: 'text', fitKey: `${next.land}|${next.floors}|${next.terrace}|${next.roof}|${next.piloti}|${next.shop}` };
    const changes = diff(prev, next);
    if (!reply) reply = changes.length ? (fresh ? '요청하신 조건으로 3D 모델을 만들었어요.' : '말씀하신 부분만 수정했어요. 나머지 조건은 그대로 유지했습니다.') : '바꿀 내용을 찾지 못했어요. 예: "외벽을 베이지로", "박공지붕으로", "한 층 더 올려줘"';
    if (changes.length) setHist(h => [...(fresh ? [] : h), prev]);
    setSpec(next);
    setMsgs(m => [...m, { role: 'a', text: reply, changes, eng }]);
    setBusy(false);
  };
  const undo = () => { if (!hist.length) return; const p = hist[hist.length - 1]; setHist(h => h.slice(0, -1)); setSpec({ ...p, kind: 'text' }); setMsgs(m => [...m, { role: 's', text: '직전 상태로 되돌렸어요.' }]); };
  const reset = () => { setHist([]); setMsgs([]); setSpec({ ...BASE, kind: 'text', fitKey: 'base' }); };
  // 첫 화면은 서버 호출 없이 즉시 그립니다(방문자마다 AI 비용이 들지 않도록).
  useEffect(() => { if (!spec) send(EXAMPLES[0], true, true); }, []);

  return (
    <div className="card">
      <div className="chathead"><h2>문장으로 건물 만들기</h2></div>
      <p className="lead" style={{ marginTop: 4 }}>원하는 건물을 편하게 적어 주세요. "청하늘색으로 바꿔줘"처럼 이어서 말하면 그 부분만 수정됩니다.</p>
      <SpecCard sp={spec} />
      <div className="chat" ref={box_} aria-live="polite">
        {msgs.map((m, i) => m.role === 'u' ? <div key={i} className="msg u">{m.text}</div>
          : m.role === 's' ? <div key={i} className="msg s">{m.text}</div>
          : <div key={i} className="msg a"><span className="eb">{m.eng}</span>{m.text}
              {m.changes.length > 0 && <div className="tags">{m.changes.map((t, j) => <span key={j} className="tagc o">{t}</span>)}</div>}</div>)}
        {busy && <div className="msg a"><span className="eb">AI 설계 보조</span><span className="dots">설계 조건을 분석하고 있어요</span></div>}
      </div>
      <form className="compose" onSubmit={e => { e.preventDefault(); send(); }}>
        <textarea value={val} onChange={e => setVal(e.target.value)} placeholder='예: "청하늘색으로 바꿔줘", "3층에 통창으로 수정해 줘"' disabled={busy} maxLength={500}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }} aria-label="건물 설명 또는 수정 요청 입력" />
        <button className="btn" type="submit" disabled={busy}>전송</button>
      </form>
      <div className="tools"><button className="btn sec" onClick={undo} disabled={!hist.length || busy}>되돌리기</button><button className="btn sec" onClick={reset} disabled={busy}>새로 시작</button></div>
      <div className="lbl" style={{ marginTop: 12 }}>이어서 수정해 보기</div>
      <div className="mods">{MODS.map(x => <button key={x} className="mod" disabled={busy} onClick={() => send(x)}>{x}</button>)}</div>
      <div className="lbl" style={{ marginTop: 12 }}>새 건물 예시 <span>현재 조건을 초기화하고 생성</span></div>
      <div className="exs">{EXAMPLES.map(x => <button key={x} className="ex" disabled={busy} onClick={() => send(x, true)}>{x}</button>)}</div>
    </div>
  );
}

/* ───────── 예상 건축비 패널 ───────── */
function EstPanel({ spec, tier, setTier }) {
  const e = estimate(spec, tier);
  return (
    <div className="estp">
      <div className="esth"><h3>예상 건축비 <span>마감 수준을 선택하세요</span></h3></div>
      <div className="tiers" role="group" aria-label="마감 수준">
        {Object.entries(TIERS).map(([k, t]) => <button key={k} aria-pressed={tier === k} onClick={() => setTier(k)}><b>{t.name}</b><span>평당 {fmt(t.unit)}만</span></button>)}
      </div>
      {e ? <>
        <div className="estbig">
          <div className="big">약 {fmt(e.cost, 1)}<small>억 원</small></div>
          <div className="rng">{fmt(e.low, 1)} ~ {fmt(e.high, 1)}억 원 · {TIERS[tier].desc}</div>
        </div>
        <dl className="estdl">
          {e.landM2 && <><dt>대지면적</dt><dd>{fmt(e.landM2, 1)}㎡ · {fmt(e.landM2 / PY, 1)}평</dd></>}
          <dt>건축면적</dt><dd>{fmt(e.building, 1)}㎡ · {fmt(e.building / PY, 1)}평</dd>
          <dt>연면적</dt><dd>{fmt(e.gfa, 1)}㎡ · {fmt(e.gfaPy, 1)}평</dd>
          {e.far && <><dt>건폐율 / 용적률</dt><dd>{fmt(e.bcr)}% / {fmt(e.far)}%</dd></>}
        </dl>
        {e.far > 250 && <div className="warn">용적률 {fmt(e.far)}% — 제2종 일반주거지역(조례 250% 내외) 기준 초과 가능성이 있어 검토가 필요합니다.</div>}
        <p className="note">연면적 × 평당 단가 기준의 순수 건축공사비 추정입니다. 설계·인허가·토목·인테리어·부가세는 별도이며, 실제 금액은 대지 조건과 사양에 따라 달라집니다.</p>
      </> : <p className="note">도면 위에 외곽선을 완성하면 면적과 건축비가 계산됩니다.</p>}
    </div>
  );
}

/* ───────── 우측: 상담 신청 ───────── */
const SumDL = ({ rows }) => <dl>{rows.map(([a, b]) => { const h = String(b).match(/#[0-9A-F]{6}/i); return <React.Fragment key={a}><dt>{a}</dt><dd>{h && <Swatch c={h[0]} />}{b}</dd></React.Fragment>; })}</dl>;
function designText(rows, f) {
  const pick = k => (rows.find(r => r[0] === k) || [])[1];
  const line = [pick('대지면적') && `대지 ${pick('대지면적')}`, pick('층수'), pick('외장'), pick('창호'), pick('지붕')].filter(Boolean).join(' / ');
  return ['[대상건축사사무소 3D 설계안 상담 문의]',
    line || `${pick('층수') || ''} / ${pick('생성 방식') || ''}`,
    pick('건축면적') || pick('건축면적(추정)') ? `건축면적: ${pick('건축면적') || pick('건축면적(추정)')}` : null,
    `연면적: ${pick('연면적')}`,
    `예상 건축비: ${pick('예상 건축비')} — ${pick('마감 수준')}`,
    f && f.name ? `성함: ${f.name}${f.phone ? ' / ' + f.phone : ''}` : null,
    f && f.addr ? `대지 위치: ${f.addr}` : null,
    'AI 건축 3D 시뮬레이터로 만든 초기 구상안입니다. 상담 부탁드립니다.'].filter(Boolean).join('\n');
}
function QuickContact({ rows, form }) {
  const [msg, setMsg] = useState(''), [manual, setManual] = useState('');
  const copy = () => {
    const t = designText(rows, form); setManual('');
    const fail = () => { setManual(t); setMsg('자동 복사가 막혀 있어요. 아래 내용을 길게 눌러 복사해 주세요.'); };
    try { navigator.clipboard.writeText(t).then(() => setMsg('설계안을 복사했어요. 카카오톡이나 문자에 붙여넣어 031-623-8837로 보내 주세요.'), fail); } catch (e) { fail(); }
  };
  return (
    <div className="quick">
      <a className="btn callbtn" href="tel:0316238837">031-623-8837 바로 전화 상담</a>
      <button type="button" className="btn kakao" onClick={copy}>내 설계안 복사 후 카톡/문자 문의</button>
      {msg && <p className="qmsg" role="status">{msg}</p>}
      {manual && <textarea className="manual" readOnly value={manual} onFocus={e => e.target.select()} rows={7} />}
      <p className="qhint">경기도 안양시 동안구 동편로 188 네이쳐빌딩</p>
    </div>
  );
}
const PURPOSES = ['단독·전원주택', '상가주택(1층 근린생활)', '다가구·다세대주택', '근린생활시설', '업무시설(사옥)', '기타·미정'];
const guessPurpose = sp => { if (!sp || sp.kind !== 'text') return PURPOSES[0]; const u = sp.use || ''; return u.includes('상가') ? PURPOSES[1] : u.includes('다가구') ? PURPOSES[2] : u.includes('업무') ? PURPOSES[4] : PURPOSES[0]; };

/* Firestore에 저장할 3D 시뮬레이션 스펙(평수·층수·스타일·마감 수준·예상 건축비 등) */
function simPayload(spec, tier) {
  const e = estimate(spec, tier); if (!spec || !e) return null;
  const mode = spec.kind === 'text' ? '문장 입력' : spec.kind === 'mass' ? '도면 외곽선 트레이싱' : '도면 자동 벽체 인식';
  const style = spec.kind === 'text' ? `${MATS[spec.material].name} · ${spec.colorName} ${spec.wallColor} / ${glassName(spec.glass)} / ${ROOFS[spec.roof]}` : '매스 모형(외장 미정)';
  const r1 = n => Math.round(n * 10) / 10;
  return {
    mode, floors: spec.floors, style,
    landPyeong: spec.kind === 'text' ? r1(spec.land) : null,
    landM2: e.landM2 ? r1(e.landM2) : null,
    buildingAreaM2: r1(e.building), grossFloorAreaM2: r1(e.gfa), grossFloorAreaPyeong: r1(e.gfaPy),
    finishTier: TIERS[tier].name, unitPricePerPyeong: TIERS[tier].unit * 10000,
    estimatedCostEok: r1(e.cost), estimatedCostRange: `${r1(e.low)}~${r1(e.high)}억 원`,
    detail: summary(spec, tier).map(([label, value]) => ({ label, value: String(value) })),
  };
}

function ConsultPanel({ spec, tier }) {
  const [f, setF] = useState({ name: '', phone: '', addr: '', purpose: '', memo: '' });
  const [agree, setAgree] = useState(false), [errs, setErrs] = useState({}), [done, setDone] = useState(null), [sending, setSending] = useState(false), [fail, setFail] = useState('');
  const rows = summary(spec, tier);
  const purpose = f.purpose || guessPurpose(spec);
  const set = k => e => { let v = e.target.value;
    if (k === 'phone') { const d = v.replace(/\D/g, '').slice(0, 11); v = d.length < 4 ? d : d.length < 8 ? `${d.slice(0, 3)}-${d.slice(3)}` : `${d.slice(0, 3)}-${d.slice(3, d.length - 4)}-${d.slice(-4)}`; }
    setF({ ...f, [k]: v }); };
  const submit = async e => {
    e.preventDefault(); if (sending) return; const er = {};
    if (!f.name.trim()) er.name = '성함을 입력해 주세요.';
    if (!/^0\d{1,2}-\d{3,4}-\d{4}$/.test(f.phone)) er.phone = '연락처를 정확히 입력해 주세요.';
    if (!agree) er.agree = '개인정보 수집·이용에 동의해 주세요.';
    setErrs(er); setFail(''); if (Object.keys(er).length) return;
    const now = new Date(), ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const receiptNo = `DS-${ymd}-${String(Math.floor(Math.random() * 9000) + 1000)}`;
    setSending(true);
    try {
      await submitInquiry({
        receiptNo, name: f.name.trim().slice(0, 40), phone: f.phone, address: f.addr.trim().slice(0, 120),
        purpose, memo: f.memo.trim().slice(0, 1000), privacyAgreed: true,
        simulation: simPayload(spec, tier), source: 'ai-3d-simulator',
      });
      setDone({ no: receiptNo, at: now.toLocaleString('ko-KR'), ...f, purpose, rows });
    } catch (err) {
      console.error(err);
      setFail('접수 중 오류가 발생했습니다. 잠시 후 다시 시도하시거나 031-623-8837로 전화 주세요.');
    } finally { setSending(false); }
  };
  if (done) return (
    <div className="card done">
      <div className="ok" aria-hidden="true">✓</div>
      <h2>사전검토 신청이 접수되었습니다</h2>
      <div className="no">접수번호 {done.no}</div>
      <p className="lead">{done.name}님, 남겨주신 연락처({done.phone})로 대상건축사사무소 건축사가 연락드릴 예정입니다.</p>
      <div className="sum"><h4>신청 정보</h4><dl>
        <dt>대지 위치</dt><dd>{done.addr || '미기재'}</dd><dt>희망 용도</dt><dd>{done.purpose}</dd><dt>접수 시각</dt><dd>{done.at}</dd>
        {done.memo && <><dt>요청사항</dt><dd>{done.memo}</dd></>}</dl></div>
      <div className="sum"><h4>함께 접수된 3D 조건</h4><SumDL rows={done.rows} /></div>
      <QuickContact rows={done.rows} form={done} />
      <button className="btn sec" style={{ width: '100%', marginTop: 8 }} onClick={() => setDone(null)}>새로 작성</button>
    </div>
  );
  return (
    <form className="card form" onSubmit={submit} noValidate>
      <h2>무료 건축 상담 신청</h2>
      <p className="lead">지금 만든 3D 조건이 신청서에 자동으로 첨부됩니다.</p>
      <div className="field"><label htmlFor="cn">성함 <span className="req">필수</span></label><input id="cn" value={f.name} onChange={set('name')} autoComplete="name" maxLength={40} />{errs.name && <p className="err">{errs.name}</p>}</div>
      <div className="field"><label htmlFor="cp">연락처 <span className="req">필수</span></label><input id="cp" value={f.phone} onChange={set('phone')} inputMode="tel" placeholder="010-0000-0000" autoComplete="tel" />{errs.phone && <p className="err">{errs.phone}</p>}</div>
      <div className="field"><label htmlFor="ca">대지 위치(지번)</label><input id="ca" value={f.addr} onChange={set('addr')} placeholder="예: 안양시 동안구 ○○동 123-4" maxLength={120} /></div>
      <div className="field"><label htmlFor="cu">희망 용도</label>
        <select id="cu" className="sel" value={purpose} onChange={set('purpose')}>{PURPOSES.map(p => <option key={p} value={p}>{p}</option>)}</select></div>
      <div className="field"><label htmlFor="cm">추가 요청사항</label><textarea id="cm" value={f.memo} onChange={set('memo')} placeholder="예산, 입주 희망 시기, 가족 구성 등" maxLength={1000} /></div>
      <div className="sum"><h4>자동 첨부되는 3D 조건</h4><SumDL rows={rows} /></div>
      <label className="agree"><input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} />상담 목적의 개인정보(성함·연락처·대지 위치) 수집·이용에 동의합니다.</label>
      {errs.agree && <p className="err" style={{ marginTop: -6, marginBottom: 8 }}>{errs.agree}</p>}
      <button className="btn pri" type="submit" disabled={sending}>{sending ? '접수 중…' : '대상건축사사무소 무료 사전검토 신청하기'}</button>
      {fail && <p className="err" role="alert" style={{ marginTop: 8 }}>{fail}</p>}
      <div className="or"><span>급하시면 바로 연락하세요</span></div>
      <QuickContact rows={rows} form={f} />
    </form>
  );
}

const Logo = ({ inv, kr }) => <div className={'logo' + (inv ? ' inv' : '')} aria-label="DAESANG Architects & Planners"><span className="ds">DAESANG</span><span className="sub">{kr ? '(주) 대상건축사사무소' : 'Architects & Planners'}</span></div>;

function App() {
  const [tab, setTab] = useState('text');
  const [textSp, setTextSp] = useState(null), [autoSp, setAutoSp] = useState(null);
  const [planMode, setPlanMode] = useState('trace');
  const [tr, setTrRaw] = useState(() => ({ img: makeSample('house'), pts: [], closed: false, ortho: true, realW: 14, floors: 2, ver: 0 }));
  const setTr = patch => setTrRaw(t => ({ ...t, ...patch }));
  const [board, setBoard] = useState(true);
  const [tier, setTier] = useState('standard');
  const [hour, setHour] = useState(14), [season, setSeason] = useState('equinox');
  const massSp = useMemo(() => tr.closed && tr.pts.length >= 3 ? massSpec(tr) : null, [tr.pts, tr.closed, tr.realW, tr.floors, tr.ver, tr.img]);
  const spec = tab === 'text' ? textSp : planMode === 'trace' ? massSp : autoSp;
  const showBoard = tab === 'plan' && planMode === 'trace' && (board || !tr.closed);
  const sun = useMemo(() => sunPos(hour, season), [hour, season]);
  const ok = true;
  return (
    <>
      <header>
        <div className="hd">
          <Logo />
          <h1>AI 건축 3D 시뮬레이터<small>도면 한 장, 문장 한 줄로 내 건물을 미리 봅니다</small></h1>
          <div className="call"><span>상담문의</span><a href="tel:0316238837">031-623-8837</a></div>
        </div>
        <div className="tabs" role="tablist">
          <button className="tab" role="tab" aria-selected={tab === 'text'} onClick={() => setTab('text')}><b>B</b>텍스트로 건물 만들기</button>
          <button className="tab" role="tab" aria-selected={tab === 'plan'} onClick={() => setTab('plan')}><b>A</b>도면 이미지 업로드</button>
        </div>
      </header>
      <main>
        <section className="side-l">
          <div hidden={tab !== 'text'}><TextPanel spec={textSp} setSpec={setTextSp} /></div>
          <div hidden={tab !== 'plan'}><PlanPanel mode={planMode} setMode={setPlanMode} tr={tr} setTr={setTr} board={board} setBoard={setBoard} autoSp={autoSp} setAutoSp={setAutoSp} /></div>
        </section>
        <section className="center">
          <div className="viewer">
            <div className="stage">
              {ok ? <Viewer spec={spec} sun={sun} /> : <div className="loading">3D 엔진을 불러오지 못했습니다. 새로고침해 주세요.</div>}
              {showBoard && <TraceBoard tr={tr} set={setTr} onClose={() => setBoard(false)} />}
            </div>
            <EstPanel spec={spec} tier={tier} setTier={setTier} />
            <div className="sunbar">
              <div>
                <div className="lbl">시간대별 일조량 · 그림자 시뮬레이션 <span>{SEASON_KO[season]}</span></div>
                <input type="range" min="5" max="20" step="0.25" value={hour} onChange={e => setHour(+e.target.value)} aria-label="시각" />
              </div>
              <div className="t">{hm(hour)}</div>
              <div className="meta" style={{ alignItems: 'center' }}>
                <div className="seg" style={{ minWidth: 240 }}>{Object.keys(SEASON_KO).map(k => <button key={k} aria-pressed={season === k} onClick={() => setSeason(k)}>{SEASON_KO[k]}</button>)}</div>
                <span>태양 고도 <b>{sun.altDeg > 0 ? fmt(sun.altDeg, 1) + '°' : '일몰 후'}</b></span>
                <span>방위 <b>{dirKo(sun.azDeg)}</b></span>
                <span>일출 {hm(sun.rise)} · 남중 {hm(sun.noon)} · 일몰 {hm(sun.set)}</span>
              </div>
            </div>
            <p className="disc"><i>!</i>본 시뮬레이션은 초기 구상용 3D 모델입니다. 실제 법규(건폐율·용적률·일조권) 검토 및 정밀 설계는 건축사 상담이 필요합니다.</p>
          </div>
        </section>
        <section className="side-r"><ConsultPanel spec={spec} tier={tier} /></section>
      </main>
      <footer>
        <div className="ft">
          <Logo inv kr />
          <dl>
            <dt>상담문의</dt><dd><a href="tel:0316238837">031-623-8837</a></dd>
            <dt>위치</dt><dd>경기도 안양시 동안구 동편로 188 네이쳐빌딩</dd>
          </dl>
          <div className="cp">© (주) 대상건축사사무소 DAESANG Architects &amp; Planners</div>
        </div>
      </footer>
    </>
  );
}

export default App;
