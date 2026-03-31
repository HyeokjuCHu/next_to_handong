export type ViewMode = 'delivery' | 'share'
export type DeliveryMood = 'silent' | 'social'
export type ShareCategory = 'ingredient' | 'supply'
export type DeliveryFilter = 'all' | DeliveryMood
export type ShareFilter = 'all' | ShareCategory

export interface DeliveryParty {
  kind: 'delivery'
  id: string
  title: string
  restaurant: string
  meetingPoint: string
  building: string
  x: number
  y: number
  mood: DeliveryMood
  eta: string
  feeSavings: string
  members: number
  capacity: number
  host: string
  hostTrust: number
  timeLabel: string
  tags: string[]
  chatPreview: string[]
  summary: string
  pickupSlot: string
}

export interface SharePost {
  kind: 'share'
  id: string
  title: string
  category: ShareCategory
  location: string
  building: string
  x: number
  y: number
  quantity: string
  pickupWindow: string
  trust: number
  badges: string[]
  timeLabel: string
  note: string
  owner: string
  distance: string
}

export type FeedItem = DeliveryParty | SharePost

export const heroMetrics = [
  { value: '12+', label: '지금 저녁 시간대 활성 카드' },
  { value: '3,200원', label: '배달 파티 평균 절감 금액' },
  { value: '89%', label: '나눔 매칭 가정 성사율' },
]

export const liveSignals = [
  {
    title: '학생회관 앞 치킨 파티가 1자리 남았어요',
    description: 'Silent 참여도 가능해서 음식만 같이 주문하고 바로 수령할 수 있습니다.',
    time: '2분 전',
    tone: 'orange',
  },
  {
    title: '느헤미야 1관에서 계란 소분 나눔이 올라왔어요',
    description: '30구 한 판을 혼자 소비하기 어려운 학생을 위한 빠른 근거리 나눔입니다.',
    time: '5분 전',
    tone: 'mint',
  },
  {
    title: '벧엘관 근처 세제 리필 글에 매너 칭호가 추가됐어요',
    description: '응답 속도와 거래 후기 기반 신뢰 정보를 같이 보여주는 흐름을 반영했습니다.',
    time: '11분 전',
    tone: 'blue',
  },
]

export const featureHighlights = [
  {
    tag: 'Delivery Mate',
    title: '배달비를 아끼는 실시간 모집',
    description:
      '같은 시간대에 같은 음식을 시킬 사람을 모아 배달비 부담을 나누고, 수령 장소까지 한눈에 확인합니다.',
    points: ['실시간 파티 카드', '지도 기반 수령 장소', 'Silent / Social 선택'],
  },
  {
    tag: 'Re-Share',
    title: '자취 생활에 맞는 소량 나눔',
    description:
      '계란, 양파, 세제처럼 혼자 소비하기 부담스러운 자원을 가까운 학생들과 가볍게 주고받습니다.',
    points: ['식재료 / 생필품 구분', '도보 거리 중심 탐색', '빠른 근거리 매칭'],
  },
  {
    tag: 'Trust Layer',
    title: '매너 온도와 칭호 기반 신뢰 설계',
    description:
      '거래나 수령 과정이 불안하지 않도록, 온도와 칭호를 통해 사용자 경험을 더 안전하게 설계했습니다.',
    points: ['매너 온도 표시', '응답 속도 신호', '안전 수령 존 가이드'],
  },
  {
    tag: 'Scale Up',
    title: '웹에서 검증하고 모바일로 확장',
    description:
      '이번 버전은 사용 흐름을 검증하기 위한 웹 MVP이며, 이후 같은 데이터 구조로 모바일 앱 전환이 쉽습니다.',
    points: ['Firebase 실시간 구조 대비', 'Kakao Maps 연동 포인트 준비', '모바일 전환 친화적 정보 구조'],
  },
]

export const campusLandmarks = [
  { label: '비전관', x: 22, y: 24 },
  { label: '도서관', x: 51, y: 38 },
  { label: '학생회관', x: 24, y: 62 },
  { label: '오석관', x: 64, y: 48 },
  { label: '벧엘관', x: 43, y: 76 },
  { label: '느헤미야', x: 77, y: 72 },
]

export const draftAnchors = {
  delivery: [
    { x: 18, y: 58 },
    { x: 37, y: 70 },
    { x: 58, y: 42 },
    { x: 74, y: 61 },
  ],
  share: [
    { x: 28, y: 68 },
    { x: 46, y: 79 },
    { x: 69, y: 57 },
    { x: 76, y: 31 },
  ],
}

export const seedDeliveryParties: DeliveryParty[] = [
  {
    kind: 'delivery',
    id: 'delivery-bhc',
    title: 'BHC 반반치킨 같이 주문해요',
    restaurant: 'BHC 포항양덕점',
    meetingPoint: '학생회관 앞 벤치',
    building: '학생회관',
    x: 22,
    y: 61,
    mood: 'social',
    eta: '26분 내 도착',
    feeSavings: '1인당 3,200원 절감',
    members: 3,
    capacity: 4,
    host: '윤하',
    hostTrust: 41.5,
    timeLabel: '2분 전',
    tags: ['저녁식사', '치킨', '같이 먹기'],
    chatPreview: ['학생회관 앞에서 같이 받을게요.', '시간 되면 치킨 같이 먹어도 좋아요.'],
    summary: '강의 끝나고 바로 받을 수 있는 저녁 치킨 파티입니다.',
    pickupSlot: '오늘 18:40',
  },
  {
    kind: 'delivery',
    id: 'delivery-malatang',
    title: '마라탕 배달비 같이 나눠요',
    restaurant: '탕화쿵푸 마라탕',
    meetingPoint: '벧엘관 로비',
    building: '벧엘관',
    x: 44,
    y: 77,
    mood: 'silent',
    eta: '21분 내 도착',
    feeSavings: '1인당 2,800원 절감',
    members: 2,
    capacity: 4,
    host: '민준',
    hostTrust: 39.1,
    timeLabel: '4분 전',
    tags: ['마라탕', '음식만 같이 주문', '기숙사 수령'],
    chatPreview: ['받고 바로 각자 올라가도 괜찮아요.', '맵기 단계만 채팅으로 맞춰요.'],
    summary: '가볍게 배달비만 줄이고 싶은 사람들을 위한 Silent 파티입니다.',
    pickupSlot: '오늘 18:25',
  },
  {
    kind: 'delivery',
    id: 'delivery-sushi',
    title: '초밥 세트 같이 시키실 분',
    restaurant: '스시하루',
    meetingPoint: '오석관 입구',
    building: '오석관',
    x: 63,
    y: 49,
    mood: 'social',
    eta: '32분 내 도착',
    feeSavings: '1인당 3,000원 절감',
    members: 2,
    capacity: 3,
    host: '예린',
    hostTrust: 42.7,
    timeLabel: '9분 전',
    tags: ['초밥', '늦은 저녁', '같이 식사'],
    chatPreview: ['오석관에서 같이 받을게요.', '식사 겸 잠깐 이야기 나눠도 좋겠어요.'],
    summary: '늦은 저녁에 가볍게 초밥을 같이 먹고 싶은 학생들을 위한 파티입니다.',
    pickupSlot: '오늘 19:10',
  },
]

export const seedSharePosts: SharePost[] = [
  {
    kind: 'share',
    id: 'share-eggs',
    title: '계란 10개 소분 나눔',
    category: 'ingredient',
    location: '느헤미야 1관 로비',
    building: '느헤미야',
    x: 76,
    y: 71,
    quantity: '10알',
    pickupWindow: '오늘 21:00까지',
    trust: 40.2,
    badges: ['냉장보관', '소량 나눔', '응답 빠름'],
    timeLabel: '5분 전',
    note: '30구 한 판을 다 먹기 어려워서 필요한 분과 나누고 싶어요.',
    owner: '서연',
    distance: '도보 3분',
  },
  {
    kind: 'share',
    id: 'share-onion',
    title: '양파 3개 나눔',
    category: 'ingredient',
    location: '학생회관 옆 쉼터',
    building: '학생회관',
    x: 27,
    y: 66,
    quantity: '중간 크기 3개',
    pickupWindow: '오늘 저녁 8시 전',
    trust: 38.9,
    badges: ['즉시 수령 가능', '생활비 절약', '가까운 픽업'],
    timeLabel: '13분 전',
    note: '요리하고 남은 양파라 필요한 만큼만 가져가도 괜찮습니다.',
    owner: '도윤',
    distance: '도보 4분',
  },
  {
    kind: 'share',
    id: 'share-detergent',
    title: '세제 리필 조금 나눔',
    category: 'supply',
    location: '벧엘관 세탁실 앞',
    building: '벧엘관',
    x: 42,
    y: 75,
    quantity: '500ml 정도',
    pickupWindow: '오늘 밤 10시 전',
    trust: 41.1,
    badges: ['생필품', '기숙사 거래', '매너 칭호 보유'],
    timeLabel: '11분 전',
    note: '급하게 세제가 필요한 분에게 소량 먼저 나눌 수 있어요.',
    owner: '지후',
    distance: '도보 2분',
  },
  {
    kind: 'share',
    id: 'share-bags',
    title: '종량제 봉투 2장 나눔',
    category: 'supply',
    location: '오석관 1층 출입구',
    building: '오석관',
    x: 65,
    y: 47,
    quantity: '20L 2장',
    pickupWindow: '수업 끝난 후 바로 가능',
    trust: 37.6,
    badges: ['생필품', '캠퍼스 픽업', '가벼운 거래'],
    timeLabel: '19분 전',
    note: '급하게 필요한 분이 있다면 수업 끝나고 바로 전달할 수 있습니다.',
    owner: '소민',
    distance: '도보 5분',
  },
]

export const trustPrograms = [
  {
    metric: '36.5℃ ~ 45.0℃',
    title: '매너 온도 중심의 신뢰 점수',
    description:
      '거래 완료 여부, 응답 속도, 후기 누적 같은 요소를 반영해 학생 간 신뢰를 숫자로 직관적으로 보여줍니다.',
  },
  {
    metric: '6개 핵심 거점',
    title: '안전 수령 존 추천',
    description:
      '학생회관, 기숙사 로비, 주요 강의동처럼 사람이 자주 드나드는 위치를 우선 제안해 거래 부담을 줄입니다.',
  },
  {
    metric: '실시간 알림',
    title: '관심 주제 기반 빠른 매칭',
    description:
      '치킨, 마라탕, 계란, 세제처럼 자주 찾는 항목을 저장해두고 조건이 맞는 글이 뜨면 바로 반응할 수 있습니다.',
  },
]

export const roadmapSteps = [
  {
    phase: '01',
    title: '웹 MVP 흐름 검증',
    description:
      '현재 버전처럼 배달 파티, 나눔 게시판, 지도 기반 장소 선택, 빠른 글 작성 흐름을 먼저 검증합니다.',
  },
  {
    phase: '02',
    title: 'Firebase 실시간 동기화 연결',
    description:
      '실시간 모집 현황, 채팅, 푸시 알림, 사용자 상태를 Firebase로 연결해 여러 사용자가 동시에 쓰는 서비스로 확장합니다.',
  },
  {
    phase: '03',
    title: 'Kakao Maps 캠퍼스 지도 고도화',
    description:
      '실제 지도 위에 수령 위치 핀, 안전 거래 거점, 거리 기반 탐색을 얹어 장소 선택 경험을 현실감 있게 만듭니다.',
  },
  {
    phase: '04',
    title: '모바일 앱 전환',
    description:
      '웹에서 검증한 정보 구조와 상태 흐름을 바탕으로, 이후 모바일 앱에서도 같은 핵심 경험을 자연스럽게 이어갑니다.',
  },
]
