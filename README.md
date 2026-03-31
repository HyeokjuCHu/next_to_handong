# 한동곁

한동대학교 학생들을 위한 웹 MVP입니다.  
`HGU Delivery Mate`와 `HGU Re-Share` 아이디어를 합쳐서,

- 배달 파티 모집과 배달비 절감
- 식재료 / 생필품 소량 나눔
- Silent / Social 선택
- 학교 계정 로그인 기반 글쓰기
- Firestore 실시간 동기화
- Kakao Maps 기반 수령 위치 표시

를 하나의 화면 흐름으로 보여주도록 구성했습니다.

## 실행 방법

```bash
npm install
npm run dev
```

배포용 빌드는 아래 명령으로 확인할 수 있습니다.

```bash
npm run build
```

## 현재 포함된 것

- React + Vite + TypeScript 기반 웹 프로젝트
- Firebase Authentication 연동
- Cloud Firestore 실시간 피드 연동
- Google 로그인 버튼 및 학교 이메일 도메인 검사
- 실제 Kakao Maps SDK 로딩
- 배달 동행 / 리쉐어 보드 전환
- Firestore Rules / 인덱스 초안

## 환경변수

`.env.example`를 참고해서 `.env`를 만들면 됩니다.

```bash
cp .env.example .env
```

현재 프로젝트는 `VITE_FIREBASE_*`, `VITE_KAKAO_JAVASCRIPT_KEY`를 읽습니다.

## Firebase 콘솔에서 해야 할 것

1. Authentication에서 `Google` 로그인을 활성화합니다.
2. `localhost`와 실제 배포 도메인을 Authorized domains에 추가합니다.
3. Firestore를 생성합니다.
4. 이 저장소의 [firestore.rules](/Users/hyeokjukwon/Desktop/HGU/2026-1/소공/team_project/firestore.rules)와 [firestore.indexes.json](/Users/hyeokjukwon/Desktop/HGU/2026-1/소공/team_project/firestore.indexes.json)을 기준으로 배포합니다.

CLI를 쓸 경우에는 프로젝트 루트에서 아래처럼 배포할 수 있습니다.

```bash
firebase deploy --only firestore --project next-to-handong
```

## Firebase Hosting 배포

이 프로젝트는 Firebase Hosting용으로 이미 설정되어 있습니다.

처음 한 번은 Firebase CLI 로그인이 필요합니다.

```bash
npm run firebase:login
```

정적 웹 배포만 먼저 하고 싶으면:

```bash
npm run deploy:hosting
```

Hosting과 Firestore 규칙/인덱스를 함께 반영하고 싶으면:

```bash
npm run deploy
```

배포가 끝나면 CLI가 Firebase Hosting URL을 출력합니다.  
보통 `https://next-to-handong.web.app` 또는 `https://next-to-handong.firebaseapp.com` 형태입니다.

배포 전에 같이 확인할 것:

1. Firebase Authentication Authorized domains에 실제 배포 도메인이 포함되어 있는지
2. Kakao Developers에 `https://next-to-handong.web.app`와 실제 커스텀 도메인이 등록되어 있는지
3. Firestore Rules가 이 저장소의 [firestore.rules](/Users/hyeokjukwon/Desktop/HGU/2026-1/소공/team_project/firestore.rules)와 일치하는지

## Kakao 개발자 콘솔에서 해야 할 것

1. JavaScript 키가 발급된 앱인지 확인합니다.
2. `localhost:5173`와 실제 배포 도메인을 플랫폼에 등록합니다.
3. 등록이 끝나면 페이지에서 실제 Kakao Maps 지도가 렌더링됩니다.

## 폴더 구조

```text
src/
  App.tsx
  App.css
  components/
    CampusMap.tsx
  data/
    campusData.ts
  lib/
    firebase.ts
    firestore.ts
    kakao.ts
    platform.ts
```

## 다음 추천 단계

1. Firestore Rules를 실제 프로젝트에 배포
2. 파티 참여 / 채팅 / 후기 컬렉션 추가
3. 학교 이메일 강제를 Cloud Functions 또는 Admin 기반 커스텀 클레임으로 강화
4. 이후 모바일 앱 전환 시 같은 데이터 모델 재사용
