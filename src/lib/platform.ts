function countReadyFields(config: Record<string, string | undefined>) {
  const values = Object.values(config)
  const filled = values.filter(Boolean).length

  return {
    filled,
    total: values.length,
  }
}

const firebaseEnv = {
  VITE_FIREBASE_API_KEY: import.meta.env.VITE_FIREBASE_API_KEY,
  VITE_FIREBASE_AUTH_DOMAIN: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  VITE_FIREBASE_PROJECT_ID: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  VITE_FIREBASE_STORAGE_BUCKET: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  VITE_FIREBASE_MESSAGING_SENDER_ID: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  VITE_FIREBASE_APP_ID: import.meta.env.VITE_FIREBASE_APP_ID,
}

const kakaoEnv = {
  VITE_KAKAO_JAVASCRIPT_KEY: import.meta.env.VITE_KAKAO_JAVASCRIPT_KEY,
}

const firebaseStatus = countReadyFields(firebaseEnv)
const kakaoStatus = countReadyFields(kakaoEnv)

export const platformReadiness = [
  {
    id: 'firebase',
    title: 'Firebase 실시간 구조',
    description:
      '채팅, 실시간 동기화, 사용자 인증, 푸시 알림까지 확장하기 위한 환경변수 슬롯을 준비해두었습니다.',
    ready: firebaseStatus.filled === firebaseStatus.total,
    filled: firebaseStatus.filled,
    total: firebaseStatus.total,
    missing: Object.entries(firebaseEnv)
      .filter(([, value]) => !value)
      .map(([key]) => key),
  },
  {
    id: 'kakao',
    title: 'Kakao Maps 연동 슬롯',
    description:
      '캠퍼스 내 수령 위치를 실제 지도 위에서 보여주기 위한 Kakao JavaScript 키를 받을 자리를 준비했습니다.',
    ready: kakaoStatus.filled === kakaoStatus.total,
    filled: kakaoStatus.filled,
    total: kakaoStatus.total,
    missing: Object.entries(kakaoEnv)
      .filter(([, value]) => !value)
      .map(([key]) => key),
  },
] as const
