import { useEffect, useState, type FormEvent } from 'react'
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth'
import { Link, NavLink, Navigate, Route, Routes } from 'react-router-dom'
import './App.css'
import { CampusMap } from './components/CampusMap'
import { LocationPickerMap } from './components/LocationPickerMap'
import {
  type DeliveryJoinRequest,
  type CampusPoint,
  type DeliveryFilter,
  type DeliveryMood,
  type DeliveryParty,
  type FeedItem,
  type ShareCategory,
  type ShareFilter,
  type SharePost,
  type ViewMode,
} from './data/campusData'
import {
  auth,
  googleProvider,
  initAnalytics,
  isAllowedSchoolEmail,
  isFirebaseConfigured,
  schoolEmailDomain,
} from './lib/firebase'
import {
  createDeliveryParty,
  createSharePost,
  deleteDeliveryParty,
  deleteSharePost,
  approveDeliveryJoinRequest,
  listenToDeliveryParties,
  listenToMyDeliveryJoinRequest,
  listenToPartyJoinRequestsForHost,
  listenToSharePosts,
  rejectDeliveryJoinRequest,
  submitDeliveryJoinRequest,
  syncUserProfile,
  updateDeliveryParty,
  updateSharePost,
} from './lib/firestore'
import { resolveCampusPositionByBuilding } from './lib/campusPlaces'
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

function getDefaultScheduleTime(view: ViewMode) {
  return view === 'delivery' ? '18:30' : '21:00'
}

function isDeliveryItem(item: FeedItem): item is DeliveryParty {
  return item.kind === 'delivery'
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

function isPermissionDeniedError(error: unknown) {
  if (!error || typeof error !== 'object' || !('code' in error)) {
    return false
  }

  const code = (error as { code?: unknown }).code
  return code === 'permission-denied' || code === 'firestore/permission-denied'
}

function getFirestorePermissionHint(email?: string | null) {
  if (!email) {
    return `Firestore 권한이 거부되었습니다. 현재 로그인 계정이 없거나 인증 정보가 아직 준비되지 않았습니다.`
  }

  if (!isAllowedSchoolEmail(email)) {
    return `현재 로그인한 계정(${email})은 @${schoolEmailDomain} 학교 메일이 아니라서 Firestore 쓰기가 차단되었습니다.`
  }

  return `학교 계정(${email})으로 로그인했지만 Firestore Rules가 아직 이 계정을 허용하지 않았습니다. Firebase 콘솔에 firestore.rules를 배포했는지, 그리고 토큰 이메일이 정확히 @${schoolEmailDomain}인지 확인해 주세요.`
}

function getItemOwnerId(item: FeedItem) {
  return item.kind === 'delivery' ? item.hostId : item.ownerId
}

function normalizePhoneNumber(value: string) {
  return value.replace(/\D+/g, '')
}

function formatPhoneNumber(value: string) {
  const digits = normalizePhoneNumber(value)

  if (digits.length === 11) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`
  }

  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`
  }

  return value
}

function getJoinStatusLabel(status: DeliveryJoinRequest['status']) {
  if (status === 'approved') {
    return '승인됨'
  }

  if (status === 'rejected') {
    return '거절됨'
  }

  return '대기 중'
}

function App() {
  const [activeView, setActiveView] = useState<ViewMode>('delivery')
  const [deliveryFilter, setDeliveryFilter] = useState<DeliveryFilter>('all')
  const [shareFilter, setShareFilter] = useState<ShareFilter>('all')
  const [selectedId, setSelectedId] = useState('')
  const [draftTitle, setDraftTitle] = useState('')
  const [draftLocation, setDraftLocation] = useState('')
  const [draftPoint, setDraftPoint] = useState<CampusPoint | null>(null)
  const [draftNote, setDraftNote] = useState('')
  const [draftScheduleTime, setDraftScheduleTime] = useState(
    getDefaultScheduleTime('delivery'),
  )
  const [draftMood, setDraftMood] = useState<DeliveryMood>('silent')
  const [draftCategory, setDraftCategory] = useState<ShareCategory>('ingredient')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [user, setUser] = useState<User | null>(auth?.currentUser ?? null)
  const [authReady, setAuthReady] = useState(!auth)
  const [authMessage, setAuthMessage] = useState('')
  const [submitMessage, setSubmitMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [joinPhoneNumber, setJoinPhoneNumber] = useState('')
  const [joinRequestNote, setJoinRequestNote] = useState('')
  const [joinRequests, setJoinRequests] = useState<DeliveryJoinRequest[]>([])
  const [myJoinRequest, setMyJoinRequest] = useState<DeliveryJoinRequest | null>(null)
  const [joinMessage, setJoinMessage] = useState('')
  const [isJoinSubmitting, setIsJoinSubmitting] = useState(false)
  const [processingJoinRequestId, setProcessingJoinRequestId] = useState('')
  const [deliveryFeed, setDeliveryFeed] = useState<DeliveryParty[]>([])
  const [shareFeed, setShareFeed] = useState<SharePost[]>([])
  const [deliveryListenerReady, setDeliveryListenerReady] = useState(!isFirebaseConfigured)
  const [shareListenerReady, setShareListenerReady] = useState(!isFirebaseConfigured)
  const [dataError, setDataError] = useState('')

  useEffect(() => {
    void initAnalytics()
  }, [])

  useEffect(() => {
    const authInstance = auth

    if (!authInstance) {
      setAuthReady(true)
      return
    }

    return onAuthStateChanged(authInstance, (nextUser) => {
      if (nextUser && !isAllowedSchoolEmail(nextUser.email)) {
        setAuthMessage(
          `학교 메일(@${schoolEmailDomain}) 계정만 글쓰기와 채팅에 사용할 수 있어요.`,
        )
        setUser(null)
        setAuthReady(true)
        void signOut(authInstance)
        return
      }

      setUser(nextUser)
      setAuthReady(true)

      if (nextUser) {
        setAuthMessage('')
        void syncUserProfile(nextUser).catch((error) => {
          setDataError(
            isPermissionDeniedError(error)
              ? getFirestorePermissionHint(nextUser.email)
              : getErrorMessage(error, '사용자 프로필을 동기화하지 못했습니다.'),
          )
        })
      }
    })
  }, [])

  useEffect(() => {
    const unsubscribeDelivery = listenToDeliveryParties(
      (items) => {
        setDeliveryFeed(items)
        setDeliveryListenerReady(true)
      },
      (error) => {
        setDeliveryListenerReady(false)
        setDataError(
          isPermissionDeniedError(error)
            ? '배달 파티 데이터를 읽을 권한이 없습니다. Firestore Rules가 실제 프로젝트에 배포되었는지 확인해 주세요.'
            : getErrorMessage(error, '배달 파티 실시간 데이터를 읽는 데 실패했습니다.'),
        )
      },
    )

    const unsubscribeShare = listenToSharePosts(
      (items) => {
        setShareFeed(items)
        setShareListenerReady(true)
      },
      (error) => {
        setShareListenerReady(false)
        setDataError(
          isPermissionDeniedError(error)
            ? '나눔 글 데이터를 읽을 권한이 없습니다. Firestore Rules가 실제 프로젝트에 배포되었는지 확인해 주세요.'
            : getErrorMessage(error, '나눔 게시글 실시간 데이터를 읽는 데 실패했습니다.'),
        )
      },
    )

    return () => {
      unsubscribeDelivery()
      unsubscribeShare()
    }
  }, [])

  useEffect(() => {
    const nextVisibleItems =
      activeView === 'delivery'
        ? deliveryFeed.filter(
            (party) => deliveryFilter === 'all' || party.mood === deliveryFilter,
          )
        : shareFeed.filter(
            (post) => shareFilter === 'all' || post.category === shareFilter,
          )

    if (nextVisibleItems.length === 0) {
      if (selectedId) {
        setSelectedId('')
      }
      return
    }

    if (!nextVisibleItems.some((item) => item.id === selectedId)) {
      setSelectedId(nextVisibleItems[0].id)
    }
  }, [
    activeView,
    deliveryFeed,
    deliveryFilter,
    selectedId,
    shareFeed,
    shareFilter,
  ])

  const isSchoolUser = isAllowedSchoolEmail(user?.email)
  const realtimeConnected = deliveryListenerReady && shareListenerReady

  const visibleDelivery = deliveryFeed.filter(
    (party) => deliveryFilter === 'all' || party.mood === deliveryFilter,
  )

  const visibleShare = shareFeed.filter(
    (post) => shareFilter === 'all' || post.category === shareFilter,
  )

  const visibleItems = activeView === 'delivery' ? visibleDelivery : visibleShare
  const effectiveSelectedId = visibleItems.some((item) => item.id === selectedId)
    ? selectedId
    : visibleItems[0]?.id
  const selectedItem =
    visibleItems.find((item) => item.id === effectiveSelectedId) ?? visibleItems[0]
  const activeBoardLabel = activeView === 'delivery' ? '배달 동행' : '리쉐어 보드'
  const activeBoardCount = visibleItems.length
  const totalLivePosts = deliveryFeed.length + shareFeed.length
  const activeBoardHasPosts =
    activeView === 'delivery' ? deliveryFeed.length > 0 : shareFeed.length > 0
  const isEditing = editingId !== null
  const isOwnedByCurrentUser =
    Boolean(user && selectedItem && getItemOwnerId(selectedItem) === user.uid)
  const selectedDeliveryParty =
    selectedItem && isDeliveryItem(selectedItem) ? selectedItem : null
  const heroMetrics = [
    { value: `${deliveryFeed.length}건`, label: '열린 배달 동행' },
    { value: `${shareFeed.length}건`, label: '열린 나눔 글' },
    {
      value: isSchoolUser ? '인증됨' : '둘러보기',
      label: isSchoolUser ? '학교 계정 상태' : '로그인 없이 피드 보기',
    },
  ]
  const heroSignals = [
    {
      title: '배달 동행',
      description:
        deliveryFeed.length > 0
          ? '지금 열려 있는 배달 파티가 실시간으로 올라오고 있습니다.'
          : '아직 열린 배달 파티가 없습니다. 첫 모집 글을 열면 여기부터 채워집니다.',
      time: deliveryFeed.length > 0 ? `${deliveryFeed.length}건 진행 중` : '현재 비어 있음',
      tone: 'orange',
    },
    {
      title: '리쉐어 보드',
      description:
        shareFeed.length > 0
          ? '남는 식재료와 생필품 글을 바로 확인할 수 있습니다.'
          : '아직 올라온 나눔 글이 없습니다. 남는 물품이 있다면 첫 글을 올려보세요.',
      time: shareFeed.length > 0 ? `${shareFeed.length}건 게시 중` : '현재 비어 있음',
      tone: 'mint',
    },
    {
      title: '내 이용 상태',
      description: isSchoolUser
        ? '학교 계정 인증이 완료되어 지금 바로 새 글을 등록할 수 있습니다.'
        : `둘러보기는 바로 가능하고, 글쓰기는 @${schoolEmailDomain} 로그인 후 열립니다.`,
      time: isSchoolUser ? '학교 인증 완료' : '로그인 전',
      tone: 'blue',
    },
  ] as const
  const mapStatus = platformReadiness.find((item) => item.id === 'kakao')

  useEffect(() => {
    setJoinPhoneNumber('')
    setJoinRequestNote('')
    setJoinMessage('')
    setJoinRequests([])
    setMyJoinRequest(null)
  }, [effectiveSelectedId, user?.uid])

  useEffect(() => {
    if (
      !selectedDeliveryParty ||
      !user ||
      !isSchoolUser
    ) {
      return
    }

    if (selectedDeliveryParty.hostId === user.uid) {
      return listenToPartyJoinRequestsForHost(
        selectedDeliveryParty.id,
        (items) => {
          setJoinRequests(items)
        },
        (error) => {
          setJoinMessage(getErrorMessage(error, '참여 요청 목록을 읽는 데 실패했습니다.'))
        },
      )
    }

    return listenToMyDeliveryJoinRequest(
      selectedDeliveryParty.id,
      user.uid,
      (item) => {
        setMyJoinRequest(item)
      },
      (error) => {
        setJoinMessage(getErrorMessage(error, '내 참여 요청 상태를 읽는 데 실패했습니다.'))
      },
    )
  }, [isSchoolUser, selectedDeliveryParty, user])

  const resetComposer = (view: ViewMode = activeView) => {
    setEditingId(null)
    setDraftTitle('')
    setDraftLocation('')
    setDraftPoint(null)
    setDraftNote('')
    setDraftScheduleTime(getDefaultScheduleTime(view))
    setDraftMood('silent')
    setDraftCategory('ingredient')
  }

  const handleBoardChange = (view: ViewMode) => {
    setActiveView(view)
    setSubmitMessage('')
    resetComposer(view)
  }

  const handleSignIn = async () => {
    if (!auth || !googleProvider) {
      setAuthMessage('Firebase Authentication 설정이 아직 완료되지 않았어요.')
      return
    }

    setAuthMessage('')

    try {
      const result = await signInWithPopup(auth, googleProvider)
      if (!isAllowedSchoolEmail(result.user.email)) {
        await signOut(auth)
        setAuthMessage(
          `학교 메일(@${schoolEmailDomain}) 계정만 글쓰기와 채팅에 사용할 수 있어요.`,
        )
        return
      }

      await syncUserProfile(result.user)
    } catch (error) {
      setAuthMessage(getErrorMessage(error, '로그인에 실패했습니다.'))
    }
  }

  const handleSignOut = async () => {
    if (!auth) {
      return
    }

    await signOut(auth)
    setSubmitMessage('')
  }

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitMessage('')

    const cleanTitle = draftTitle.trim()
    const cleanLocation =
      draftLocation.trim() || (draftPoint ? `${draftPoint.building} 인근 직접 지정` : '학생회관 앞')
    const cleanNote = draftNote.trim()
    const cleanScheduleTime = draftScheduleTime || getDefaultScheduleTime(activeView)

    if (!cleanTitle) {
      setSubmitMessage('제목이나 메뉴 이름을 먼저 입력해 주세요.')
      return
    }

    if (!user || !isSchoolUser) {
      setAuthMessage(
        `글쓰기는 학교 메일(@${schoolEmailDomain})로 로그인한 뒤 사용할 수 있어요.`,
      )
      return
    }

    setIsSubmitting(true)

    try {
      const targetId = editingId
      const resolvedDraftPoint = draftPoint
        ? {
            ...draftPoint,
            ...(await resolveCampusPositionByBuilding(draftPoint.building, {
              lat: draftPoint.lat,
              lng: draftPoint.lng,
            })),
          }
        : undefined

      if (activeView === 'delivery') {
        if (targetId) {
          await updateDeliveryParty(user, targetId, {
            title: cleanTitle,
            location: cleanLocation,
            note: cleanNote,
            mood: draftMood,
            deadlineTime: cleanScheduleTime,
            point: resolvedDraftPoint,
          })
        } else {
          const createdId = await createDeliveryParty(user, {
            title: cleanTitle,
            location: cleanLocation,
            note: cleanNote,
            mood: draftMood,
            deadlineTime: cleanScheduleTime,
            point: resolvedDraftPoint,
          })
          setSelectedId(createdId)
        }
      } else if (targetId) {
        await updateSharePost(user, targetId, {
          title: cleanTitle,
          location: cleanLocation,
          note: cleanNote,
          category: draftCategory,
          pickupTime: cleanScheduleTime,
          point: resolvedDraftPoint,
        })
      } else {
        const createdId = await createSharePost(user, {
          title: cleanTitle,
          location: cleanLocation,
          note: cleanNote,
          category: draftCategory,
          pickupTime: cleanScheduleTime,
          point: resolvedDraftPoint,
        })
        setSelectedId(createdId)
      }

      if (targetId) {
        setSelectedId(targetId)
      }

      resetComposer()
      setSubmitMessage(
        targetId
          ? activeView === 'delivery'
            ? '배달 파티를 수정했습니다.'
            : '나눔 글을 수정했습니다.'
          : activeView === 'delivery'
            ? '새 배달 파티를 등록했습니다.'
            : '새 나눔 글을 등록했습니다.',
      )
    } catch (error) {
      setSubmitMessage(
        isPermissionDeniedError(error)
          ? getFirestorePermissionHint(user.email)
          : getErrorMessage(error, '저장 중 문제가 발생했습니다.'),
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDraftPointSelect = (point: CampusPoint) => {
    setDraftPoint(point)
    setDraftLocation(`${point.building} 인근`)
  }

  const handleEditItem = (item: FeedItem) => {
    setActiveView(item.kind === 'delivery' ? 'delivery' : 'share')
    setSelectedId(item.id)
    setEditingId(item.id)
    setDraftTitle(item.kind === 'delivery' ? item.restaurant : item.title)
    setDraftLocation(item.kind === 'delivery' ? item.meetingPoint : item.location)
    setDraftPoint({
      building: item.building,
      x: item.x,
      y: item.y,
      lat: item.lat,
      lng: item.lng,
    })
    setDraftNote(item.kind === 'delivery' ? item.summary : item.note)
    if (item.kind === 'delivery') {
      setDraftMood(item.mood)
      setDraftScheduleTime(item.recruitUntilTime)
    } else {
      setDraftCategory(item.category)
      setDraftScheduleTime(item.pickupEndTime)
    }
    setSubmitMessage('')
    document.getElementById('composer-card')?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    })
  }

  const handleDeleteItem = async (item: FeedItem) => {
    if (!user || !isSchoolUser) {
      setAuthMessage(
        `글 수정과 삭제는 학교 메일(@${schoolEmailDomain})로 로그인한 뒤 사용할 수 있어요.`,
      )
      return
    }

    const confirmed = window.confirm(
      item.kind === 'delivery'
        ? '이 배달 파티를 정말 삭제할까요?'
        : '이 나눔 글을 정말 삭제할까요?',
    )

    if (!confirmed) {
      return
    }

    setIsSubmitting(true)
    setSubmitMessage('')

    try {
      if (item.kind === 'delivery') {
        await deleteDeliveryParty(item.id)
      } else {
        await deleteSharePost(item.id)
      }

      if (editingId === item.id) {
        resetComposer()
      }

      if (selectedId === item.id) {
        setSelectedId('')
      }

      setSubmitMessage(
        item.kind === 'delivery'
          ? '배달 파티를 삭제했습니다.'
          : '나눔 글을 삭제했습니다.',
      )
    } catch (error) {
      setSubmitMessage(
        isPermissionDeniedError(error)
          ? getFirestorePermissionHint(user.email)
          : getErrorMessage(error, '삭제 중 문제가 발생했습니다.'),
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSubmitJoinRequest = async () => {
    if (!selectedDeliveryParty || !user || !isSchoolUser) {
      setJoinMessage(
        `참여 요청은 학교 메일(@${schoolEmailDomain})로 로그인한 뒤 사용할 수 있어요.`,
      )
      return
    }

    const digits = normalizePhoneNumber(joinPhoneNumber)

    if (digits.length < 10 || digits.length > 11) {
      setJoinMessage('전화번호는 10자리 또는 11자리로 입력해 주세요.')
      return
    }

    setIsJoinSubmitting(true)
    setJoinMessage('')

    try {
      await submitDeliveryJoinRequest(user, selectedDeliveryParty, {
        phoneNumber: formatPhoneNumber(digits),
        note: joinRequestNote.trim() || '참여 희망합니다. 연락 부탁드립니다.',
      })
      setJoinPhoneNumber('')
      setJoinRequestNote('')
      setJoinMessage('참여 요청을 보냈습니다. 전화번호는 호스트에게만 공개됩니다.')
    } catch (error) {
      setJoinMessage(getErrorMessage(error, '참여 요청을 보내지 못했습니다.'))
    } finally {
      setIsJoinSubmitting(false)
    }
  }

  const handleApproveJoinRequest = async (requestId: string) => {
    if (!selectedDeliveryParty) {
      return
    }

    setProcessingJoinRequestId(requestId)
    setJoinMessage('')

    try {
      await approveDeliveryJoinRequest(selectedDeliveryParty.id, requestId)
      setJoinMessage('참여 요청을 승인했습니다.')
    } catch (error) {
      setJoinMessage(getErrorMessage(error, '참여 요청을 승인하지 못했습니다.'))
    } finally {
      setProcessingJoinRequestId('')
    }
  }

  const handleRejectJoinRequest = async (requestId: string) => {
    if (!selectedDeliveryParty) {
      return
    }

    setProcessingJoinRequestId(requestId)
    setJoinMessage('')

    try {
      await rejectDeliveryJoinRequest(selectedDeliveryParty.id, requestId)
      setJoinMessage('참여 요청을 거절했습니다.')
    } catch (error) {
      setJoinMessage(getErrorMessage(error, '참여 요청을 거절하지 못했습니다.'))
    } finally {
      setProcessingJoinRequestId('')
    }
  }

  const renderHeader = () => (
    <header className="topbar">
      <div>
        <p className="brand-tag">HGU Campus Commons</p>
        <Link className="brand-name" to="/">
          한동곁
        </Link>
      </div>

      <div className="topbar-actions">
        <nav className="topnav">
          <NavLink to="/" end className={({ isActive }) => (isActive ? 'is-active' : '')}>
            홈
          </NavLink>
          <NavLink to="/board" className={({ isActive }) => (isActive ? 'is-active' : '')}>
            캠퍼스 보드
          </NavLink>
          <a href="/board#composer-card">글 올리기</a>
        </nav>

        <div className="auth-card">
          <div className="auth-card__copy">
            <span className={isSchoolUser ? 'status-pill status-pill--live' : 'status-pill'}>
              {isSchoolUser ? '학교 인증 완료' : authReady ? '로그인 필요' : '상태 확인 중'}
            </span>
            <strong>{user ? user.displayName ?? '한동 학생' : '학교 계정으로 로그인'}</strong>
            <span>
              {user?.email ??
                `글쓰기와 실시간 서비스 이용은 @${schoolEmailDomain} 계정으로 로그인하면 됩니다.`}
            </span>
          </div>
          <button className="ghost-button" type="button" onClick={user ? handleSignOut : handleSignIn}>
            {user ? '로그아웃' : 'Google 로그인'}
          </button>
        </div>
      </div>
    </header>
  )

  const renderNoticeStrip = () => (
    <section className="notice-strip">
      <article className="notice-card">
        <span className="notice-label">캠퍼스 보드</span>
        <strong>
          {realtimeConnected
            ? totalLivePosts > 0
              ? `${totalLivePosts}개의 글이 실시간으로 연결되어 있습니다`
              : '아직 등록된 글이 없습니다'
            : '게시판을 불러오는 중입니다'}
        </strong>
        <p>
          {realtimeConnected
            ? totalLivePosts > 0
              ? '새 글이 등록되면 배달 동행과 리쉐어 보드에 바로 반영됩니다.'
              : '첫 배달 파티나 나눔 글이 등록되면 이 화면부터 바로 채워집니다.'
            : '잠시 후 최신 글이 자동으로 표시됩니다.'}
        </p>
      </article>
      <article className="notice-card">
        <span className="notice-label">이용 상태</span>
        <strong>
          학교 인증 {isSchoolUser ? '사용 가능' : '로그인 필요'} · 지도{' '}
          {mapStatus?.ready ? '사용 가능' : '확인 중'}
        </strong>
        <p>
          {dataError ||
            authMessage ||
            (isSchoolUser
              ? '학교 계정으로 로그인되어 새 글 등록과 실시간 피드 사용이 가능합니다.'
              : '둘러보기는 누구나 가능하고, 글쓰기는 학교 메일 로그인 후 사용할 수 있습니다.')}
        </p>
      </article>
    </section>
  )

  const homePage = (
    <div className="app-shell">
      {renderHeader()}
      {renderNoticeStrip()}

      <main id="top">
        <section className="hero-section">
          <div className="hero-copy">
            <p className="eyebrow">배달도 같이, 나눔도 가까이</p>
            <h1 className="hero-title">
              <span className="hero-title__row">
                <span className="hero-title__letter">한</span>
                <span className="hero-title__text">한 번의 주문도 함께 모이면 가볍게</span>
              </span>
              <span className="hero-title__row">
                <span className="hero-title__letter">동</span>
                <span className="hero-title__text">동선이 비슷한 학우들과 빠르게 연결되고</span>
              </span>
              <span className="hero-title__row">
                <span className="hero-title__letter">곁</span>
                <span className="hero-title__text">곁에 있는 이웃과 나눔까지 이어지는 한동곁</span>
              </span>
            </h1>
            <p className="hero-description">
              <strong>한동곁</strong>은 같이 주문할 사람을 찾고, 남는 물품을 가까운
              학우와 나누고, 수령 위치까지 한 화면에서 바로 확인할 수 있도록 만든
              한동대 생활 보드입니다.
            </p>
            <div className="hero-pill-row">
              <span className="hero-pill">배달 동행</span>
              <span className="hero-pill">리쉐어</span>
              <span className="hero-pill">직접 위치 선택</span>
              <span className="hero-pill">학교 계정 인증</span>
            </div>
            <div className="hero-actions">
              <Link className="primary-action" to="/board">
                보드 둘러보기
              </Link>
              <a className="secondary-action" href="/board#composer-card">
                바로 글 올리기
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
                <h2>지금 캠퍼스에서 열린 글</h2>
              </div>
              <span className="status-pill status-pill--live">
                {realtimeConnected ? '실시간 반영 중' : '불러오는 중'}
              </span>
            </div>
            <div className="signal-list">
              {heroSignals.map((signal) => (
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
      </main>
    </div>
  )

  const boardPage = (
    <div className="app-shell">
      {renderHeader()}
      {renderNoticeStrip()}

      <main id="top">
        <section className="panel board-page-intro">
          <div>
            <p className="eyebrow">Campus Board</p>
            <h1>배달 동행과 리쉐어를 한 곳에서 바로 확인하세요</h1>
            <p>
              지금 올라온 글을 보고, 수령 위치를 확인하고, 필요한 경우 바로 새 글을
              등록할 수 있습니다.
            </p>
          </div>
          <div className="board-page-intro__meta">
            <span className="status-pill status-pill--live">{totalLivePosts}건 연결 중</span>
            <a className="secondary-action" href="#composer-card">
              새 글 쓰기
            </a>
          </div>
        </section>

        <section className="dashboard-section" id="dashboard">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Campus Board</p>
              <h2>실제 학생 글과 수령 위치를 한 화면에서 확인하세요</h2>
            </div>
            <p>
              배달 동행과 리쉐어 글을 지도와 함께 보고, 필요한 경우 바로 새 글을
              등록할 수 있습니다.
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
                  {mapStatus?.ready ? '지도 사용 가능' : '지도 준비 중'}
                </span>
              </div>

              <CampusMap
                items={visibleItems}
                selectedId={effectiveSelectedId}
                selectedItem={selectedItem}
                onSelect={setSelectedId}
              />
            </article>

            <article className="panel detail-card">
              <div className="panel-header">
                <div>
                  <p className="panel-kicker">Post Detail</p>
                  <h3>
                    {selectedItem
                      ? selectedItem.title
                      : activeView === 'delivery'
                        ? '첫 배달 동행을 기다리는 중'
                        : '첫 나눔 글을 기다리는 중'}
                  </h3>
                </div>
                {selectedItem ? (
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
                ) : null}
              </div>

              {!selectedItem ? (
                <div className="empty-state">
                  <p className="empty-state__eyebrow">No Post Yet</p>
                  <strong>
                    {activeBoardHasPosts
                      ? '지금 필터에 맞는 글이 없습니다'
                      : activeView === 'delivery'
                        ? '아직 열린 배달 동행이 없습니다'
                        : '아직 등록된 나눔 글이 없습니다'}
                  </strong>
                  <p>
                    {activeBoardHasPosts
                      ? '다른 필터를 눌러보거나, 지금 바로 새 글을 올려서 이 보드를 채워보세요.'
                      : activeView === 'delivery'
                        ? '같이 주문할 사람을 찾고 싶다면 배달 파티를 먼저 열어보세요.'
                        : '남는 식재료나 생필품이 있다면 첫 리쉐어 글을 올려보세요.'}
                  </p>
                </div>
              ) : isDeliveryItem(selectedItem) ? (
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
                      <span>모집 인원</span>
                      <strong>
                        {selectedItem.members} / {selectedItem.capacity}
                      </strong>
                    </div>
                    <div>
                      <span>모집자</span>
                      <strong>{selectedItem.host}</strong>
                    </div>
                    <div>
                      <span>모집 마감</span>
                      <strong>{selectedItem.recruitUntil}</strong>
                    </div>
                    <div>
                      <span>등록 시각</span>
                      <strong>{selectedItem.timeLabel}</strong>
                    </div>
                  </div>
                  <div className="badge-row">
                    {selectedItem.tags.map((tag) => (
                      <span className="mini-badge" key={tag}>
                        {tag}
                      </span>
                    ))}
                  </div>
                  {isOwnedByCurrentUser ? (
                    <div className="detail-actions">
                      <button
                        className="ghost-button detail-action"
                        type="button"
                        onClick={() => handleEditItem(selectedItem)}
                      >
                        수정
                      </button>
                      <button
                        className="ghost-button detail-action is-danger"
                        type="button"
                        onClick={() => handleDeleteItem(selectedItem)}
                        disabled={isSubmitting}
                      >
                        삭제
                      </button>
                    </div>
                  ) : null}
                  {isOwnedByCurrentUser ? (
                    <div className="join-panel">
                      <div className="join-panel__header">
                        <div>
                          <strong>참여 요청 관리</strong>
                          <p>전화번호는 호스트 화면에서만 보입니다.</p>
                        </div>
                        <span className="join-count">{joinRequests.length}건</span>
                      </div>
                      {joinMessage ? <p className="join-feedback">{joinMessage}</p> : null}
                      {joinRequests.length > 0 ? (
                        <div className="join-request-list">
                          {joinRequests.map((request) => (
                            <div className="join-request-card" key={request.id}>
                              <div className="join-request-card__topline">
                                <strong>{request.requesterName}</strong>
                                <span
                                  className={`join-status-chip join-status-chip--${request.status}`}
                                >
                                  {getJoinStatusLabel(request.status)}
                                </span>
                              </div>
                              <p className="join-request-card__meta">
                                {request.submittedLabel} · {request.phoneNumber || '전화번호 없음'}
                              </p>
                              <p className="join-request-card__note">{request.note}</p>
                              {request.status === 'pending' ? (
                                <div className="join-request-actions">
                                  <button
                                    className="ghost-button detail-action"
                                    type="button"
                                    onClick={() => handleApproveJoinRequest(request.id)}
                                    disabled={processingJoinRequestId === request.id}
                                  >
                                    승인
                                  </button>
                                  <button
                                    className="ghost-button detail-action is-danger"
                                    type="button"
                                    onClick={() => handleRejectJoinRequest(request.id)}
                                    disabled={processingJoinRequestId === request.id}
                                  >
                                    거절
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="join-empty">아직 들어온 참여 요청이 없습니다.</p>
                      )}
                    </div>
                  ) : (
                    <div className="join-panel">
                      <div className="join-panel__header">
                        <div>
                          <strong>파티 참여 요청</strong>
                          <p>전화번호는 호스트에게만 공개되어 노쇼 방지에 사용됩니다.</p>
                        </div>
                        {myJoinRequest ? (
                          <span
                            className={`join-status-chip join-status-chip--${myJoinRequest.status}`}
                          >
                            {getJoinStatusLabel(myJoinRequest.status)}
                          </span>
                        ) : null}
                      </div>
                      {joinMessage ? <p className="join-feedback">{joinMessage}</p> : null}
                      {!isSchoolUser ? (
                        <p className="join-empty">
                          참여 요청은 학교 메일(@{schoolEmailDomain}) 로그인 후 사용할 수 있어요.
                        </p>
                      ) : myJoinRequest?.status === 'approved' ? (
                        <p className="join-empty">
                          참여 요청이 승인되었습니다. 이제 주문 조율을 진행하면 됩니다.
                        </p>
                      ) : myJoinRequest?.status === 'pending' ? (
                        <p className="join-empty">
                          참여 요청이 전달되었습니다. 호스트가 확인하면 상태가 업데이트됩니다.
                        </p>
                      ) : selectedItem.members >= selectedItem.capacity ? (
                        <p className="join-empty">현재 모집 인원이 모두 찼습니다.</p>
                      ) : (
                        <>
                          {myJoinRequest?.status === 'rejected' ? (
                            <p className="join-empty">
                              이전 요청이 거절되었습니다. 전화번호나 메모를 수정해 다시 요청할 수 있어요.
                            </p>
                          ) : null}
                          <label className="field-label field-label--compact">
                            전화번호
                            <input
                              value={joinPhoneNumber}
                              onChange={(event) => setJoinPhoneNumber(event.target.value)}
                              placeholder="예: 010-1234-5678"
                              inputMode="tel"
                            />
                          </label>
                          <label className="field-label field-label--compact">
                            한 줄 메모
                            <textarea
                              value={joinRequestNote}
                              onChange={(event) => setJoinRequestNote(event.target.value)}
                              placeholder="예: 2인분 중 1인 참여 희망합니다."
                              rows={3}
                            />
                          </label>
                          <button
                            className="submit-button join-submit"
                            type="button"
                            onClick={handleSubmitJoinRequest}
                            disabled={isJoinSubmitting}
                          >
                            {isJoinSubmitting ? '요청 전송 중...' : '참여 요청 보내기'}
                          </button>
                        </>
                      )}
                    </div>
                  )}
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
                      <span>작성자</span>
                      <strong>{selectedItem.owner}</strong>
                    </div>
                    <div>
                      <span>수령 가능 시간</span>
                      <strong>{selectedItem.pickupWindow}</strong>
                    </div>
                    <div>
                      <span>등록 시각</span>
                      <strong>{selectedItem.timeLabel}</strong>
                    </div>
                  </div>
                  <div className="badge-row">
                    {selectedItem.badges.map((badge) => (
                      <span className="mini-badge" key={badge}>
                        {badge}
                      </span>
                    ))}
                  </div>
                  {isOwnedByCurrentUser ? (
                    <div className="detail-actions">
                      <button
                        className="ghost-button detail-action"
                        type="button"
                        onClick={() => handleEditItem(selectedItem)}
                      >
                        수정
                      </button>
                      <button
                        className="ghost-button detail-action is-danger"
                        type="button"
                        onClick={() => handleDeleteItem(selectedItem)}
                        disabled={isSubmitting}
                      >
                        삭제
                      </button>
                    </div>
                  ) : null}
                </>
              )}
            </article>
          </div>

          <div className="bottom-grid">
            <article className="panel feed-card">
              <div className="panel-header">
                <div>
                  <p className="panel-kicker">Post List</p>
                  <h3>{activeBoardLabel} 목록</h3>
                </div>
                <span className="panel-chip">{activeBoardCount}건</span>
              </div>
              <div className="feed-list">
                {visibleItems.length > 0 ? (
                  visibleItems.map((item) => (
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
                            ? `${item.restaurant} · ${item.meetingPoint} · ${item.recruitUntilTime} 마감`
                            : `${item.location} · ${item.quantity} · ${item.pickupEndTime}까지`}
                        </p>
                      </div>
                      <span className="feed-chip">
                        {item.kind === 'delivery'
                          ? getModeLabel(item.mood)
                          : getShareLabel(item.category)}
                      </span>
                    </button>
                  ))
                ) : (
                  <div className="empty-state empty-state--list">
                    <p className="empty-state__eyebrow">Feed Empty</p>
                    <strong>
                      {activeBoardHasPosts
                        ? '선택한 조건에 맞는 글이 없습니다'
                        : activeView === 'delivery'
                          ? '아직 등록된 배달 동행이 없습니다'
                          : '아직 등록된 나눔 글이 없습니다'}
                    </strong>
                    <p>
                      {activeBoardHasPosts
                        ? '필터를 바꾸면 다른 글을 볼 수 있습니다.'
                        : activeView === 'delivery'
                          ? '메뉴와 수령 위치를 입력해 첫 배달 파티를 열어보세요.'
                          : '남는 물품이 있다면 첫 리쉐어 글을 등록해보세요.'}
                    </p>
                  </div>
                )}
              </div>
            </article>

            <form className="panel composer-card" id="composer-card" onSubmit={handleCreate}>
              <div className="panel-header">
                <div>
                  <p className="panel-kicker">New Post</p>
                  <h3>
                    {isEditing
                      ? activeView === 'delivery'
                        ? '내 배달 파티 수정'
                        : '내 나눔 글 수정'
                      : activeView === 'delivery'
                        ? '지금 배달 파티 열기'
                        : '지금 나눔 글 올리기'}
                  </h3>
                </div>
                <span className="panel-chip">
                  {isEditing ? '수정 중' : isSchoolUser ? '지금 글쓰기 가능' : '학교 로그인 필요'}
                </span>
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
                  placeholder="예: 학생회관 앞 벤치, 도서관 정문 오른쪽"
                />
              </label>

              <label className="field-label">
                {activeView === 'delivery' ? '모집 마감 시간' : '수령 가능 마감 시간'}
                <input
                  type="time"
                  value={draftScheduleTime}
                  onChange={(event) => setDraftScheduleTime(event.target.value)}
                />
              </label>

              <div className="field-meta">
                <span>
                  {draftPoint
                    ? `${draftPoint.building} 기준 좌표 선택 완료`
                    : '아직 지도에서 선택한 위치가 없습니다'}
                </span>
                {draftPoint ? (
                  <button
                    className="inline-action"
                    type="button"
                    onClick={() => setDraftPoint(null)}
                  >
                    지도 선택 초기화
                  </button>
                ) : null}
              </div>

              <div className="location-picker-card">
                <p className="picker-caption">
                  학교 배치도에서 건물을 눌러 수령 위치를 정확하게 고를 수 있습니다.
                </p>
                <LocationPickerMap
                  selectedPoint={draftPoint}
                  selectedLabel={draftLocation.trim()}
                  onSelect={handleDraftPointSelect}
                />
              </div>

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

              <button className="submit-button" type="submit" disabled={!isSchoolUser || isSubmitting}>
                {isSubmitting
                  ? '저장 중...'
                  : isEditing
                    ? '변경사항 저장'
                    : activeView === 'delivery'
                      ? '배달 파티 등록'
                      : '나눔 글 등록'}
              </button>

              {isEditing ? (
                <button
                  className="ghost-button composer-cancel"
                  type="button"
                  onClick={() => {
                    resetComposer()
                    setSubmitMessage('')
                  }}
                >
                  수정 취소
                </button>
              ) : null}

              {!isSchoolUser ? (
                <p className="helper-text">{`글 등록은 @${schoolEmailDomain} 로그인 후 사용할 수 있습니다.`}</p>
              ) : null}

              {submitMessage ? <p className="helper-text helper-text--strong">{submitMessage}</p> : null}
            </form>
          </div>
        </section>
      </main>
    </div>
  )

  return (
    <Routes>
      <Route path="/" element={homePage} />
      <Route path="/board" element={boardPage} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
