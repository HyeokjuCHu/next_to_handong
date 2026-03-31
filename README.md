# 한동곁

한동대학교 학생들을 위한 웹 MVP입니다.  
`HGU Delivery Mate`와 `HGU Re-Share` 아이디어를 합쳐서,

- 배달 파티 모집과 배달비 절감
- 식재료 / 생필품 소량 나눔
- Silent / Social 선택
- 지도 기반 수령 위치 확인
- 매너 온도 기반 신뢰 경험

을 하나의 화면 흐름으로 보여주도록 구성했습니다.

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
- 한동대 캠퍼스용 컨셉 UI
- 배달 동행 / 리쉐어 보드 전환
- 지도 스타일 캠퍼스 보드
- 선택 카드 상세 패널
- 브라우저 상태 기반 빠른 글 작성
- Firebase / Kakao Maps 연동 준비 상태 표시

## 환경변수

`.env.example`를 참고해서 `.env`를 만들면 됩니다.

```bash
cp .env.example .env
```

현재 UI는 환경변수가 없어도 실행되며, 환경변수를 채우면 이후 실제 연동 단계로 바로 이어갈 수 있도록 준비해두었습니다.

## 폴더 구조

```text
src/
  App.tsx
  App.css
  data/
    campusData.ts
  lib/
    platform.ts
```

## 다음 추천 단계

1. Firebase Authentication + Firestore/Realtime Database 연결
2. 실제 Kakao Maps SDK 로딩 및 캠퍼스 핀 렌더링
3. 사용자별 프로필 / 매너 온도 업데이트 로직 추가
4. 이후 모바일 앱 전환 시 같은 데이터 모델 재사용
