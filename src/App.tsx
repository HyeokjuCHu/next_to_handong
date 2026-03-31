import { useState } from 'react'
import './App.css'
import {
  campusLandmarks,
  draftAnchors,
  featureHighlights,
  heroMetrics,
  liveSignals,
  roadmapSteps,
  seedDeliveryParties,
  seedSharePosts,
  trustPrograms,
  type DeliveryFilter,
  type DeliveryMood,
  type DeliveryParty,
  type FeedItem,
  type ShareCategory,
  type ShareFilter,
  type SharePost,
  type ViewMode,
} from './data/campusData'
import { platformReadiness } from './lib/platform'

const deliveryFilters: Array<{ value: DeliveryFilter; label: string }> = [
  { value: 'all', label: '전체 파티' },
  { value: 'silent', label: 'Silent 주문' },
  { value: 'social', label: 'Social 식사' },
]

const shareFilters: Array<{ value: ShareFilter; label: string }> = [
  { value: 'all', label: '전체 나눔' },
  { value: 'ingredient', label: '식재료' },
  { value: 'supply', label: '생필품' },
]

function getModeLabel(mood: DeliveryMood) {
  return mood === 'silent' ? 'Silent' : 'Social'
}

function getShareLabel(category: ShareCategory) {
  return category === 'ingredient' ? '식재료' : '생필품'
}

function isDeliveryItem(item: FeedItem): item is DeliveryParty {
  return item.kind === 'delivery'
}

function App() {
  const [activeView, setActiveView] = useState<ViewMode>('delivery')
  const [deliveryFilter, setDeliveryFilter] = useState<DeliveryFilter>('all')
  const [shareFilter, setShareFilter] = useState<ShareFilter>('all')
  const [deliveryPosts, setDeliveryPosts] = useState<DeliveryParty[]>([])
  const [sharePosts, setSharePosts] = useState<SharePost[]>([])
  const [selectedId, setSelectedId] = useState(seedDeliveryParties[0].id)
  const [draftTitle, setDraftTitle] = useState('')
  const [draftLocation, setDraftLocation] = useState('')
  const [draftNote, setDraftNote] = useState('')
  const [draftMood, setDraftMood] = useState<DeliveryMood>('silent')
  const [draftCategory, setDraftCategory] = useState<ShareCategory>('ingredient')

  const visibleDelivery = [...deliveryPosts, ...seedDeliveryParties].filter(
    (party) => deliveryFilter === 'all' || party.mood === deliveryFilter,
  )

  const visibleShare = [...sharePosts, ...seedSharePosts].filter(
    (post) => shareFilter === 'all' || post.category === shareFilter,
  )

  const visibleItems = activeView === 'delivery' ? visibleDelivery : visibleShare
  const effectiveSelectedId = visibleItems.some((item) => item.id === selectedId)
    ? selectedId
    : visibleItems[0]?.id
  const selectedItem =
    visibleItems.find((item) => item.id === effectiveSelectedId) ?? visibleItems[0]
  const activeBoardLabel = activeView === 'delivery' ? '배달 동행' : '리쉐어 보드'
  const mapStatus = platformReadiness.find((item) => item.id === 'kakao')

  const handleBoardChange = (view: ViewMode) => {
    setActiveView(view)
    const nextSelection = view === 'delivery' ? visibleDelivery[0] : visibleShare[0]
    if (nextSelection) {
      setSelectedId(nextSelection.id)
    }
  }

  const handleCreate = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const cleanTitle = draftTitle.trim()
    const cleanLocation = draftLocation.trim() || '학생회관 앞'
    const cleanNote = draftNote.trim()

    if (!cleanTitle) {
      return
    }

    if (activeView === 'delivery') {
      const anchor = draftAnchors.delivery[deliveryPosts.length % draftAnchors.delivery.length]
      const newParty: DeliveryParty = {
        kind: 'delivery',
        id: `user-delivery-${deliveryPosts.length + 1}`,
        title: `${cleanTitle} 파티`,
        restaurant: cleanTitle,
        meetingPoint: cleanLocation,
        building: cleanLocation,
        x: anchor.x,
        y: anchor.y,
        mood: draftMood,
        eta: '18분 내 도착',
        feeSavings: '예상 절약 2,500원',
        members: 1,
        capacity: 4,
        host: '나',
        hostTrust: 37.8,
        timeLabel: '방금 등록됨',
        tags: [
          draftMood === 'silent' ? '음식만 같이 주문' : '함께 먹기 환영',
          '빠른 모집',
          '새 글',
        ],
        chatPreview: [
          '방금 새 파티를 열었어요.',
          draftMood === 'silent'
            ? '받고 바로 해산해도 편하게 참여할 수 있어요.'
            : '시간 맞는 분은 수령 후 같이 먹어도 좋아요.',
        ],
        summary: cleanNote || '메뉴 조율은 채팅에서 빠르게 정할 수 있어요.',
        pickupSlot: '오늘 저녁',
      }

      setDeliveryPosts((current) => [newParty, ...current])
      setSelectedId(newParty.id)
    } else {
      const anchor = draftAnchors.share[sharePosts.length % draftAnchors.share.length]
      const newPost: SharePost = {
        kind: 'share',
        id: `user-share-${sharePosts.length + 1}`,
        title: cleanTitle,
        category: draftCategory,
        location: cleanLocation,
        building: cleanLocation,
        x: anchor.x,
        y: anchor.y,
        quantity: draftCategory === 'ingredient' ? '소분 가능' : '상태 양호',
        pickupWindow: '오늘 밤 9시 전',
        trust: 37.2,
        badges: [
          draftCategory === 'ingredient' ? '소량 나눔' : '생활필수',
          '기숙사 근처',
          '새 글',
        ],
        timeLabel: '방금 등록됨',
        note: cleanNote || '필요한 분이 먼저 메시지 주시면 맞춰드릴게요.',
        owner: '나',
        distance: '도보 4분',
      }

      setSharePosts((current) => [newPost, ...current])
      setSelectedId(newPost.id)
    }

    setDraftTitle('')
    setDraftLocation('')
    setDraftNote('')
    setDraftMood('silent')
    setDraftCategory('ingredient')
  }

  if (!selectedItem) {
    return null
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="brand-tag">HGU Campus Commons</p>
          <a className="brand-name" href="#top">
            한동곁
          </a>
        </div>
        <nav className="topnav">
          <a href="#dashboard">실시간 보드</a>
          <a href="#community">신뢰 설계</a>
          <a href="#roadmap">다음 단계</a>
        </nav>
      </header>

      <main id="top">
        <section className="hero-section">
          <div className="hero-copy">
            <p className="eyebrow">배달도 같이, 나눔도 가까이</p>
            <h1>
              한동대 학생들이
              <br />
              배달비를 아끼고 생활 자원을 나누는
              <br />
              하나의 캠퍼스 웹 허브
            </h1>
            <p className="hero-description">
              <strong>한동곁</strong>은 <strong>Delivery Mate</strong>와{' '}
              <strong>Re-Share</strong>를 합쳐, 같은 캠퍼스 안에서 주문 동행과 소량
              나눔이 자연스럽게 이어지도록 만든 웹 MVP입니다. 지금은 웹으로 흐름을
              검증하고, 이후 모바일로 확장하기 좋은 구조로 설계했습니다.
            </p>
            <div className="hero-actions">
              <a className="primary-action" href="#dashboard">
                실시간 보드 보기
              </a>
              <a className="secondary-action" href="#roadmap">
                Firebase/Kakao 준비 보기
              </a>
            </div>
            <div className="metric-grid">
              {heroMetrics.map((metric) => (
                <article className="metric-card" key={metric.label}>
                  <strong>{metric.value}</strong>
                  <span>{metric.label}</span>
                </article>
              ))}
            </div>
          </div>

          <div className="hero-surface">
            <div className="surface-header">
              <div>
                <p className="surface-kicker">오늘 캠퍼스 흐름</p>
                <h2>실시간으로 움직이는 학교 생활 보드</h2>
              </div>
              <span className="status-pill status-pill--live">Live Mock Feed</span>
            </div>
            <div className="signal-list">
              {liveSignals.map((signal) => (
                <article className="signal-card" key={signal.title}>
                  <div className="signal-topline">
                    <span className={`signal-dot signal-dot--${signal.tone}`}></span>
                    <p>{signal.time}</p>
                  </div>
                  <h3>{signal.title}</h3>
                  <p>{signal.description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="feature-grid">
          {featureHighlights.map((feature) => (
            <article className="feature-card" key={feature.title}>
              <p className="feature-tag">{feature.tag}</p>
              <h3>{feature.title}</h3>
              <p>{feature.description}</p>
              <ul>
                {feature.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </article>
          ))}
        </section>

        <section className="dashboard-section" id="dashboard">
          <div className="section-heading">
            <div>
              <p className="eyebrow">MVP Preview</p>
              <h2>배달 동행과 나눔 게시판을 하나의 흐름으로 묶었습니다</h2>
            </div>
            <p>
              같은 지도 위에서 수령 위치를 확인하고, 상세 카드에서 분위기와 신뢰
              정보를 확인한 뒤, 바로 새 글까지 올릴 수 있는 구조입니다.
            </p>
          </div>

          <div className="board-controls">
            <div className="board-switch">
              <button
                type="button"
                className={activeView === 'delivery' ? 'is-active' : ''}
                onClick={() => handleBoardChange('delivery')}
              >
                배달 동행
              </button>
              <button
                type="button"
                className={activeView === 'share' ? 'is-active' : ''}
                onClick={() => handleBoardChange('share')}
              >
                리쉐어 보드
              </button>
            </div>

            <div className="filter-row">
              {(activeView === 'delivery' ? deliveryFilters : shareFilters).map((filter) => {
                const isActive =
                  activeView === 'delivery'
                    ? deliveryFilter === filter.value
                    : shareFilter === filter.value

                return (
                  <button
                    key={filter.value}
                    type="button"
                    className={isActive ? 'filter-pill is-active' : 'filter-pill'}
                    onClick={() => {
                      if (activeView === 'delivery') {
                        setDeliveryFilter(filter.value as DeliveryFilter)
                      } else {
                        setShareFilter(filter.value as ShareFilter)
                      }
                    }}
                  >
                    {filter.label}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="top-grid">
            <article className="panel map-card">
              <div className="panel-header">
                <div>
                  <p className="panel-kicker">Campus Pick-up Map</p>
                  <h3>{activeBoardLabel} 지도</h3>
                </div>
                <span className="panel-chip">
                  {mapStatus?.ready ? 'Kakao Maps ready' : 'Demo map active'}
                </span>
              </div>

              <div className="campus-map">
                <div className="map-blob map-blob--orange"></div>
                <div className="map-blob map-blob--mint"></div>
                {campusLandmarks.map((landmark) => (
                  <span
                    className="landmark-label"
                    key={landmark.label}
                    style={{ left: `${landmark.x}%`, top: `${landmark.y}%` }}
                  >
                    {landmark.label}
                  </span>
                ))}

                {visibleItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={item.id === effectiveSelectedId ? 'map-pin is-active' : 'map-pin'}
                    style={{ left: `${item.x}%`, top: `${item.y}%` }}
                    onClick={() => setSelectedId(item.id)}
                  >
                    <span className="map-pin__icon">
                      {item.kind === 'delivery' ? 'D' : 'R'}
                    </span>
                    <span className="map-pin__label">{item.building}</span>
                  </button>
                ))}

                <div className="map-footer">
                  <div>
                    <strong>{selectedItem.building}</strong>
                    <p>
                      {selectedItem.kind === 'delivery'
                        ? `${selectedItem.restaurant} 수령 지점`
                        : `${selectedItem.title} 나눔 지점`}
                    </p>
                  </div>
                  <p>
                    {mapStatus?.ready
                      ? '환경변수만 채우면 Kakao 지도 SDK를 연결할 수 있습니다.'
                      : '현재는 웹 MVP 데모 지도로 동선을 표현하고 있습니다.'}
                  </p>
                </div>
              </div>
            </article>

            <article className="panel detail-card">
              <div className="panel-header">
                <div>
                  <p className="panel-kicker">Selected Detail</p>
                  <h3>{selectedItem.title}</h3>
                </div>
                <span
                  className={
                    isDeliveryItem(selectedItem)
                      ? `status-pill status-pill--${selectedItem.mood}`
                      : `status-pill status-pill--${selectedItem.category}`
                  }
                >
                  {isDeliveryItem(selectedItem)
                    ? getModeLabel(selectedItem.mood)
                    : getShareLabel(selectedItem.category)}
                </span>
              </div>

              {isDeliveryItem(selectedItem) ? (
                <>
                  <p className="detail-copy">{selectedItem.summary}</p>
                  <div className="detail-grid">
                    <div>
                      <span>식당</span>
                      <strong>{selectedItem.restaurant}</strong>
                    </div>
                    <div>
                      <span>수령 위치</span>
                      <strong>{selectedItem.meetingPoint}</strong>
                    </div>
                    <div>
                      <span>예상 절감</span>
                      <strong>{selectedItem.feeSavings}</strong>
                    </div>
                    <div>
                      <span>남은 자리</span>
                      <strong>
                        {selectedItem.capacity - selectedItem.members} / {selectedItem.capacity}
                      </strong>
                    </div>
                    <div>
                      <span>모집자</span>
                      <strong>
                        {selectedItem.host} · {selectedItem.hostTrust.toFixed(1)}℃
                      </strong>
                    </div>
                    <div>
                      <span>도착 예상</span>
                      <strong>{selectedItem.eta}</strong>
                    </div>
                  </div>
                  <div className="badge-row">
                    {selectedItem.tags.map((tag) => (
                      <span className="mini-badge" key={tag}>
                        {tag}
                      </span>
                    ))}
                  </div>
                  <div className="preview-box">
                    <p className="preview-title">실시간 채팅 미리보기</p>
                    {selectedItem.chatPreview.map((message) => (
                      <p key={message} className="chat-line">
                        {message}
                      </p>
                    ))}
                  </div>
                  <button className="cta-button" type="button">
                    이 파티에 합류 요청하기
                  </button>
                </>
              ) : (
                <>
                  <p className="detail-copy">{selectedItem.note}</p>
                  <div className="detail-grid">
                    <div>
                      <span>품목 구분</span>
                      <strong>{getShareLabel(selectedItem.category)}</strong>
                    </div>
                    <div>
                      <span>수령 위치</span>
                      <strong>{selectedItem.location}</strong>
                    </div>
                    <div>
                      <span>양 / 상태</span>
                      <strong>{selectedItem.quantity}</strong>
                    </div>
                    <div>
                      <span>도보 거리</span>
                      <strong>{selectedItem.distance}</strong>
                    </div>
                    <div>
                      <span>작성자</span>
                      <strong>
                        {selectedItem.owner} · {selectedItem.trust.toFixed(1)}℃
                      </strong>
                    </div>
                    <div>
                      <span>수령 가능</span>
                      <strong>{selectedItem.pickupWindow}</strong>
                    </div>
                  </div>
                  <div className="badge-row">
                    {selectedItem.badges.map((badge) => (
                      <span className="mini-badge" key={badge}>
                        {badge}
                      </span>
                    ))}
                  </div>
                  <div className="preview-box">
                    <p className="preview-title">신뢰 신호</p>
                    <p className="chat-line">최근 응답 속도와 매너 온도를 함께 보여줍니다.</p>
                    <p className="chat-line">기숙사나 학생회관 같은 안전 수령 존 중심으로 제안합니다.</p>
                  </div>
                  <button className="cta-button" type="button">
                    나눔 문의 메시지 보내기
                  </button>
                </>
              )}
            </article>
          </div>

          <div className="bottom-grid">
            <article className="panel feed-card">
              <div className="panel-header">
                <div>
                  <p className="panel-kicker">Live Feed</p>
                  <h3>{activeBoardLabel} 목록</h3>
                </div>
                <span className="panel-chip">{visibleItems.length}건 표시 중</span>
              </div>
              <div className="feed-list">
                {visibleItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={item.id === effectiveSelectedId ? 'feed-item is-active' : 'feed-item'}
                    onClick={() => setSelectedId(item.id)}
                  >
                    <div className="feed-main">
                      <div className="feed-title-row">
                        <strong>{item.title}</strong>
                        <span>{item.timeLabel}</span>
                      </div>
                      <p>
                        {item.kind === 'delivery'
                          ? `${item.restaurant} · ${item.meetingPoint}`
                          : `${item.location} · ${item.quantity}`}
                      </p>
                    </div>
                    <span className="feed-chip">
                      {item.kind === 'delivery'
                        ? getModeLabel(item.mood)
                        : getShareLabel(item.category)}
                    </span>
                  </button>
                ))}
              </div>
            </article>

            <form className="panel composer-card" onSubmit={handleCreate}>
              <div className="panel-header">
                <div>
                  <p className="panel-kicker">Quick Create</p>
                  <h3>
                    {activeView === 'delivery'
                      ? '지금 배달 파티 열기'
                      : '지금 나눔 글 올리기'}
                  </h3>
                </div>
                <span className="panel-chip">브라우저 상태 저장</span>
              </div>

              <label className="field-label">
                {activeView === 'delivery' ? '가게 또는 메뉴' : '나눌 품목'}
                <input
                  value={draftTitle}
                  onChange={(event) => setDraftTitle(event.target.value)}
                  placeholder={
                    activeView === 'delivery'
                      ? '예: BHC 치킨, 마라탕'
                      : '예: 계란 8개, 세제 조금'
                  }
                />
              </label>

              <label className="field-label">
                수령 위치
                <input
                  value={draftLocation}
                  onChange={(event) => setDraftLocation(event.target.value)}
                  placeholder="예: 학생회관 앞, 벧엘관 로비"
                />
              </label>

              <label className="field-label">
                메모
                <textarea
                  value={draftNote}
                  onChange={(event) => setDraftNote(event.target.value)}
                  placeholder={
                    activeView === 'delivery'
                      ? '예: 순살 선호, 18시 30분 이전 수령 가능'
                      : '예: 오늘 안에 가져가면 좋고, 필요한 만큼만 드려요'
                  }
                  rows={4}
                />
              </label>

              {activeView === 'delivery' ? (
                <div className="segmented-control">
                  <button
                    type="button"
                    className={draftMood === 'silent' ? 'is-active' : ''}
                    onClick={() => setDraftMood('silent')}
                  >
                    Silent
                  </button>
                  <button
                    type="button"
                    className={draftMood === 'social' ? 'is-active' : ''}
                    onClick={() => setDraftMood('social')}
                  >
                    Social
                  </button>
                </div>
              ) : (
                <div className="segmented-control">
                  <button
                    type="button"
                    className={draftCategory === 'ingredient' ? 'is-active' : ''}
                    onClick={() => setDraftCategory('ingredient')}
                  >
                    식재료
                  </button>
                  <button
                    type="button"
                    className={draftCategory === 'supply' ? 'is-active' : ''}
                    onClick={() => setDraftCategory('supply')}
                  >
                    생필품
                  </button>
                </div>
              )}

              <button className="submit-button" type="submit">
                {activeView === 'delivery' ? '배달 파티 등록' : '나눔 글 등록'}
              </button>
              <p className="helper-text">
                지금은 프론트 MVP라 새 글이 브라우저 상태에만 저장됩니다. 구조는 이후
                Firebase 실시간 동기화로 자연스럽게 확장할 수 있게 맞춰두었습니다.
              </p>
            </form>
          </div>
        </section>

        <section className="community-section" id="community">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Community Design</p>
              <h2>안전한 공동체 사용 경험까지 함께 설계했습니다</h2>
            </div>
            <p>
              단순 게시판이 아니라, 학생들이 실제로 안심하고 쓸 수 있는 신뢰 장치와
              기술 연동 준비 상태를 함께 보여줍니다.
            </p>
          </div>

          <div className="community-grid">
            <div className="trust-grid">
              {trustPrograms.map((program) => (
                <article className="trust-card" key={program.title}>
                  <p className="feature-tag">{program.metric}</p>
                  <h3>{program.title}</h3>
                  <p>{program.description}</p>
                </article>
              ))}
            </div>

            <div className="platform-grid">
              {platformReadiness.map((platform) => (
                <article className="platform-card" key={platform.id}>
                  <div className="platform-topline">
                    <h3>{platform.title}</h3>
                    <span className={platform.ready ? 'ready-badge is-ready' : 'ready-badge'}>
                      {platform.ready ? 'Ready' : `${platform.filled}/${platform.total}`}
                    </span>
                  </div>
                  <p>{platform.description}</p>
                  <div className="progress-track">
                    <span
                      style={{
                        width: `${(platform.filled / platform.total) * 100}%`,
                      }}
                    ></span>
                  </div>
                  <div className="missing-list">
                    {platform.missing.length === 0 ? (
                      <span className="mini-badge">환경변수 준비 완료</span>
                    ) : (
                      platform.missing.map((item) => (
                        <code key={item} className="env-chip">
                          {item}
                        </code>
                      ))
                    )}
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="roadmap-section" id="roadmap">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Next Build Steps</p>
              <h2>다음 구현 단계까지 바로 이어갈 수 있습니다</h2>
            </div>
            <p>
              웹 MVP로 정보 구조와 사용 흐름을 먼저 검증한 뒤, 실시간 백엔드와 모바일
              확장으로 이어가기 좋은 순서로 정리했습니다.
            </p>
          </div>

          <div className="roadmap-grid">
            {roadmapSteps.map((step) => (
              <article className="roadmap-card" key={step.phase}>
                <span className="roadmap-phase">{step.phase}</span>
                <h3>{step.title}</h3>
                <p>{step.description}</p>
              </article>
            ))}
          </div>
        </section>
      </main>
    </div>
  )
}

export default App
