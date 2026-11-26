const MODEL = 'gemini-3-flash-preview';
const HOST = 'generativelanguage.googleapis.com';
const ENDPOINT = 'https://' + HOST + '/v1beta/models/' + MODEL + ':generateContent';

const SYSTEM_PROMPT = `당신은 (주)대상건축사사무소 'AI 건축 3D 시뮬레이터'의 설계 보조 AI입니다. 고객의 한국어 요청을 읽고 현재 건물 스펙(JSON)을 수정합니다.
규칙:
1) 요청에서 언급한 항목만 바꾸고, 언급하지 않은 항목은 현재 값을 그대로 유지합니다(이어서 수정하기).
2) "~말고", "~제외하고", "~빼고", "~대신", "~없이"는 해당 항목을 배제한다는 뜻입니다.
3) 색상은 정확한 Hex(#RRGGBB)로 지정합니다. 예: 청하늘색 #87CEEB, 아이보리 #F2EAD8, 네이비 #1F3A5F, 어두운 노란색 #C49A2A.
4) "3층에 통창으로"처럼 층수와 함께 말하면 floors를 그 값으로 바꿉니다. "1층은 카페"는 floors가 아니라 shop=true 입니다.
5) 색만 말하고 재질을 말하지 않으면 material은 paint(도장)로 하되, 갈색·브라운은 wood, 블랙은 zinc가 자연스럽습니다.
6) 건축과 무관한 요청에는 스펙을 바꾸지 말고 reply로 정중히 안내합니다.
스펙 필드:
- land: 대지면적(평, 20~600)  - floors: 지상 층수(1~7)
- material: "paint" | "wood" | "brick" | "concrete" | "zinc" | "stone"
- wallColor: 외벽 색 Hex   - colorName: 색 이름(한국어, 짧게)
- glass: 창 면적 비율(0.1~0.9, 통창은 0.7 이상, 일반 0.35~0.45)
- roof: "flat" | "gable"(박공) | "hip"(모임) | "shed"(외쪽 경사)   - roofColor: 지붕 색 Hex
- terrace, shop(1층 상가), piloti(1층 필로티 주차): true/false   - use: 용도(한국어 짧게)
출력은 JSON 하나만: {"spec":{모든 필드},"reply":"고객에게 건네는 친절한 1~2문장 한국어 답변"}`;

const SPEC_KEYS = ['land', 'floors', 'material', 'wallColor', 'colorName', 'glass', 'roof', 'roofColor', 'terrace', 'shop', 'piloti', 'use'];
const MATERIALS = ['paint', 'wood', 'brick', 'concrete', 'zinc', 'stone'];
const ROOFS = ['flat', 'gable', 'hip', 'shed'];

function isValidHex(str) {
  if (typeof str !== 'string') return false;
  const clean = str.trim().replace('#', '');
  if (clean.length !== 6) return false;
  for (let i = 0; i < 6; i++) {
    const ch = clean[i].toLowerCase();
    if (!((ch >= '0' && ch <= '9') || (ch >= 'a' && ch <= 'f'))) return false;
  }
  return true;
}

function pickSpec(o) {
  const out = {};
  if (!o || typeof o !== 'object') return out;
  for (const k of SPEC_KEYS) {
    const v = o[k];
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
    else if (typeof v === 'boolean') out[k] = v;
    else if (typeof v === 'string') out[k] = v.slice(0, 40);
  }
  return out;
}

function cleanSpec(o) {
  const s = pickSpec(o), out = {};
  if (typeof s.land === 'number') out.land = Math.min(600, Math.max(20, s.land));
  if (typeof s.floors === 'number') out.floors = Math.min(7, Math.max(1, Math.round(s.floors)));
  if (MATERIALS.includes(s.material)) out.material = s.material;
  if (isValidHex(s.wallColor)) out.wallColor = '#' + s.wallColor.trim().replace('#', '').toUpperCase();
  if (typeof s.colorName === 'string') out.colorName = s.colorName.slice(0, 16);
  if (typeof s.glass === 'number') out.glass = Math.min(0.9, Math.max(0.1, s.glass));
  if (ROOFS.includes(s.roof)) out.roof = s.roof;
  if (isValidHex(s.roofColor)) out.roofColor = '#' + s.roofColor.trim().replace('#', '').toUpperCase();
  for (const k of ['terrace', 'shop', 'piloti']) if (typeof s[k] === 'boolean') out[k] = s[k];
  if (typeof s.use === 'string' && s.use.trim()) out.use = s.use.trim().slice(0, 24);
  return out;
}

function parseJSON(text) {
  if (!text) return null;
  const s = String(text).replace(/```(?:json)?/g, '');
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(s.slice(a, b + 1)); } catch { return null; }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }
  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(500).json({ error: 'GEMINI_API_KEY is not configured' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = null; } }
  const text = String(body?.text ?? '').trim().slice(0, 500);
  if (!text) return res.status(400).json({ error: 'text is required' });
  const prev = pickSpec(body?.prev);
  const history = Array.isArray(body?.history)
    ? body.history.slice(-6).map(m => `${m?.role === 'u' ? '고객' : 'AI'}: ${String(m?.text ?? '').slice(0, 300)}`).join('\n')
    : '';
  const prompt = `${history ? `이전 대화:\n${history}\n\n` : ''}현재 건물 스펙(JSON):\n${JSON.stringify(prev)}\n\n새 요청: ${text}`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const r = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      signal: ctrl.signal,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, responseMimeType: 'application/json' },
      }),
    });
    if (!r.ok) {
      const detail = await r.text().catch(() => '');
      console.error('Gemini error', r.status, detail.slice(0, 500));
      return res.status(502).json({ error: 'upstream_error', status: r.status, detail: detail.slice(0, 200) });
    }
    const data = await r.json();
    const candidates = data && data.candidates ? data.candidates : [];
    const first = candidates.length > 0 ? candidates[0] : null;
    const parts = first && first.content && first.content.parts ? first.content.parts : [];
    const parsed = parseJSON(parts.map(p => p.text || '').join(''));
    if (!parsed || typeof parsed.spec !== 'object') return res.status(502).json({ error: 'bad_model_output' });
    const reply = typeof parsed.reply === 'string' ? parsed.reply.slice(0, 400) : '';
    return res.status(200).json({ spec: { ...prev, ...cleanSpec(parsed.spec) }, reply });
  } catch (e) {
    console.error('generate failed', e?.name, e?.message);
    return res.status(504).json({ error: e?.name === 'AbortError' ? 'timeout' : 'failed' });
  } finally {
    clearTimeout(timer);
  }
}
