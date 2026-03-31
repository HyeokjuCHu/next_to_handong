import { campusCenter, campusLocations } from '../data/campusData'
import { loadKakaoMapsSdk } from './kakao'

const kakaoKey = import.meta.env.VITE_KAKAO_JAVASCRIPT_KEY

type ResolvedPosition = {
  lat: number
  lng: number
}

type KeywordSearchResult = {
  x: string
  y: string
  place_name?: string
  address_name?: string
  road_address_name?: string
}

const keywordCache = new Map<string, Promise<ResolvedPosition>>()

function getCampusSearchKeywords(building: string) {
  const location = campusLocations.find((entry) => entry.label === building)
  const aliases = location ? [location.label, ...location.aliases] : [building]
  const deduped = Array.from(new Set(aliases.map((alias) => alias.trim()).filter(Boolean)))

  return deduped.flatMap((alias) => [
    `한동대학교 ${alias}`,
    `한동대 ${alias}`,
    alias,
  ])
}

function normalizeText(value: string) {
  return value.toLowerCase().replace(/\s+/g, '')
}

function scoreCampusResult(
  result: KeywordSearchResult,
  building: string,
  aliases: readonly string[],
) {
  const normalizedBuilding = normalizeText(building)
  const normalizedAliases = aliases.map(normalizeText)
  const placeName = normalizeText(result.place_name ?? '')
  const address = normalizeText(result.address_name ?? '')
  const roadAddress = normalizeText(result.road_address_name ?? '')
  const combined = `${placeName} ${address} ${roadAddress}`

  let score = 0

  if (combined.includes('한동대학교') || combined.includes('한동대')) {
    score += 40
  }

  if (placeName.includes(normalizedBuilding)) {
    score += 50
  }

  for (const alias of normalizedAliases) {
    if (placeName.includes(alias)) {
      score += 35
      break
    }
  }

  for (const alias of normalizedAliases) {
    if (combined.includes(alias)) {
      score += 20
      break
    }
  }

  if (placeName === normalizedBuilding) {
    score += 20
  }

  return score
}

function searchKeyword(keyword: string, building: string, aliases: readonly string[]) {
  if (!kakaoKey) {
    return Promise.resolve<ResolvedPosition | null>(null)
  }

  return loadKakaoMapsSdk(kakaoKey).then(
    (kakao) =>
      new Promise<ResolvedPosition | null>((resolve) => {
        const services = kakao.maps.services

        if (!services) {
          resolve(null)
          return
        }

        const places = new services.Places()
        const locationBias = new kakao.maps.LatLng(campusCenter.lat, campusCenter.lng)

        places.keywordSearch(
          keyword,
          (result, status) => {
            if (status !== services.Status.OK || result.length === 0) {
              resolve(null)
              return
            }

            const best = (result as KeywordSearchResult[])
              .map((entry) => ({
                entry,
                score: scoreCampusResult(entry, building, aliases),
              }))
              .sort((left, right) => right.score - left.score)[0]

            if (!best || best.score < 50) {
              resolve(null)
              return
            }

            const lat = Number(best.entry.y)
            const lng = Number(best.entry.x)

            if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
              resolve(null)
              return
            }

            resolve({ lat, lng })
          },
          {
            location: locationBias,
            radius: 2000,
            size: 10,
          },
        )
      }),
  )
}

export function resolveCampusPositionByBuilding(
  building: string,
  fallback: ResolvedPosition,
) {
  const cacheKey = building.trim().toLowerCase()

  if (!cacheKey) {
    return Promise.resolve(fallback)
  }

  const cached = keywordCache.get(cacheKey)
  if (cached) {
    return cached
  }

  const promise = (async () => {
    const location = campusLocations.find((entry) => entry.label === building)
    const aliases = location ? [location.label, ...location.aliases] : [building]

    for (const keyword of getCampusSearchKeywords(building)) {
      const resolved = await searchKeyword(keyword, building, aliases)

      if (resolved) {
        return resolved
      }
    }

    return fallback
  })()

  keywordCache.set(cacheKey, promise)
  return promise
}
