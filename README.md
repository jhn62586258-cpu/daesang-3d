# DAESANG AI 건축 3D 시뮬레이터

(주)대상건축사사무소 · 상담문의 031-623-8837 · 경기도 안양시 동안구 동편로 188 네이쳐빌딩

Vite + React + Tailwind + Three.js 프런트엔드, Vercel 서버리스 함수(`/api/generate`, Gemini), Firebase Firestore(상담 접수)로 구성됩니다.

## 폴더 구조

```
api/generate.js        Vercel 서버리스 함수 — GEMINI_API_KEY로 gemini-2.5-flash 호출
src/main.jsx           React 진입점
src/App.jsx            화면 전체(문장 입력, 도면 트레이싱, 견적, 상담 패널)
src/lib/core.js        문장 분석(키 없을 때 폴백), 스펙 검증, 면적·건축비, 태양 위치
src/lib/scene.js       Three.js 건물·대지 모형, 도면 자동 인식, 카메라 자동 줌인
src/firebase.js        Firestore 연결, inquiries 컬렉션 저장
src/index.css          디자인(CI 컬러 #FD9F28 / #787878 / #FFFFFF, Noto Sans KR)
firestore.rules        Firestore 보안 규칙(신규 작성만 허용)
.env.example           환경변수 목록
```

## 1. 로컬 실행

```bash
npm install
cp .env.example .env.local   # 값 채우기
npm run dev                  # http://localhost:5173
```

`npm run dev`에서는 `/api/generate`가 없으므로 문장 분석은 자동으로 기본 분석(폴백)으로 작동합니다.
AI까지 로컬에서 시험하려면 Vercel CLI로 실행하세요: `npm i -g vercel` → `vercel dev`.

## 2. Firebase 준비

1. Firebase 콘솔에서 프로젝트 생성 → **Firestore Database** 만들기(프로덕션 모드, 리전 `asia-northeast3` 서울 권장).
2. 프로젝트 설정 → 내 앱 → **웹 앱 추가** → 표시되는 `firebaseConfig` 값을 `VITE_FIREBASE_*` 환경변수에 넣습니다.
3. Firestore → **규칙** 탭에 `firestore.rules` 내용을 붙여넣고 게시합니다.
   (방문자는 신청서 "작성"만 가능하고, 조회·수정·삭제는 막힙니다.)
4. 접수 내역은 Firebase 콘솔 → Firestore → `inquiries` 컬렉션에서 확인합니다. `createdAt`(서버 시각) 기준으로 정렬하세요.

## 3. GitHub → Vercel 배포

```bash
git init && git add . && git commit -m "DAESANG AI 3D simulator"
git branch -M main
git remote add origin https://github.com/<계정>/daesang-ai-3d-simulator.git
git push -u origin main
```

1. vercel.com → **Add New Project** → 위 저장소 Import (Framework: **Vite** 자동 인식, Build `npm run build`, Output `dist`).
2. **Settings → Environment Variables**에 다음을 등록:
   - `GEMINI_API_KEY` (Google AI Studio에서 발급, 서버 전용)
   - `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID`
3. **Deploy**. 환경변수를 바꾼 뒤에는 반드시 **Redeploy** 해야 반영됩니다(`VITE_` 값은 빌드할 때 코드에 들어갑니다).

## 4. 운영 체크리스트

- **Gemini 키는 `GEMINI_API_KEY`(접두사 없음)로만** 등록하세요. `VITE_`를 붙이면 브라우저에 노출됩니다.
- Google AI Studio / Cloud 콘솔에서 Gemini API **사용량 한도·예산 알림**을 설정하세요. `/api/generate`는 누구나 호출할 수 있는 공개 주소입니다.
- 스팸 신청을 막으려면 Firebase **App Check(reCAPTCHA Enterprise)** 적용을 권장합니다.
- Firebase 웹 `apiKey`는 공개되어도 되는 식별자이며, 실제 보호는 `firestore.rules`가 담당합니다.
- 서버 함수가 실패하거나 시간 초과(15초)되면 화면은 자동으로 기본 분석으로 계속 작동합니다.
