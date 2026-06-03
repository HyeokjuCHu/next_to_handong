import { useEffect, useState, type FormEvent } from 'react'
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth'
import { Link, Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import './App.css'
import { CampusMap } from './components/CampusMap'
import { LocationPickerMap } from './components/LocationPickerMap'
import {
  type CampusPoint,
  type DeliveryFilter,
  type DeliveryJoinRequest,
  type DeliveryMood,
  type DeliveryParty,
  type FeedItem,
  type PublicUserProfile,
  type ShareCategory,
  type ShareFilter,
  type SharePost,
  type SocialConversationBrief,
  type UserProfileSettings,
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
  approveDeliveryJoinRequest,
  cancelShareReservation,
  completeSharePost,
  createDeliveryParty,
  createSharePost,
  deleteDeliveryParty,
  deleteSharePost,
  listenToDeliveryParties,
  listenToMyDeliveryJoinRequest,
  listenToPartyJoinRequestsForHost,
  listenToSharePosts,
  listenToUserProfile,
  rejectDeliveryJoinRequest,
  reserveSharePost,
  saveUserProfileSettings,
  submitDeliveryJoinRequest,
  syncUserProfile,
  updateDeliveryParty,
  updateSharePost,
} from './lib/firestore'
import { resolveCampusPositionByBuilding } from './lib/campusPlaces'
import { platformReadiness } from './lib/platform'
import { getSocialConversationBrief } from './lib/social'

const deliveryFilters: Array<{ value: DeliveryFilter; label: string }> = [
  { value: 'all', label: '전체 파티' },
  { value: 'silent', label: 'Silent 주문' },
  { value: 'social', label: 'Social 식사' },
]

const deliveryCapacityOptions = [2, 3, 4, 5, 6, 7, 8]

const shareFilters: Array<{ value: ShareFilter; label: string }> = [
  { value: 'all', label: '전체 나눔' },
  { value: 'ingredient', label: '식재료' },
  { value: 'supply', label: '생필품' },
]

const profileInterestOptions = [
  '운동',
  '음악',
  '영화',
  '독서',
  '게임',
  '요리',
  '여행',
  '사진',
  '코딩',
  '디자인',
  '봉사',
  '언어',
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

function isActiveLifecycleStatus(status: FeedItem['status']) {
  return status === 'open' || status === 'reserved'
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
    return 'Firestore 권한이 거부되었습니다. 현재 로그인 계정이 없거나 인증 정보가 아직 준비되지 않았습니다.'
  }

  if (!isAllowedSchoolEmail(email)) {
    return `현재 로그인한 계정(${email})은 @${schoolEmailDomain} 학교 메일이 아니라서 Firestore 쓰기가 차단되었습니다.`
  }

  return `학교 계정(${email})으로 로그인했지만 Firestore Rules가 아직 이 계정을 허용하지 않았습니다. Firebase 콘솔에 firestore.rules를 배포했는지, 그리고 토큰 이메일이 정확히 @${schoolEmailDomain}인지 확인해 주세요.`
}

function getItemOwnerId(item: FeedItem) {
  return item.kind === 'delivery' ? item.hostId : item.ownerId
}

function getShareStatusLabel(post: SharePost, nowMs: number) {
  if (post.status === 'reserved') {
    return '예약중'
  }

  if (post.status === 'completed') {
    return '나눔 완료'
  }

  if (post.expiresAtMs <= nowMs) {
    return '시간 종료'
  }

  return getShareLabel(post.category)
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

type TimelineView = 'current' | 'past'

function createEmptyProfileDraft(): UserProfileSettings {
  return {
    studentId: '',
    bio: '',
    hometown: '',
    major: '',
    interests: [],
  }
}

function createProfileDraftFromProfile(profile: PublicUserProfile | null): UserProfileSettings {
  if (!profile) {
    return createEmptyProfileDraft()
  }

  return {
    studentId: profile.studentId,
    bio: profile.bio,
    hometown: profile.hometown,
    major: profile.major,
    interests: profile.interests,
  }
}

function parseInterestText(value: string) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item, index, array) => item.length > 0 && array.indexOf(item) === index)
}

function formatInterestText(interests: string[]) {
  return interests.join(', ')
}

function isArchivedItem(item: FeedItem, nowMs: number) {
  if (isDeliveryItem(item) && item.members >= item.capacity) {
    return true
  }

  return !isActiveLifecycleStatus(item.status) || item.expiresAtMs <= nowMs
}

function getArchiveLabel(item: FeedItem, nowMs: number) {
  if (item.status === 'reserved') {
    return '예약중'
  }

  if (item.status === 'completed') {
    return '완료됨'
  }

  if (item.status === 'closed') {
    return '마감됨'
  }

  if (isDeliveryItem(item) && item.members >= item.capacity) {
    return '마감됨'
  }

  if (item.expiresAtMs <= nowMs) {
    return '시간 종료'
  }

  return '지난 글'
}

function hasProfileDetails(profile: PublicUserProfile | null) {
  if (!profile) {
    return false
  }

  return Boolean(
    profile.studentId ||
      profile.bio ||
      profile.hometown ||
      profile.major ||
      profile.interests.length > 0,
  )
}

function getParticipantSummary(profile: SocialConversationBrief['participants'][number]) {
  const summary = [
    profile.studentId ? `${profile.studentId}` : '',
    profile.major ? `전공 ${profile.major}` : '',
    profile.hometown ? `고향 ${profile.hometown}` : '',
  ].filter(Boolean)

  return summary.length > 0 ? summary.join(' · ') : '추가 프로필 정보가 아직 없습니다.'
}

function createGenericSocialBrief(partyId: string): SocialConversationBrief {
  return {
    partyId,
    participants: [],
    prompts: [
      '한동대에서 요즘 제일 자주 가는 공간은 어디인가요?',
      '이번 학기에 가장 기억에 남는 수업이나 과제가 있었나요?',
      '포항에서 자주 가는 맛집이나 카페가 있나요?',
      '요즘 쉬는 시간이나 주말에 자주 하는 일이 있나요?',
    ],
    usedFallbackPrompt: true,
  }
}

function App() {
  const navigate = useNavigate()
  const [activeView, setActiveView] = useState<ViewMode>('delivery')
  const [timelineView, setTimelineView] = useState<TimelineView>('current')
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
  const [draftCapacity, setDraftCapacity] = useState(4)
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
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [profileSnapshot, setProfileSnapshot] = useState<PublicUserProfile | null>(null)
  const [profileDraft, setProfileDraft] = useState<UserProfileSettings>(
    createEmptyProfileDraft(),
  )
  const [profileInterestsText, setProfileInterestsText] = useState('')
  const [profileMessage, setProfileMessage] = useState('')
  const [isProfileSaving, setIsProfileSaving] = useState(false)
  const [socialBriefByPartyId, setSocialBriefByPartyId] = useState<
    Record<string, SocialConversationBrief>
  >({})
  const [socialBriefLoading, setSocialBriefLoading] = useState(false)
  const [socialBriefMessage, setSocialBriefMessage] = useState('')
  const [shareActionMessage, setShareActionMessage] = useState('')
  const [isShareActionSubmitting, setIsShareActionSubmitting] = useState(false)

  const isSchoolUser = isAllowedSchoolEmail(user?.email)
  const realtimeConnected = deliveryListenerReady && shareListenerReady
  const currentDeliveryFeed = deliveryFeed.filter((item) => !isArchivedItem(item, nowMs))
  const pastDeliveryFeed = deliveryFeed.filter((item) => isArchivedItem(item, nowMs))
  const currentShareFeed = shareFeed.filter((item) => !isArchivedItem(item, nowMs))
  const pastShareFeed = shareFeed.filter((item) => isArchivedItem(item, nowMs))
  const sourceDelivery = timelineView === 'current' ? currentDeliveryFeed : pastDeliveryFeed
  const sourceShare = timelineView === 'current' ? currentShareFeed : pastShareFeed
  const visibleDelivery = sourceDelivery.filter(
    (party) => deliveryFilter === 'all' || party.mood === deliveryFilter,
  )
  const visibleShare = sourceShare.filter(
    (post) => shareFilter === 'all' || post.category === shareFilter,
  )
  const visibleItems = activeView === 'delivery' ? visibleDelivery : visibleShare
  const effectiveSelectedId = visibleItems.some((item) => item.id === selectedId)
    ? selectedId
    : visibleItems[0]?.id
  const selectedItem =
    visibleItems.find((item) => item.id === effectiveSelectedId) ?? visibleItems[0] ?? null
  const selectedDeliveryParty =
    selectedItem && isDeliveryItem(selectedItem) ? selectedItem : null
  const selectedSharePost =
    selectedItem && !isDeliveryItem(selectedItem) ? selectedItem : null
  const activeBoardLabel = activeView === 'delivery' ? '배달 동행' : '리쉐어 보드'
  const activeBoardCount = visibleItems.length
  const totalCurrentPosts = currentDeliveryFeed.length + currentShareFeed.length
  const totalPastPosts = pastDeliveryFeed.length + pastShareFeed.length
  const activeBoardHasPosts = activeView === 'delivery' ? sourceDelivery.length > 0 : sourceShare.length > 0
  const isEditing = editingId !== null
  const editingDeliveryParty =
    activeView === 'delivery' && editingId
      ? deliveryFeed.find((item) => item.id === editingId) ?? null
      : null
  const draftCapacityMinimum = editingDeliveryParty?.members ?? 2
  const isOwnedByCurrentUser = Boolean(
    user && selectedItem && getItemOwnerId(selectedItem) === user.uid,
  )
  const isSelectedArchived = Boolean(selectedItem && isArchivedItem(selectedItem, nowMs))
  const isShareReservedByCurrentUser = Boolean(
    selectedSharePost && user && selectedSharePost.reservedById === user.uid,
  )
  const profileReady = hasProfileDetails(profileSnapshot)
  const canCurrentUserViewSocialBrief = Boolean(
    selectedDeliveryParty &&
      selectedDeliveryParty.mood === 'social' &&
      selectedDeliveryParty.members > 1 &&
      user &&
      isSchoolUser &&
      (selectedDeliveryParty.hostId === user.uid || myJoinRequest?.status === 'approved'),
  )
  const socialBriefCacheKey = selectedDeliveryParty
    ? [
        selectedDeliveryParty.id,
        selectedDeliveryParty.members,
        selectedDeliveryParty.hostId,
        myJoinRequest?.status ?? 'none',
      ].join(':')
    : ''
  const socialBrief = socialBriefCacheKey ? socialBriefByPartyId[socialBriefCacheKey] ?? null : null
  const mapStatus = platformReadiness.find((item) => item.id === 'kakao')
  const landingMetrics = [
    {
      label: '배달 동행',
      value: `${currentDeliveryFeed.length}건`,
      caption: '진행 중',
      tone: 'green',
    },
    {
      label: '리쉐어',
      value: `${currentShareFeed.length}건`,
      caption: '나눔 가능',
      tone: 'green',
    },
    {
      label: '전체',
      value: `${totalCurrentPosts}건`,
      caption: '현재 활동',
      tone: 'orange',
    },
  ]
  const landingDeliveryItems = currentDeliveryFeed.slice(0, 2)
  const landingShareItems = currentShareFeed.slice(0, 2)
  const landingMapItems: FeedItem[] = [...currentDeliveryFeed, ...currentShareFeed]
  const landingSelectedItem =
    landingMapItems.find((item) => item.id === selectedId) ?? landingMapItems[0] ?? null
  const landingSelectedId = landingSelectedItem?.id ?? ''
  const selectedProfileInterests = parseInterestText(profileInterestsText)

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
          `학교 메일(@${schoolEmailDomain}) 계정만 글쓰기와 실시간 기능에 사용할 수 있어요.`,
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
    const timer = window.setInterval(() => {
      setNowMs(Date.now())
    }, 60000)

    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!user?.uid || !isSchoolUser) {
      setProfileSnapshot(null)
      setProfileDraft(createEmptyProfileDraft())
      setProfileInterestsText('')
      return
    }

    return listenToUserProfile(
      user.uid,
      (profile) => {
        setProfileSnapshot(profile)
        const nextDraft = createProfileDraftFromProfile(profile)
        setProfileDraft(nextDraft)
        setProfileInterestsText(formatInterestText(nextDraft.interests))
      },
      (error) => {
        setProfileMessage(getErrorMessage(error, '프로필을 불러오지 못했습니다.'))
      },
    )
  }, [isSchoolUser, user?.uid])

  useEffect(() => {
    if (visibleItems.length === 0) {
      if (selectedId) {
        setSelectedId('')
      }
      return
    }

    if (!visibleItems.some((item) => item.id === selectedId)) {
      setSelectedId(visibleItems[0].id)
    }
  }, [selectedId, visibleItems])

  useEffect(() => {
    setJoinPhoneNumber('')
    setJoinRequestNote('')
    setJoinMessage('')
    setShareActionMessage('')
    setJoinRequests([])
    setMyJoinRequest(null)
    setSocialBriefMessage('')
  }, [effectiveSelectedId, user?.uid])

  useEffect(() => {
    if (!selectedDeliveryParty || !user || !isSchoolUser) {
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

  useEffect(() => {
    if (!selectedDeliveryParty || selectedDeliveryParty.mood !== 'social') {
      setSocialBriefLoading(false)
      setSocialBriefMessage('')
      return
    }

    if (!canCurrentUserViewSocialBrief) {
      setSocialBriefLoading(false)
      return
    }

    const cacheKey = [
      selectedDeliveryParty.id,
      selectedDeliveryParty.members,
      selectedDeliveryParty.hostId,
      myJoinRequest?.status ?? 'none',
    ].join(':')

    if (socialBriefByPartyId[cacheKey]) {
      setSocialBriefLoading(false)
      setSocialBriefMessage('')
      return
    }

    let cancelled = false

    setSocialBriefLoading(true)
    setSocialBriefMessage('')

    void getSocialConversationBrief(selectedDeliveryParty.id)
      .then((brief) => {
        if (cancelled) {
          return
        }

        setSocialBriefByPartyId((current) => ({
          ...current,
          [cacheKey]: brief,
        }))
      })
      .catch((error) => {
        if (cancelled) {
          return
        }

        setSocialBriefByPartyId((current) => ({
          ...current,
          [cacheKey]: createGenericSocialBrief(selectedDeliveryParty.id),
        }))
        setSocialBriefMessage(
          getErrorMessage(
            error,
            'AI 추천 연결에 문제가 있어 기본 질문으로 먼저 보여드리고 있습니다.',
          ),
        )
      })
      .finally(() => {
        if (!cancelled) {
          setSocialBriefLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [canCurrentUserViewSocialBrief, myJoinRequest?.status, selectedDeliveryParty, socialBriefByPartyId])

  const resetComposer = (view: ViewMode = activeView) => {
    setEditingId(null)
    setDraftTitle('')
    setDraftLocation('')
    setDraftPoint(null)
    setDraftNote('')
    setDraftScheduleTime(getDefaultScheduleTime(view))
    setDraftMood('silent')
    setDraftCapacity(4)
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
          `학교 메일(@${schoolEmailDomain}) 계정만 글쓰기와 실시간 기능에 사용할 수 있어요.`,
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
    setProfileMessage('')
  }

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitMessage('')

    const cleanTitle = draftTitle.trim()
    const cleanLocation =
      draftLocation.trim() ||
      (draftPoint ? `${draftPoint.building} 인근 직접 지정` : '학생회관 앞')
    const cleanNote = draftNote.trim()
    const cleanScheduleTime = draftScheduleTime || getDefaultScheduleTime(activeView)
    const currentEditingDelivery =
      activeView === 'delivery' && editingId
        ? deliveryFeed.find((item) => item.id === editingId)
        : null
    const cleanCapacity =
      activeView === 'delivery'
        ? Math.max(
            currentEditingDelivery?.members ?? 2,
            Math.min(8, Math.max(2, Math.trunc(draftCapacity))),
          )
        : 4

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
            capacity: cleanCapacity,
            point: resolvedDraftPoint,
          })
        } else {
          const createdId = await createDeliveryParty(user, {
            title: cleanTitle,
            location: cleanLocation,
            note: cleanNote,
            mood: draftMood,
            deadlineTime: cleanScheduleTime,
            capacity: cleanCapacity,
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

      setTimelineView('current')

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
    setTimelineView(isArchivedItem(item, nowMs) ? 'past' : 'current')
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
      setDraftCapacity(Math.max(item.capacity, item.members))
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

    if (isSelectedArchived) {
      setJoinMessage('지난 글은 새 참여 요청을 받을 수 없습니다.')
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

  const handleReserveSharePost = async () => {
    if (!selectedSharePost || !user || !isSchoolUser) {
      setShareActionMessage(
        `리쉐어 예약은 학교 메일(@${schoolEmailDomain})로 로그인한 뒤 사용할 수 있어요.`,
      )
      return
    }

    if (isSelectedArchived) {
      setShareActionMessage('지난 글은 새 예약을 받을 수 없습니다.')
      return
    }

    setIsShareActionSubmitting(true)
    setShareActionMessage('')

    try {
      await reserveSharePost(user, selectedSharePost)
      setShareActionMessage('예약했습니다. 이제 이 글은 예약중으로 표시됩니다.')
    } catch (error) {
      setShareActionMessage(getErrorMessage(error, '예약 처리에 실패했습니다.'))
    } finally {
      setIsShareActionSubmitting(false)
    }
  }

  const handleCancelShareReservation = async () => {
    if (!selectedSharePost || !user || !isSchoolUser) {
      setShareActionMessage('예약 해제는 로그인 후 사용할 수 있습니다.')
      return
    }

    setIsShareActionSubmitting(true)
    setShareActionMessage('')

    try {
      await cancelShareReservation(user, selectedSharePost)
      setShareActionMessage('예약을 해제했습니다. 다시 예약 가능한 상태로 열렸습니다.')
    } catch (error) {
      setShareActionMessage(getErrorMessage(error, '예약을 해제하지 못했습니다.'))
    } finally {
      setIsShareActionSubmitting(false)
    }
  }

  const handleCompleteSharePost = async () => {
    if (!selectedSharePost || !user || !isSchoolUser) {
      setShareActionMessage('나눔 완료 처리는 로그인 후 사용할 수 있습니다.')
      return
    }

    const confirmed = window.confirm('이 나눔 글을 완료 처리할까요? 지난 글로 이동합니다.')

    if (!confirmed) {
      return
    }

    setIsShareActionSubmitting(true)
    setShareActionMessage('')

    try {
      await completeSharePost(selectedSharePost.id)
      setTimelineView('past')
      setShareActionMessage('나눔을 완료 처리했습니다.')
    } catch (error) {
      setShareActionMessage(getErrorMessage(error, '나눔 완료 처리에 실패했습니다.'))
    } finally {
      setIsShareActionSubmitting(false)
    }
  }

  const handleSaveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!user || !isSchoolUser) {
      setProfileMessage(
        `프로필 설정은 학교 메일(@${schoolEmailDomain})로 로그인한 뒤 사용할 수 있어요.`,
      )
      return
    }

    setIsProfileSaving(true)
    setProfileMessage('')

    try {
      const nextInterests = parseInterestText(profileInterestsText)
      const nextDraft = {
        studentId: profileDraft.studentId.trim(),
        bio: profileDraft.bio.trim(),
        hometown: profileDraft.hometown.trim(),
        major: profileDraft.major.trim(),
        interests: nextInterests,
      } satisfies UserProfileSettings

      await saveUserProfileSettings(user, nextDraft)
      setProfileDraft(nextDraft)
      setProfileInterestsText(formatInterestText(nextInterests))
      setProfileMessage('프로필을 저장했습니다. Social 식사 추천에 바로 반영됩니다.')
    } catch (error) {
      setProfileMessage(getErrorMessage(error, '프로필을 저장하지 못했습니다.'))
    } finally {
      setIsProfileSaving(false)
    }
  }

  const toggleProfileInterest = (interest: string) => {
    const currentInterests = parseInterestText(profileInterestsText)
    const nextInterests = currentInterests.includes(interest)
      ? currentInterests.filter((item) => item !== interest)
      : [...currentInterests, interest]

    setProfileInterestsText(formatInterestText(nextInterests))
  }

  const renderHeader = () => (
    <header className="site-header">
      <div className="site-header__inner">
        <Link className="site-brand" to="/">
          <span className="site-brand__mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" role="img">
              <path d="M9 11.5a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z" />
              <path d="M15.8 12.2a2.55 2.55 0 1 0 0-5.1 2.55 2.55 0 0 0 0 5.1Z" />
              <path d="M3.8 19.2c.45-3.05 2.45-5.05 5.2-5.05s4.75 2 5.2 5.05H3.8Z" />
              <path d="M13.8 19.2c-.16-1.42-.62-2.64-1.34-3.61.86-.86 1.98-1.32 3.34-1.32 2.25 0 3.93 1.85 4.32 4.93h-6.32Z" />
            </svg>
          </span>
          <span>한띵동</span>
        </Link>

        <nav className="site-nav" aria-label="주요 메뉴">
          <Link className="site-nav__button site-nav__button--primary" to="/board">
            보드 보기
          </Link>
          <Link className="site-nav__button" to="/profile">
            프로필
          </Link>
        </nav>
      </div>
    </header>
  )

  const renderStatusAlert = () => (
    dataError || authMessage ? (
      <section className="status-alert page-container">
        <p>{dataError || authMessage}</p>
      </section>
    ) : null
  )

  const renderSocialPanel = () => {
    if (!selectedDeliveryParty || selectedDeliveryParty.mood !== 'social') {
      return null
    }

    const waitingForMorePeople = selectedDeliveryParty.members <= 1

    return (
      <div className="social-panel">
        <div className="join-panel__header">
          <strong>같이 먹기 대화 거리</strong>
          <div className="social-panel__meta">
            {socialBrief ? (
              <span className="panel-chip">
                {socialBrief.usedFallbackPrompt ? '가벼운 질문' : '맞춤 질문'}
              </span>
            ) : null}
            <span className="join-count">{selectedDeliveryParty.members}명</span>
          </div>
        </div>

        {!isSchoolUser ? (
          <p className="join-empty">학교 계정 로그인 후 Social 식사 추천을 확인할 수 있어요.</p>
        ) : waitingForMorePeople ? (
          <p className="join-empty">승인된 참여자가 한 명 이상 생기면 대화 추천이 자동으로 준비됩니다.</p>
        ) : !canCurrentUserViewSocialBrief ? (
          <p className="join-empty">승인된 참여자와 모집자에게만 대화 추천이 열립니다.</p>
        ) : socialBriefLoading && !socialBrief ? (
          <p className="join-empty">참여자 프로필을 읽고 대화 거리를 만드는 중입니다.</p>
        ) : socialBrief ? (
          <>
            <div className="participant-grid">
              {socialBrief.participants.map((participant) => (
                <article className="participant-card" key={participant.uid}>
                  <div className="participant-card__topline">
                    <strong>{participant.displayName}</strong>
                    <span className="mini-badge">
                      {participant.role === 'host' ? '모집자' : '참여자'}
                    </span>
                  </div>
                  <p className="participant-card__meta">{getParticipantSummary(participant)}</p>
                  {participant.bio ? (
                    <p className="participant-card__bio">{participant.bio}</p>
                  ) : null}
                  {participant.interests.length > 0 ? (
                    <div className="badge-row social-badge-row">
                      {participant.interests.map((interest) => (
                        <span className="mini-badge" key={`${participant.uid}-${interest}`}>
                          {interest}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
            <div className="prompt-list">
              {socialBrief.prompts.map((prompt, index) => (
                <article className="prompt-card" key={`${selectedDeliveryParty.id}-${index}`}>
                  <span>Q{index + 1}</span>
                  <p>{prompt}</p>
                </article>
              ))}
            </div>
            {socialBriefMessage ? <p className="helper-text">{socialBriefMessage}</p> : null}
          </>
        ) : socialBriefMessage ? (
          <p className="join-empty">{socialBriefMessage}</p>
        ) : (
          <p className="join-empty">대화 추천을 준비하는 중입니다.</p>
        )}
      </div>
    )
  }

  const renderLandingCard = (item: FeedItem) => (
    <Link
      className="landing-post-card"
      key={item.id}
      to="/board"
      onClick={() => {
        setActiveView(item.kind === 'delivery' ? 'delivery' : 'share')
        setTimelineView('current')
        setSelectedId(item.id)
      }}
    >
      <div className="landing-post-card__top">
        <strong>{item.title}</strong>
        <span>
          {item.kind === 'delivery'
            ? getModeLabel(item.mood)
            : getShareStatusLabel(item, nowMs)}
        </span>
      </div>
      <p>
        {item.kind === 'delivery'
          ? `${item.meetingPoint} · ${item.recruitUntilTime} 마감`
          : `${item.location} · ${item.quantity}`}
      </p>
      <div className="landing-post-card__bottom">
        <span>{item.kind === 'delivery' ? `${item.members}/${item.capacity}명` : item.owner}</span>
        <span>상세보기</span>
      </div>
    </Link>
  )

  const renderLandingEmptyCard = (label: string) => (
    <div className="landing-post-card landing-post-card--empty">
      <strong>{label}</strong>
      <p>새 글이 올라오면 이곳에 바로 표시됩니다.</p>
    </div>
  )

  const handleLandingMapSelect = (id: string) => {
    const item = landingMapItems.find((candidate) => candidate.id === id)

    if (!item) {
      return
    }

    setActiveView(item.kind === 'delivery' ? 'delivery' : 'share')
    setTimelineView('current')
    setSelectedId(id)
    navigate('/board')
  }

  const homePage = (
    <div className="app-shell">
      {renderHeader()}
      {renderStatusAlert()}

      <main id="top" className="home-page page-container">
        <section className="landing-title">
          <h1>
            HAN CAMPUS BOARD
            <span>한띵동</span>
          </h1>
          <p>한동대학교 학생을 위한 캠퍼스 생활 웹 보드</p>
        </section>

        <section className="landing-stats" aria-label="현재 보드 현황">
          {landingMetrics.map((metric) => (
            <article className="landing-stat-card" key={metric.label}>
              <span>{metric.label}</span>
              <strong className={`landing-stat-card__value landing-stat-card__value--${metric.tone}`}>
                {metric.value}
              </strong>
              <p>{metric.caption}</p>
            </article>
          ))}
        </section>

        <section className="landing-cta">
          <svg viewBox="0 0 48 48" aria-hidden="true">
            <path d="M24 5 28.8 19.2 43 24l-14.2 4.8L24 43l-4.8-14.2L5 24l14.2-4.8L24 5Z" />
            <path d="M39 8v8M35 12h8M10 34v6M7 37h6" />
          </svg>
          <h2>지금 시작하세요</h2>
          <p>배달 동행으로 함께 주문하고, 리쉐어로 필요한 물건을 나눠보세요</p>
          <Link className="landing-cta__button" to="/board">
            보드 둘러보기
          </Link>
        </section>

        <section className="landing-board">
          <div className="landing-section-title">
            <h2>캠퍼스 보드</h2>
            <span>{realtimeConnected ? '현재 진행 중' : '불러오는 중'}</span>
          </div>
          <div className="landing-map-shell">
            <CampusMap
              items={landingMapItems}
              selectedId={landingSelectedId}
              selectedItem={landingSelectedItem ?? undefined}
              onSelect={handleLandingMapSelect}
            />
          </div>
        </section>

        <section className="landing-list-section">
          <div className="landing-list-header">
            <h2>배달 동행</h2>
            <Link to="/board">전체 보기</Link>
          </div>
          <div className="landing-card-grid">
            {landingDeliveryItems.length > 0
              ? landingDeliveryItems.map(renderLandingCard)
              : renderLandingEmptyCard('아직 열린 배달 동행이 없습니다')}
          </div>
        </section>

        <section className="landing-list-section">
          <div className="landing-list-header">
            <h2>리쉐어</h2>
            <Link
              to="/board"
              onClick={() => {
                setActiveView('share')
                setTimelineView('current')
              }}
            >
              전체 보기
            </Link>
          </div>
          <div className="landing-card-grid">
            {landingShareItems.length > 0
              ? landingShareItems.map(renderLandingCard)
              : renderLandingEmptyCard('아직 등록된 리쉐어가 없습니다')}
          </div>
        </section>
      </main>
    </div>
  )

  const boardPage = (
    <div className="app-shell">
      {renderHeader()}
      {renderStatusAlert()}

      <main id="top" className="page-container board-main">
        <section className="panel board-page-intro">
          <div>
            <p className="eyebrow">Campus Board</p>
            <h1>캠퍼스 보드</h1>
          </div>
          <div className="board-page-intro__meta">
            <span className="status-pill status-pill--live">현재 {totalCurrentPosts}건</span>
            <span className="status-pill">지난 {totalPastPosts}건</span>
            <span className="status-pill">{isSchoolUser ? '학교 인증' : '둘러보기'}</span>
          </div>
        </section>

        <section className="dashboard-section" id="dashboard">
          <div className="section-heading section-heading--compact">
            <div>
              <p className="eyebrow">Campus Board</p>
              <h2>{activeBoardLabel}</h2>
            </div>
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

            <div className="board-control-stack">
              <div className="segmented-control">
                <button
                  type="button"
                  className={timelineView === 'current' ? 'is-active' : ''}
                  onClick={() => setTimelineView('current')}
                >
                  현재 글
                </button>
                <button
                  type="button"
                  className={timelineView === 'past' ? 'is-active' : ''}
                  onClick={() => setTimelineView('past')}
                >
                  지난 글
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
          </div>

          <div className="top-grid">
            <article className="panel map-card">
              <div className="panel-header">
                <div>
                  <p className="panel-kicker">Campus Pick-up Map</p>
                  <h3>{`${activeBoardLabel} 지도`}</h3>
                </div>
                <div className="detail-chip-group">
                  <span className="panel-chip">{timelineView === 'current' ? '현재 글' : '지난 글'}</span>
                  <span className="panel-chip">
                    {mapStatus?.ready ? '지도 사용 가능' : '지도 준비 중'}
                  </span>
                </div>
              </div>

              <CampusMap
                items={visibleItems}
                selectedId={effectiveSelectedId}
                selectedItem={selectedItem ?? undefined}
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
                      : timelineView === 'current'
                        ? activeView === 'delivery'
                          ? '첫 배달 동행을 기다리는 중'
                          : '첫 나눔 글을 기다리는 중'
                        : '지난 글을 기다리는 중'}
                  </h3>
                </div>
                {selectedItem ? (
                  <div className="detail-chip-group">
                    {isSelectedArchived ? (
                      <span className="status-pill">{getArchiveLabel(selectedItem, nowMs)}</span>
                    ) : null}
                    <span
                      className={
                        isDeliveryItem(selectedItem)
                          ? `status-pill status-pill--${selectedItem.mood}`
                          : selectedItem.status === 'reserved'
                            ? 'status-pill status-pill--reserved'
                            : `status-pill status-pill--${selectedItem.category}`
                      }
                    >
                      {isDeliveryItem(selectedItem)
                        ? getModeLabel(selectedItem.mood)
                        : getShareStatusLabel(selectedItem, nowMs)}
                    </span>
                  </div>
                ) : null}
              </div>

              {!selectedItem ? (
                <div className="empty-state">
                  <p className="empty-state__eyebrow">No Post Yet</p>
                  <strong>
                    {activeBoardHasPosts
                      ? '지금 필터에 맞는 글이 없습니다'
                      : timelineView === 'current'
                        ? activeView === 'delivery'
                          ? '아직 열린 배달 동행이 없습니다'
                          : '아직 등록된 나눔 글이 없습니다'
                        : '아직 지난 글 기록이 없습니다'}
                  </strong>
                  <p>
                    {activeBoardHasPosts
                      ? '다른 필터를 눌러보거나, 지금 바로 새 글을 올려서 이 보드를 채워보세요.'
                      : timelineView === 'current'
                        ? activeView === 'delivery'
                          ? '같이 주문할 사람을 찾고 싶다면 배달 파티를 먼저 열어보세요.'
                          : '남는 식재료나 생필품이 있다면 첫 리쉐어 글을 올려보세요.'
                        : '시간이 지난 글은 여기로 자동으로 모입니다.'}
                  </p>
                </div>
              ) : isDeliveryItem(selectedItem) ? (
                <>
                  {isSelectedArchived ? (
                    <div className="archive-banner">
                      <strong>{getArchiveLabel(selectedItem, nowMs)}</strong>
                      <p>이 글은 현재 모집 목록에서는 빠졌고, 기록 확인용으로만 보입니다.</p>
                    </div>
                  ) : null}
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

                  {renderSocialPanel()}

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
                          <p>전화번호는 호스트 화면에서만 보여 노쇼 방지에 사용됩니다.</p>
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
                                <span className={`join-status-chip join-status-chip--${request.status}`}>
                                  {getJoinStatusLabel(request.status)}
                                </span>
                              </div>
                              <p className="join-request-card__meta">
                                {request.submittedLabel} · {request.phoneNumber || '전화번호 없음'}
                              </p>
                              <p className="join-request-card__note">{request.note}</p>
                              {request.status === 'pending' && !isSelectedArchived ? (
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
                          <span className={`join-status-chip join-status-chip--${myJoinRequest.status}`}>
                            {getJoinStatusLabel(myJoinRequest.status)}
                          </span>
                        ) : null}
                      </div>
                      {joinMessage ? <p className="join-feedback">{joinMessage}</p> : null}
                      {!isSchoolUser ? (
                        <p className="join-empty">
                          참여 요청은 학교 메일(@{schoolEmailDomain}) 로그인 후 사용할 수 있어요.
                        </p>
                      ) : isSelectedArchived ? (
                        <p className="join-empty">지난 글은 새 참여 요청을 받을 수 없습니다.</p>
                      ) : myJoinRequest?.status === 'approved' ? (
                        <p className="join-empty">
                          참여 요청이 승인되었습니다. Social 식사라면 위 대화 추천도 함께 활용해 보세요.
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
                              placeholder="예: 1인 참여 희망합니다. 늦지 않게 갈게요."
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
                  {isSelectedArchived ? (
                    <div className="archive-banner">
                      <strong>{getArchiveLabel(selectedItem, nowMs)}</strong>
                      <p>이 글은 현재 나눔 목록에서는 빠졌고, 지난 기록으로만 확인할 수 있습니다.</p>
                    </div>
                  ) : null}
                  <p className="detail-copy">{selectedItem.note}</p>
                  <div className="detail-grid">
                    <div>
                      <span>품목 구분</span>
                      <strong>{getShareLabel(selectedItem.category)}</strong>
                    </div>
                    <div>
                      <span>진행 상태</span>
                      <strong>{getShareStatusLabel(selectedItem, nowMs)}</strong>
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
                      <span>예약자</span>
                      <strong>{selectedItem.reservedByName || '아직 없음'}</strong>
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
                  <div className="join-panel">
                    <div className="join-panel__header">
                      <div>
                        <strong>리쉐어 상태</strong>
                        <p>
                          {selectedItem.status === 'reserved'
                            ? selectedItem.reservedByName
                              ? `${selectedItem.reservedByName}님이 예약 중입니다.`
                              : '현재 예약이 진행 중입니다.'
                            : '필요한 학생이 바로 예약할 수 있습니다.'}
                        </p>
                      </div>
                      <span
                        className={
                          selectedItem.status === 'reserved'
                            ? 'join-status-chip join-status-chip--approved'
                            : 'join-status-chip join-status-chip--pending'
                        }
                      >
                        {selectedItem.status === 'reserved' ? '예약중' : '예약 가능'}
                      </span>
                    </div>
                    {shareActionMessage ? <p className="join-feedback">{shareActionMessage}</p> : null}
                    {isOwnedByCurrentUser ? (
                      <div className="share-action-group">
                        {!isSelectedArchived ? (
                          <button
                            className="ghost-button detail-action"
                            type="button"
                            onClick={handleCompleteSharePost}
                            disabled={isSubmitting || isShareActionSubmitting}
                          >
                            {isShareActionSubmitting ? '처리 중...' : '나눔 완료'}
                          </button>
                        ) : null}
                        {!isSelectedArchived && selectedItem.status === 'reserved' ? (
                          <button
                            className="ghost-button detail-action"
                            type="button"
                            onClick={handleCancelShareReservation}
                            disabled={isSubmitting || isShareActionSubmitting}
                          >
                            {isShareActionSubmitting ? '처리 중...' : '예약 해제'}
                          </button>
                        ) : null}
                      </div>
                    ) : !isSchoolUser ? (
                      <p className="join-empty">
                        예약은 학교 메일(@{schoolEmailDomain}) 로그인 후 사용할 수 있어요.
                      </p>
                    ) : isSelectedArchived ? (
                      <p className="join-empty">지난 글은 새 예약을 받을 수 없습니다.</p>
                    ) : selectedItem.status === 'open' ? (
                      <button
                        className="submit-button join-submit"
                        type="button"
                        onClick={handleReserveSharePost}
                        disabled={isShareActionSubmitting}
                      >
                        {isShareActionSubmitting ? '예약 중...' : '예약하기'}
                      </button>
                    ) : isShareReservedByCurrentUser ? (
                      <div className="share-action-group">
                        <p className="join-empty">내가 예약한 글입니다. 필요하면 예약을 취소할 수 있어요.</p>
                        <button
                          className="ghost-button detail-action"
                          type="button"
                          onClick={handleCancelShareReservation}
                          disabled={isShareActionSubmitting}
                        >
                          {isShareActionSubmitting ? '처리 중...' : '예약 취소'}
                        </button>
                      </div>
                    ) : (
                      <p className="join-empty">
                        다른 학우가 예약 중입니다
                        {selectedItem.reservedAtLabel ? ` · ${selectedItem.reservedAtLabel}` : ''}.
                      </p>
                    )}
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
                  <h3>{`${activeBoardLabel} 목록`}</h3>
                </div>
                <div className="detail-chip-group">
                  <span className="panel-chip">{timelineView === 'current' ? '현재 글' : '지난 글'}</span>
                  <span className="panel-chip">{activeBoardCount}건</span>
                </div>
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
                        {timelineView === 'past'
                          ? getArchiveLabel(item, nowMs)
                          : item.kind === 'delivery'
                            ? getModeLabel(item.mood)
                            : getShareStatusLabel(item, nowMs)}
                      </span>
                    </button>
                  ))
                ) : (
                  <div className="empty-state empty-state--list">
                    <p className="empty-state__eyebrow">Feed Empty</p>
                    <strong>
                      {activeBoardHasPosts
                        ? '선택한 조건에 맞는 글이 없습니다'
                        : timelineView === 'current'
                          ? activeView === 'delivery'
                            ? '아직 등록된 배달 동행이 없습니다'
                            : '아직 등록된 나눔 글이 없습니다'
                          : '아직 지난 글이 없습니다'}
                    </strong>
                    <p>
                      {activeBoardHasPosts
                        ? '필터를 바꾸면 다른 글을 볼 수 있습니다.'
                        : timelineView === 'current'
                          ? activeView === 'delivery'
                            ? '메뉴와 수령 위치를 입력해 첫 배달 파티를 열어보세요.'
                            : '남는 물품이 있다면 첫 리쉐어 글을 등록해보세요.'
                          : '모집 시간이 지난 글은 여기에 자동으로 쌓입니다.'}
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

              {activeView === 'delivery' ? (
                <label className="field-label">
                  모집 인원
                  <select
                    value={draftCapacity}
                    onChange={(event) => setDraftCapacity(Number(event.target.value))}
                  >
                    {deliveryCapacityOptions.map((capacity) => (
                      <option
                        key={capacity}
                        value={capacity}
                        disabled={capacity < draftCapacityMinimum}
                      >
                        총 {capacity}명
                      </option>
                    ))}
                  </select>
                  <span className="field-help">
                    모집자를 포함한 총 인원입니다.
                    {editingDeliveryParty && editingDeliveryParty.members > 1
                      ? ` 현재 ${editingDeliveryParty.members}명이 승인되어 그보다 작게 줄일 수 없습니다.`
                      : ''}
                  </span>
                </label>
              ) : null}

              <div className="field-meta">
                <span>
                  {draftPoint
                    ? `${draftPoint.building} 기준 좌표 선택 완료`
                    : '아직 지도에서 선택한 위치가 없습니다'}
                </span>
                {draftPoint ? (
                  <button className="inline-action" type="button" onClick={() => setDraftPoint(null)}>
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
                      ? '예: 순살 선호, 수령 후 같이 먹을 분은 Social로 참여해 주세요'
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

              {activeView === 'delivery' && draftMood === 'social' ? (
                <p className="helper-text">
                  Social 식사는 승인된 참여자가 생기면 프로필을 바탕으로 대화거리를 자동 추천합니다.
                </p>
              ) : null}

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

  const profilePage = (
    <div className="app-shell">
      <main id="top" className="profile-screen">
        <div className="profile-titlebar">
          <Link className="profile-back-link" to="/">
            <span aria-hidden="true">←</span>
            <span>프로필 설정</span>
          </Link>
          {user ? (
            <div className="profile-titlebar__actions">
              <span className="profile-status-chip">{profileReady ? '저장 완료' : '선택 입력'}</span>
              <button className="profile-logout-button" type="button" onClick={handleSignOut}>
                로그아웃
              </button>
            </div>
          ) : (
            <span className="profile-status-chip">{authReady ? '로그인 전' : '확인 중'}</span>
          )}
        </div>

        {renderStatusAlert()}

        {!isSchoolUser ? (
          <section className="profile-card profile-login-card">
            <h1>학교 계정으로 로그인</h1>
            <p>@{schoolEmailDomain} 계정으로 로그인하면 프로필을 저장할 수 있습니다.</p>
            <button
              className="profile-save-button"
              type="button"
              onClick={handleSignIn}
              disabled={!authReady}
            >
              {authReady ? 'Google 로그인' : '로그인 준비 중...'}
            </button>
          </section>
        ) : (
          <form className="profile-card profile-form-card" onSubmit={handleSaveProfile}>
            <label className="profile-field">
              <span>
                학번 <em>*</em>
              </span>
              <input
                value={profileDraft.studentId}
                onChange={(event) =>
                  setProfileDraft((current) => ({ ...current, studentId: event.target.value }))
                }
                placeholder="예: 22100123"
              />
            </label>

            <label className="profile-field">
              <span>
                전공 <em>*</em>
              </span>
              <input
                value={profileDraft.major}
                onChange={(event) =>
                  setProfileDraft((current) => ({ ...current, major: event.target.value }))
                }
                placeholder="예: 전산전자공학부"
              />
            </label>

            <label className="profile-field">
              <span>고향</span>
              <input
                value={profileDraft.hometown}
                onChange={(event) =>
                  setProfileDraft((current) => ({ ...current, hometown: event.target.value }))
                }
                placeholder="예: 서울"
              />
            </label>

            <div className="profile-field">
              <span>관심사 (복수 선택 가능)</span>
              <div className="profile-interest-grid">
                {profileInterestOptions.map((interest) => {
                  const isSelected = selectedProfileInterests.includes(interest)

                  return (
                    <button
                      className={isSelected ? 'profile-interest-chip is-selected' : 'profile-interest-chip'}
                      key={interest}
                      type="button"
                      onClick={() => toggleProfileInterest(interest)}
                    >
                      {interest}
                    </button>
                  )
                })}
              </div>
            </div>

            <label className="profile-field">
              <span>한 줄 소개</span>
              <textarea
                value={profileDraft.bio}
                onChange={(event) =>
                  setProfileDraft((current) => ({ ...current, bio: event.target.value }))
                }
                placeholder="자신을 소개하는 한 줄을 적어주세요"
                rows={4}
              />
            </label>

            <button className="profile-save-button" type="submit" disabled={isProfileSaving}>
              <span aria-hidden="true">▣</span>
              {isProfileSaving ? '저장 중...' : '저장하기'}
            </button>

            {profileMessage ? <p className="profile-message">{profileMessage}</p> : null}
          </form>
        )}
      </main>
    </div>
  )

  return (
    <Routes>
      <Route path="/" element={homePage} />
      <Route path="/board" element={boardPage} />
      <Route path="/profile" element={profilePage} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
