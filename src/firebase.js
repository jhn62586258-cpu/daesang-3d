/**
 * Firebase Firestore 연결 — 상담 신청을 `inquiries` 컬렉션에 저장합니다.
 * 설정값은 Vite 환경변수(VITE_FIREBASE_...)로만 주입합니다. (.env.local 또는 Vercel 환경변수)
 */
import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, collection, addDoc, serverTimestamp } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const firebaseReady = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId);

let db = null;
if (firebaseReady) {
  const app = getApps()[0] || initializeApp(firebaseConfig);
  db = getFirestore(app);
} else {
  console.warn('[firebase] VITE_FIREBASE_* 환경변수가 설정되지 않아 상담 신청을 저장할 수 없습니다.');
}

/**
 * 상담 신청 1건 저장. 접수 시간은 서버 시각(serverTimestamp)으로 기록됩니다.
 * @returns {Promise<string>} 생성된 문서 ID
 */
export async function submitInquiry(data) {
  if (!db) throw new Error('FIREBASE_NOT_CONFIGURED');
  const ref = await addDoc(collection(db, 'inquiries'), {
    ...data,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}
