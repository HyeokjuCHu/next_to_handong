import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  type DocumentData,
  type Unsubscribe,
} from 'firebase/firestore'
import type { User } from 'firebase/auth'
import {
  type CampusPoint,
  type DeliveryJoinRequest,
  type PublicUserProfile,
  resolveCampusPoint,
  type DeliveryMood,
  type DeliveryParty,
  type JoinRequestStatus,
  type PostLifecycleStatus,
  type ShareCategory,
  type SharePost,
  type UserProfileSettings,
} from '../data/campusData'
import { db, isFirebaseConfigured } from './firebase'

interface CreateDeliveryInput {
  title: string
  location: string
  note: string
  mood: DeliveryMood
  deadlineTime: string
  point?: CampusPoint
}

interface CreateShareInput {
  title: string
  location: string
  note: string
  category: ShareCategory
  pickupTime: string
  point?: CampusPoint
}

interface CreateJoinRequestInput {
  phoneNumber: string
  note: string
}

function getTimestampMs(value: unknown, fallback = Date.now()) {
  const timestamp = value as { toDate?: () => Date } | null

  if (!timestamp || typeof timestamp.toDate !== 'function') {
    return fallback
  }

  return timestamp.toDate().getTime()
}

function buildExpiryMs(time: string, baseMs = Date.now()) {
  const [hoursText = '0', minutesText = '0'] = time.split(':')
  const hours = Number.parseInt(hoursText, 10)
  const minutes = Number.parseInt(minutesText, 10)
  const baseDate = new Date(baseMs)

  const expiresAt = new Date(
    baseDate.getFullYear(),
    baseDate.getMonth(),
    baseDate.getDate(),
    Number.isFinite(hours) ? hours : 0,
    Number.isFinite(minutes) ? minutes : 0,
    0,
    0,
  )

  return expiresAt.getTime()
}

function asPostStatus(value: unknown, fallback: PostLifecycleStatus = 'open') {
  return value === 'closed' || value === 'completed' || value === 'expired' || value === 'open'
    ? value
    : fallback
}

function asString(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback
}

function asNumber(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function asStringArray(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) {
    return fallback
  }

  const filtered = value.filter(
    (item): item is string => typeof item === 'string' && item.trim().length > 0,
  )

  return filtered.length > 0 ? filtered : fallback
}

function formatRelativeTime(value: unknown) {
  const timestamp = value as { toDate?: () => Date } | null

  if (!timestamp || typeof timestamp.toDate !== 'function') {
    return '방금 등록됨'
  }

  const date = timestamp.toDate()
  const diffMs = Date.now() - date.getTime()
  const diffMinutes = Math.floor(diffMs / 60000)

  if (diffMinutes < 1) {
    return '방금 전'
  }

  if (diffMinutes < 60) {
    return `${diffMinutes}분 전`
  }

  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) {
    return `${diffHours}시간 전`
  }

  const diffDays = Math.floor(diffHours / 24)
  return `${diffDays}일 전`
}

function formatDisplayName(user: User) {
  return asString(user.displayName, '한동 학생')
}

function formatRecruitUntil(time: string) {
  return `오늘 ${time}까지 모집`
}

function formatPickupWindow(time: string) {
  return `오늘 ${time}까지 수령 가능`
}

function mapUserProfileDoc(id: string, raw: DocumentData): PublicUserProfile {
  return {
    uid: id,
    displayName: asString(raw.displayName, '한동 학생'),
    photoURL: asString(raw.photoURL, ''),
    mannerTemperature: asNumber(raw.mannerTemperature, 36.5),
    studentId: asString(raw.studentId, ''),
    bio: asString(raw.bio, ''),
    hometown: asString(raw.hometown, ''),
    major: asString(raw.major, ''),
    interests: asStringArray(raw.interests, []),
  }
}

function mapJoinRequestDoc(id: string, raw: DocumentData): DeliveryJoinRequest {
  const status = asString(raw.status, 'pending')

  return {
    id,
    requesterId: asString(raw.requesterId, id),
    requesterName: asString(raw.requesterName, '한동 학생'),
    note: asString(raw.note, '연락 부탁드립니다.'),
    status:
      status === 'approved' || status === 'rejected' ? status : 'pending',
    submittedLabel: formatRelativeTime(raw.createdAt),
  }
}

function mapDeliveryDoc(id: string, raw: DocumentData): DeliveryParty {
  const meetingPoint = asString(raw.meetingPoint, '학생회관 앞')
  const point = resolveCampusPoint(asString(raw.building, meetingPoint))
  const recruitUntilTime = asString(raw.recruitUntilTime, '18:30')
  const createdAtMs = getTimestampMs(raw.createdAt)

  return {
    kind: 'delivery',
    id,
    hostId: asString(raw.hostId, ''),
    status: asPostStatus(raw.status, 'open'),
    title: asString(raw.title, '제목 없는 배달 파티'),
    restaurant: asString(raw.restaurant, '음식점 미정'),
    meetingPoint,
    building: point.building,
    x: asNumber(raw.x, point.x),
    y: asNumber(raw.y, point.y),
    lat: asNumber(raw.lat, point.lat),
    lng: asNumber(raw.lng, point.lng),
    mood: raw.mood === 'social' ? 'social' : 'silent',
    eta: asString(raw.eta, '18분 내 도착'),
    feeSavings: asString(raw.feeSavings, '예상 절약 2,500원'),
    members: asNumber(raw.members, 1),
    capacity: asNumber(raw.capacity, 4),
    host: asString(raw.host, '한동 학생'),
    hostTrust: asNumber(raw.hostTrust, 36.5),
    timeLabel: formatRelativeTime(raw.createdAt),
    tags: asStringArray(raw.tags, ['실시간 모집', '캠퍼스 수령']),
    chatPreview: asStringArray(raw.chatPreview, ['채팅 메시지가 아직 없어요.']),
    summary: asString(raw.summary, '실시간 배달 동행을 위한 모집 글입니다.'),
    recruitUntil: asString(raw.recruitUntil, formatRecruitUntil(recruitUntilTime)),
    recruitUntilTime,
    pickupSlot: asString(raw.pickupSlot, '오늘 저녁'),
    createdAtMs,
    expiresAtMs: asNumber(raw.expiresAtMs, buildExpiryMs(recruitUntilTime, createdAtMs)),
  }
}

function mapShareDoc(id: string, raw: DocumentData): SharePost {
  const location = asString(raw.location, '학생회관 앞')
  const point = resolveCampusPoint(asString(raw.building, location))
  const pickupEndTime = asString(raw.pickupEndTime, '21:00')
  const createdAtMs = getTimestampMs(raw.createdAt)

  return {
    kind: 'share',
    id,
    ownerId: asString(raw.ownerId, ''),
    status: asPostStatus(raw.status, 'open'),
    title: asString(raw.title, '제목 없는 나눔 글'),
    category: raw.category === 'supply' ? 'supply' : 'ingredient',
    location,
    building: point.building,
    x: asNumber(raw.x, point.x),
    y: asNumber(raw.y, point.y),
    lat: asNumber(raw.lat, point.lat),
    lng: asNumber(raw.lng, point.lng),
    quantity: asString(raw.quantity, '소분 가능'),
    pickupWindow: asString(raw.pickupWindow, formatPickupWindow(pickupEndTime)),
    trust: asNumber(raw.trust, 36.5),
    badges: asStringArray(raw.badges, ['소량 나눔', '캠퍼스 거래']),
    timeLabel: formatRelativeTime(raw.createdAt),
    note: asString(raw.note, '필요한 분이 먼저 메시지 주시면 맞춰드릴게요.'),
    owner: asString(raw.owner, '한동 학생'),
    distance: asString(raw.distance, '도보 3분'),
    pickupEndTime,
    createdAtMs,
    expiresAtMs: asNumber(raw.expiresAtMs, buildExpiryMs(pickupEndTime, createdAtMs)),
  }
}

function noopUnsubscribe(): Unsubscribe {
  return () => undefined
}

export function listenToDeliveryParties(
  onData: (items: DeliveryParty[]) => void,
  onError: (error: Error) => void,
) {
  if (!db || !isFirebaseConfigured) {
    return noopUnsubscribe()
  }

  return onSnapshot(
    query(collection(db, 'deliveryParties'), orderBy('createdAt', 'desc'), limit(30)),
    (snapshot) => {
      const items = snapshot.docs
        .map((entry) => mapDeliveryDoc(entry.id, entry.data()))
        
      onData(items)
    },
    (error) => onError(error),
  )
}

export function listenToSharePosts(
  onData: (items: SharePost[]) => void,
  onError: (error: Error) => void,
) {
  if (!db || !isFirebaseConfigured) {
    return noopUnsubscribe()
  }

  return onSnapshot(
    query(collection(db, 'sharePosts'), orderBy('createdAt', 'desc'), limit(30)),
    (snapshot) => {
      const items = snapshot.docs
        .map((entry) => mapShareDoc(entry.id, entry.data()))
        
      onData(items)
    },
    (error) => onError(error),
  )
}

export function listenToPartyJoinRequestsForHost(
  partyId: string,
  onData: (items: DeliveryJoinRequest[]) => void,
  onError: (error: Error) => void,
) {
  if (!db || !isFirebaseConfigured || !partyId) {
    return noopUnsubscribe()
  }

  let currentRequests: DeliveryJoinRequest[] = []
  let phoneByRequestId = new Map<string, string>()

  const emit = () => {
    onData(
      currentRequests.map((request) => ({
        ...request,
        phoneNumber: phoneByRequestId.get(request.id) ?? '',
      })),
    )
  }

  const unsubscribeRequests = onSnapshot(
    query(
      collection(db, 'deliveryParties', partyId, 'joinRequests'),
      orderBy('createdAt', 'desc'),
    ),
    (snapshot) => {
      currentRequests = snapshot.docs.map((entry) =>
        mapJoinRequestDoc(entry.id, entry.data()),
      )
      emit()
    },
    (error) => onError(error),
  )

  const unsubscribeContacts = onSnapshot(
    collection(db, 'deliveryParties', partyId, 'joinContacts'),
    (snapshot) => {
      phoneByRequestId = new Map(
        snapshot.docs.map((entry) => [
          entry.id,
          asString(entry.data().phoneNumber, ''),
        ]),
      )
      emit()
    },
    (error) => onError(error),
  )

  return () => {
    unsubscribeRequests()
    unsubscribeContacts()
  }
}

export function listenToMyDeliveryJoinRequest(
  partyId: string,
  userId: string,
  onData: (item: DeliveryJoinRequest | null) => void,
  onError: (error: Error) => void,
) {
  if (!db || !isFirebaseConfigured || !partyId || !userId) {
    return noopUnsubscribe()
  }

  return onSnapshot(
    doc(db, 'deliveryParties', partyId, 'joinRequests', userId),
    (snapshot) => {
      if (!snapshot.exists()) {
        onData(null)
        return
      }

      onData(mapJoinRequestDoc(snapshot.id, snapshot.data()))
    },
    (error) => onError(error),
  )
}

export function listenToUserProfile(
  userId: string,
  onData: (item: PublicUserProfile | null) => void,
  onError: (error: Error) => void,
) {
  if (!db || !isFirebaseConfigured || !userId) {
    return noopUnsubscribe()
  }

  return onSnapshot(
    doc(db, 'usersPublic', userId),
    (snapshot) => {
      if (!snapshot.exists()) {
        onData(null)
        return
      }

      onData(mapUserProfileDoc(snapshot.id, snapshot.data()))
    },
    (error) => onError(error),
  )
}

export async function saveUserProfileSettings(
  user: User,
  input: UserProfileSettings,
) {
  if (!db || !isFirebaseConfigured) {
    throw new Error('Firebase가 아직 설정되지 않았어요.')
  }

  const interests = input.interests
    .map((item) => item.trim())
    .filter((item, index, array) => item.length > 0 && array.indexOf(item) === index)

  await setDoc(
    doc(db, 'usersPublic', user.uid),
    {
      uid: user.uid,
      displayName: formatDisplayName(user),
      email: user.email ?? '',
      photoURL: user.photoURL ?? '',
      studentId: input.studentId.trim(),
      bio: input.bio.trim(),
      hometown: input.hometown.trim(),
      major: input.major.trim(),
      interests,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  )
}

export async function syncUserProfile(user: User) {
  if (!db || !isFirebaseConfigured) {
    return
  }

  await setDoc(
    doc(db, 'usersPublic', user.uid),
    {
      uid: user.uid,
      displayName: formatDisplayName(user),
      email: user.email ?? '',
      photoURL: user.photoURL ?? '',
      mannerTemperature: 36.5,
      campusId: 'handong',
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    },
    { merge: true },
  )
}

export async function createDeliveryParty(user: User, input: CreateDeliveryInput) {
  if (!db || !isFirebaseConfigured) {
    throw new Error('Firebase가 아직 설정되지 않았어요.')
  }

  const point = input.point ?? resolveCampusPoint(input.location)
  const expiresAtMs = buildExpiryMs(input.deadlineTime)
  const docRef = await addDoc(collection(db, 'deliveryParties'), {
    title: `${input.title} 파티`,
    restaurant: input.title,
    meetingPoint: input.location,
    building: point.building,
    x: point.x,
    y: point.y,
    lat: point.lat,
    lng: point.lng,
    mood: input.mood,
    eta: '18분 내 도착',
    feeSavings: '예상 절약 2,500원',
    members: 1,
    capacity: 4,
    host: formatDisplayName(user),
    hostTrust: 36.5,
    tags:
      input.mood === 'silent'
        ? ['음식만 같이 주문', '빠른 모집', '새 글']
        : ['함께 식사 가능', '빠른 모집', '새 글'],
    chatPreview:
      input.mood === 'silent'
        ? ['방금 새 파티를 열었어요.', '받고 바로 해산해도 편하게 참여할 수 있어요.']
        : ['방금 새 파티를 열었어요.', '수령 후 같이 식사할 분도 환영해요.'],
    summary: input.note || '메뉴 조율은 채팅에서 빠르게 정할 수 있어요.',
    recruitUntilTime: input.deadlineTime,
    recruitUntil: formatRecruitUntil(input.deadlineTime),
    pickupSlot: '오늘 저녁',
    hostId: user.uid,
    campusId: 'handong',
    visibility: 'public',
    status: 'open',
    expiresAtMs,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })

  return docRef.id
}

export async function submitDeliveryJoinRequest(
  user: User,
  party: DeliveryParty,
  input: CreateJoinRequestInput,
) {
  if (!db || !isFirebaseConfigured) {
    throw new Error('Firebase가 아직 설정되지 않았어요.')
  }

  const requestRef = doc(db, 'deliveryParties', party.id, 'joinRequests', user.uid)
  const contactRef = doc(db, 'deliveryParties', party.id, 'joinContacts', user.uid)

  await setDoc(
    requestRef,
    {
      requesterId: user.uid,
      requesterName: formatDisplayName(user),
      note: input.note.trim(),
      status: 'pending' satisfies JoinRequestStatus,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  )

  await setDoc(
    contactRef,
    {
      requesterId: user.uid,
      phoneNumber: input.phoneNumber.trim(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  )
}

export async function createSharePost(user: User, input: CreateShareInput) {
  if (!db || !isFirebaseConfigured) {
    throw new Error('Firebase가 아직 설정되지 않았어요.')
  }

  const point = input.point ?? resolveCampusPoint(input.location)
  const expiresAtMs = buildExpiryMs(input.pickupTime)
  const docRef = await addDoc(collection(db, 'sharePosts'), {
    title: input.title,
    category: input.category,
    location: input.location,
    building: point.building,
    x: point.x,
    y: point.y,
    lat: point.lat,
    lng: point.lng,
    quantity: input.category === 'ingredient' ? '소분 가능' : '상태 양호',
    pickupWindow: formatPickupWindow(input.pickupTime),
    pickupEndTime: input.pickupTime,
    trust: 36.5,
    badges:
      input.category === 'ingredient'
        ? ['소량 나눔', '식재료', '새 글']
        : ['생활필수', '생필품', '새 글'],
    note: input.note || '필요한 분이 먼저 메시지 주시면 맞춰드릴게요.',
    owner: formatDisplayName(user),
    distance: '도보 4분',
    ownerId: user.uid,
    campusId: 'handong',
    visibility: 'public',
    status: 'open',
    expiresAtMs,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })

  return docRef.id
}

export async function updateDeliveryParty(
  user: User,
  partyId: string,
  input: CreateDeliveryInput,
) {
  if (!db || !isFirebaseConfigured) {
    throw new Error('Firebase가 아직 설정되지 않았어요.')
  }

  const point = input.point ?? resolveCampusPoint(input.location)
  const expiresAtMs = buildExpiryMs(input.deadlineTime)
  await updateDoc(doc(db, 'deliveryParties', partyId), {
    title: `${input.title} 파티`,
    restaurant: input.title,
    meetingPoint: input.location,
    building: point.building,
    x: point.x,
    y: point.y,
    lat: point.lat,
    lng: point.lng,
    mood: input.mood,
    host: formatDisplayName(user),
    recruitUntilTime: input.deadlineTime,
    recruitUntil: formatRecruitUntil(input.deadlineTime),
    tags:
      input.mood === 'silent'
        ? ['음식만 같이 주문', '빠른 모집', '수정됨']
        : ['함께 식사 가능', '빠른 모집', '수정됨'],
    summary: input.note || '메뉴 조율은 채팅에서 빠르게 정할 수 있어요.',
    expiresAtMs,
    updatedAt: serverTimestamp(),
  })
}

export async function updateSharePost(
  user: User,
  postId: string,
  input: CreateShareInput,
) {
  if (!db || !isFirebaseConfigured) {
    throw new Error('Firebase가 아직 설정되지 않았어요.')
  }

  const point = input.point ?? resolveCampusPoint(input.location)
  const expiresAtMs = buildExpiryMs(input.pickupTime)
  await updateDoc(doc(db, 'sharePosts', postId), {
    title: input.title,
    category: input.category,
    location: input.location,
    building: point.building,
    x: point.x,
    y: point.y,
    lat: point.lat,
    lng: point.lng,
    owner: formatDisplayName(user),
    pickupWindow: formatPickupWindow(input.pickupTime),
    pickupEndTime: input.pickupTime,
    badges:
      input.category === 'ingredient'
        ? ['소량 나눔', '식재료', '수정됨']
        : ['생활필수', '생필품', '수정됨'],
    note: input.note || '필요한 분이 먼저 메시지 주시면 맞춰드릴게요.',
    expiresAtMs,
    updatedAt: serverTimestamp(),
  })
}

export async function approveDeliveryJoinRequest(
  partyId: string,
  requestId: string,
) {
  if (!db || !isFirebaseConfigured) {
    throw new Error('Firebase가 아직 설정되지 않았어요.')
  }

  const firestore = db

  await runTransaction(firestore, async (transaction) => {
    const partyRef = doc(firestore, 'deliveryParties', partyId)
    const requestRef = doc(
      firestore,
      'deliveryParties',
      partyId,
      'joinRequests',
      requestId,
    )
    const partySnapshot = await transaction.get(partyRef)
    const requestSnapshot = await transaction.get(requestRef)

    if (!partySnapshot.exists()) {
      throw new Error('배달 파티를 찾을 수 없어요.')
    }

    if (!requestSnapshot.exists()) {
      throw new Error('참여 요청을 찾을 수 없어요.')
    }

    const partyData = partySnapshot.data()
    const requestData = requestSnapshot.data()
    const status = asString(requestData.status, 'pending')
    const members = asNumber(partyData.members, 1)
    const capacity = asNumber(partyData.capacity, 4)

    if (status === 'approved') {
      return
    }

    if (members >= capacity) {
      throw new Error('모집 인원이 이미 가득 찼어요.')
    }

    transaction.update(requestRef, {
      status: 'approved',
      updatedAt: serverTimestamp(),
    })

    transaction.update(partyRef, {
      members: members + 1,
      updatedAt: serverTimestamp(),
    })
  })
}

export async function rejectDeliveryJoinRequest(
  partyId: string,
  requestId: string,
) {
  if (!db || !isFirebaseConfigured) {
    throw new Error('Firebase가 아직 설정되지 않았어요.')
  }

  const firestore = db

  await updateDoc(doc(firestore, 'deliveryParties', partyId, 'joinRequests', requestId), {
    status: 'rejected',
    updatedAt: serverTimestamp(),
  })
}

export async function deleteDeliveryParty(partyId: string) {
  if (!db || !isFirebaseConfigured) {
    throw new Error('Firebase가 아직 설정되지 않았어요.')
  }

  await deleteDoc(doc(db, 'deliveryParties', partyId))
}

export async function deleteSharePost(postId: string) {
  if (!db || !isFirebaseConfigured) {
    throw new Error('Firebase가 아직 설정되지 않았어요.')
  }

  await deleteDoc(doc(db, 'sharePosts', postId))
}
