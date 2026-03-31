export type ViewMode = 'delivery' | 'share'
export type DeliveryMood = 'silent' | 'social'
export type ShareCategory = 'ingredient' | 'supply'
export type DeliveryFilter = 'all' | DeliveryMood
export type ShareFilter = 'all' | ShareCategory
export type JoinRequestStatus = 'pending' | 'approved' | 'rejected'

export interface CampusLocation {
  label: string
  pickerLabel?: string
  aliases: readonly string[]
  x: number
  y: number
  lat: number
  lng: number
  hitbox?: CampusHitbox
}

export interface CampusPoint {
  building: string
  x: number
  y: number
  lat: number
  lng: number
}

export interface DeliveryParty extends CampusPoint {
  kind: 'delivery'
  id: string
  hostId: string
  title: string
  restaurant: string
  meetingPoint: string
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
  recruitUntil: string
  recruitUntilTime: string
  pickupSlot: string
}

export interface SharePost extends CampusPoint {
  kind: 'share'
  id: string
  ownerId: string
  title: string
  category: ShareCategory
  location: string
  quantity: string
  pickupWindow: string
  trust: number
  badges: string[]
  timeLabel: string
  note: string
  owner: string
  distance: string
  pickupEndTime: string
}

export interface DeliveryJoinRequest {
  id: string
  requesterId: string
  requesterName: string
  note: string
  phoneNumber?: string
  status: JoinRequestStatus
  submittedLabel: string
}

export type FeedItem = DeliveryParty | SharePost

interface CampusHitbox {
  left: number
  right: number
  top: number
  bottom: number
}

export const campusCenter = {
  lat: 36.1030892,
  lng: 129.3884513,
}

const campusGeoBounds = {
  northLat: 36.10418,
  southLat: 36.10178,
  westLng: 129.38695,
  eastLng: 129.39015,
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function geoFromRelativePosition(x: number, y: number) {
  const clampedX = clamp(x, 0, 100)
  const clampedY = clamp(y, 0, 100)

  return {
    lat:
      campusGeoBounds.northLat -
      (clampedY / 100) * (campusGeoBounds.northLat - campusGeoBounds.southLat),
    lng:
      campusGeoBounds.westLng +
      (clampedX / 100) * (campusGeoBounds.eastLng - campusGeoBounds.westLng),
  }
}

const rawCampusLocations = [
  {
    label: '운동장',
    aliases: ['운동장', '메인 운동장', 'stadium'],
    x: 6,
    y: 13,
  },
  {
    label: '그레이스홀',
    aliases: ['그레이스홀', 'kgh', 'grace hall'],
    x: 4,
    y: 96,
    hitbox: { left: 0, right: 9, top: 90, bottom: 100 },
  },
  {
    label: '느헤미야',
    aliases: ['느헤미야', '느헤미야홀', 'nmh', 'nehemiah'],
    x: 14,
    y: 27,
    hitbox: { left: 6, right: 22, top: 18, bottom: 36 },
  },
  {
    label: '올네이션스홀',
    pickerLabel: '올네이션스',
    aliases: ['올네이션스홀', 'anh', 'all nations hall'],
    x: 10.5,
    y: 61,
    hitbox: { left: 6, right: 15, top: 44, bottom: 78 },
  },
  {
    label: '뉴턴홀',
    aliases: ['뉴턴홀', 'nth', 'newton hall'],
    x: 20.5,
    y: 50,
    hitbox: { left: 16, right: 25, top: 45, bottom: 55 },
  },
  {
    label: '코너스톤',
    pickerLabel: '코너스톤',
    aliases: ['코너스톤', 'cornerstone', '코너스톤홀', '저너스홀', 'csh', 'jurners hall'],
    x: 16,
    y: 81,
    hitbox: { left: 12, right: 20, top: 76, bottom: 86 },
  },
  {
    label: '오석관',
    aliases: ['오석관', 'oh', 'osok hall', '오석관 입구'],
    x: 25.5,
    y: 69.5,
    hitbox: { left: 21, right: 30, top: 55, bottom: 84 },
  },
  {
    label: '현동홀',
    aliases: ['현동홀', '한동홀', 'hdh', 'handong hall'],
    x: 37,
    y: 16.5,
    hitbox: { left: 25, right: 49, top: 7, bottom: 26 },
  },
  {
    label: 'GLC',
    aliases: ['glc', '이공학관', '이공학관(로뎀)'],
    x: 59,
    y: 6.5,
    hitbox: { left: 53, right: 64, top: 1, bottom: 12 },
  },
  {
    label: 'HCA',
    aliases: ['hca', '효암채플', '효암관'],
    x: 69,
    y: 6.5,
    hitbox: { left: 64, right: 74, top: 1, bottom: 12 },
  },
  {
    label: '로뎀잔디',
    aliases: ['로뎀잔디', '로뎀 잔디', '잔디광장', 'rodem lawn'],
    x: 37,
    y: 43,
    hitbox: { left: 27, right: 47, top: 28, bottom: 58 },
  },
  {
    label: '평봉필드',
    aliases: ['평봉필드', '평봉', '필드', '운동장 필드'],
    x: 62,
    y: 35.5,
    hitbox: { left: 52, right: 72, top: 13, bottom: 58 },
  },
  {
    label: '학관',
    aliases: ['학관', 'su', 'student union'],
    x: 61.5,
    y: 71.5,
    hitbox: { left: 53, right: 70, top: 58, bottom: 85 },
  },
  {
    label: '산학협력관',
    pickerLabel: '산협관',
    aliases: ['산학협력관', '산학협력', 'industry cooperation'],
    x: 81.5,
    y: 22.5,
    hitbox: { left: 76, right: 87, top: 18, bottom: 27 },
  },
  {
    label: '헤브론홀',
    aliases: ['헤브론홀', '헤브론', 'hebron hall', 'eben', '에벤에셀', '에벤에셀관'],
    x: 93,
    y: 22,
    hitbox: { left: 88, right: 98, top: 17, bottom: 27 },
  },
  {
    label: '비전관',
    aliases: ['비전관', 'vision', 'vision hall', '토레이 rc', '토레이rc', '토레이', 'toray rc', '도레이 rc', '도레이rc', '도레이', 'dorei rc'],
    x: 89.5,
    y: 35.5,
    hitbox: { left: 81, right: 98, top: 31, bottom: 40 },
  },
  {
    label: '창조관',
    aliases: ['창조관', '창조'],
    x: 89.5,
    y: 48.5,
    hitbox: { left: 81, right: 98, top: 44, bottom: 53 },
  },
  {
    label: '벧엘관',
    aliases: ['벧엘관', 'bethel', '벧엘관 로비', '손양원 rc', '손양원rc', '손양원'],
    x: 89.5,
    y: 61.5,
    hitbox: { left: 81, right: 98, top: 57, bottom: 66 },
  },
  {
    label: '로뎀관',
    aliases: ['로뎀관', '로뎀', 'rodem hall', '열송학사 rc', '열송학사rc', '열송학사'],
    x: 89.5,
    y: 74.5,
    hitbox: { left: 81, right: 98, top: 70, bottom: 79 },
  },
  {
    label: '국제관',
    aliases: ['국제관', 'international hall', '카마이클 rc', '카마이클rc', '카마이클'],
    x: 89.5,
    y: 86,
    hitbox: { left: 81, right: 98, top: 83, bottom: 92 },
  },
  {
    label: '카이퍼 RC',
    pickerLabel: '카이퍼',
    aliases: ['카이퍼 rc', '카이퍼rc', '카이퍼'],
    x: 70,
    y: 96,
    hitbox: { left: 62, right: 79, top: 92, bottom: 100 },
  },
  {
    label: '은혜관',
    aliases: ['은혜관', 'grace hall annex', '장기려 rc', '장기려rc', '장기려'],
    x: 89.5,
    y: 96,
    hitbox: { left: 81, right: 98, top: 93, bottom: 100 },
  },
  {
    label: '학생회관',
    aliases: ['학생회관', 'student center', '학생회관 앞'],
    x: 43,
    y: 88,
  },
  {
    label: '도서관',
    aliases: ['도서관', 'library', '중앙도서관'],
    x: 35,
    y: 88,
  },
] as const

export const campusLocations: CampusLocation[] = rawCampusLocations.map((location) => ({
  ...location,
  ...geoFromRelativePosition(location.x, location.y),
}))

export const campusLandmarks = campusLocations.map((location) => ({
  label: location.label,
  x: location.x,
  y: location.y,
}))

const campusLocationsByLabel = new Map(
  campusLocations.map((location) => [location.label, location] as const),
)

function normalizePlace(value: string) {
  return value.toLowerCase().replace(/\s+/g, '')
}

function buildCampusPoint(location: CampusLocation): CampusPoint {
  return {
    building: location.label,
    x: location.x,
    y: location.y,
    lat: location.lat,
    lng: location.lng,
  }
}

function getImageDistance(location: CampusLocation, x: number, y: number) {
  const centerDistance = (location.x - x) ** 2 + (location.y - y) ** 2

  if (!location.hitbox) {
    return centerDistance
  }

  const dx =
    x < location.hitbox.left
      ? location.hitbox.left - x
      : x > location.hitbox.right
        ? x - location.hitbox.right
        : 0
  const dy =
    y < location.hitbox.top
      ? location.hitbox.top - y
      : y > location.hitbox.bottom
        ? y - location.hitbox.bottom
        : 0
  const hitboxDistance = dx ** 2 + dy ** 2

  return hitboxDistance * 100 + centerDistance
}

function resolveLocationFromImagePosition(x: number, y: number) {
  const clampedX = clamp(x, 0, 100)
  const clampedY = clamp(y, 0, 100)

  return campusLocations.reduce((closest, current) =>
    getImageDistance(current, clampedX, clampedY) <
    getImageDistance(closest, clampedX, clampedY)
      ? current
      : closest,
  )
}

export function resolveCampusPointFromImagePosition(x: number, y: number): CampusPoint {
  return buildCampusPoint(resolveLocationFromImagePosition(x, y))
}

export function resolveCampusPoint(place: string) {
  const normalizedPlace = normalizePlace(place)
  const matched =
    campusLocations.find((location) =>
      [location.label, ...location.aliases].some((alias) =>
        normalizedPlace.includes(normalizePlace(alias)),
      ),
    ) ?? campusLocationsByLabel.get('학관')!

  return buildCampusPoint(matched)
}

export function projectCampusCoordinates(lat: number, lng: number) {
  return {
    x: clamp(
      ((lng - campusGeoBounds.westLng) /
        (campusGeoBounds.eastLng - campusGeoBounds.westLng)) *
        100,
      0,
      100,
    ),
    y: clamp(
      ((campusGeoBounds.northLat - lat) /
        (campusGeoBounds.northLat - campusGeoBounds.southLat)) *
        100,
      0,
      100,
    ),
  }
}

export function unprojectCampusCoordinates(x: number, y: number) {
  return geoFromRelativePosition(x, y)
}

export function resolveNearestCampusPoint(lat: number, lng: number): CampusPoint {
  const projected = projectCampusCoordinates(lat, lng)
  const matched = resolveLocationFromImagePosition(projected.x, projected.y)

  return {
    building: matched.label,
    x: projected.x,
    y: projected.y,
    lat,
    lng,
  }
}
