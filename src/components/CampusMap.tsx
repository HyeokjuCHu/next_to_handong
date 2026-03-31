import { useEffect, useRef, useState } from 'react'
import {
  campusCenter,
  type FeedItem,
} from '../data/campusData'
import {
  loadKakaoMapsSdk,
  type KakaoApi,
  type KakaoMapInstance,
  type KakaoMarkerInstance,
  type KakaoOverlayInstance,
} from '../lib/kakao'
import { resolveCampusPositionByBuilding } from '../lib/campusPlaces'
import campusMapImage from '../assets/handong-campus-map.jpeg'

const kakaoKey = import.meta.env.VITE_KAKAO_JAVASCRIPT_KEY

interface CampusMapProps {
  items: FeedItem[]
  selectedId?: string
  selectedItem?: FeedItem
  onSelect: (id: string) => void
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function DemoCampusMap({
  items,
  selectedId,
  selectedItem,
  onSelect,
  message,
}: CampusMapProps & { message: string }) {
  return (
    <div className="campus-map campus-map--embedded campus-map--image">
      <img
        className="location-picker-image"
        src={campusMapImage}
        alt="한동대 캠퍼스 커스텀 지도"
      />

      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className={item.id === selectedId ? 'map-pin is-active' : 'map-pin'}
          style={{ left: `${item.x}%`, top: `${item.y}%` }}
          onClick={() => onSelect(item.id)}
        >
          <span className="map-pin__icon">{item.kind === 'delivery' ? 'D' : 'R'}</span>
          <span className="map-pin__label">{item.building}</span>
        </button>
      ))}

      <div className="map-footer">
        <div>
          <strong>{selectedItem ? selectedItem.building : '아직 등록된 위치가 없습니다'}</strong>
          <p>
            {selectedItem
              ? selectedItem.kind === 'delivery'
                ? `${selectedItem.restaurant} 수령 지점`
                : `${selectedItem.title} 나눔 지점`
              : '새 글이 올라오면 캠퍼스 주요 거점에 수령 위치가 표시됩니다.'}
          </p>
        </div>
        <p>{message}</p>
      </div>
    </div>
  )
}

export function CampusMap({
  items,
  selectedId,
  selectedItem,
  onSelect,
}: CampusMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<KakaoMapInstance | null>(null)
  const kakaoRef = useRef<KakaoApi | null>(null)
  const markerRefs = useRef<KakaoMarkerInstance[]>([])
  const overlayRef = useRef<KakaoOverlayInstance | null>(null)
  const [resolvedPositions, setResolvedPositions] = useState<
    Record<string, { lat: number; lng: number }>
  >({})
  const [status, setStatus] = useState<'loading' | 'ready' | 'fallback'>(
    kakaoKey ? 'loading' : 'fallback',
  )
  const [fallbackMessage, setFallbackMessage] = useState(
    kakaoKey
      ? 'Kakao Maps를 불러오는 중입니다.'
      : 'Kakao Maps 키가 없어 간략 캠퍼스 지도로 표시 중입니다.',
  )

  useEffect(() => {
    if (!kakaoKey || !containerRef.current) {
      return
    }

    let cancelled = false

    loadKakaoMapsSdk(kakaoKey)
      .then((kakao) => {
        if (cancelled || !containerRef.current) {
          return
        }

        kakaoRef.current = kakao
        mapRef.current = new kakao.maps.Map(containerRef.current, {
          center: new kakao.maps.LatLng(campusCenter.lat, campusCenter.lng),
          level: 3,
        })
        setStatus('ready')
      })
      .catch((error) => {
        if (cancelled) {
          return
        }

        setFallbackMessage(
          error instanceof Error
            ? `${error.message} 현재는 간략 캠퍼스 지도로 표시하고 있습니다.`
            : 'Kakao Maps 초기화에 실패해 간략 캠퍼스 지도로 표시 중입니다.',
        )
        setStatus('fallback')
      })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (status !== 'ready') {
      return
    }

    let cancelled = false

    Promise.all(
      items.map(async (item) => {
        const position = await resolveCampusPositionByBuilding(item.building, {
          lat: item.lat,
          lng: item.lng,
        })

        return [item.id, position] as const
      }),
    ).then((entries) => {
      if (cancelled) {
        return
      }

      setResolvedPositions(Object.fromEntries(entries))
    })

    return () => {
      cancelled = true
    }
  }, [items, status])

  useEffect(() => {
    if (status !== 'ready' || !mapRef.current || !kakaoRef.current) {
      return
    }

    const kakao = kakaoRef.current
    const map = mapRef.current

    markerRefs.current.forEach((marker) => marker.setMap(null))
    markerRefs.current = []
    overlayRef.current?.setMap(null)

    const bounds = new kakao.maps.LatLngBounds()

    items.forEach((item) => {
      const resolvedPosition = resolvedPositions[item.id] ?? {
        lat: item.lat,
        lng: item.lng,
      }
      const position = new kakao.maps.LatLng(
        resolvedPosition.lat,
        resolvedPosition.lng,
      )
      bounds.extend(position)

      const marker = new kakao.maps.Marker({
        map,
        position,
        title: item.title,
        clickable: true,
        zIndex: item.id === selectedId ? 10 : 1,
      })

      kakao.maps.event.addListener(marker, 'click', () => onSelect(item.id))
      markerRefs.current.push(marker)

      if (item.id === selectedId) {
        const content = document.createElement('div')
        content.className =
          item.kind === 'delivery'
            ? 'kakao-overlay kakao-overlay--delivery'
            : 'kakao-overlay kakao-overlay--share'
        content.innerHTML = `
          <strong>${escapeHtml(item.building)}</strong>
          <span>${escapeHtml(
            item.kind === 'delivery' ? item.restaurant : item.title,
          )}</span>
        `

        overlayRef.current = new kakao.maps.CustomOverlay({
          position,
          content,
          yAnchor: 1.8,
        })
        overlayRef.current.setMap(map)
      }
    })

    if (items.length > 1) {
      map.setBounds(bounds)
    } else if (items.length === 1) {
      map.panTo(new kakao.maps.LatLng(items[0].lat, items[0].lng))
    } else {
      map.panTo(new kakao.maps.LatLng(campusCenter.lat, campusCenter.lng))
    }
  }, [items, onSelect, resolvedPositions, selectedId, status])

  useEffect(() => {
    if (status !== 'ready' || !mapRef.current || !kakaoRef.current || !selectedItem) {
      return
    }

    const kakao = kakaoRef.current
    const resolvedPosition = resolvedPositions[selectedItem.id] ?? {
      lat: selectedItem.lat,
      lng: selectedItem.lng,
    }
    mapRef.current.panTo(
      new kakao.maps.LatLng(resolvedPosition.lat, resolvedPosition.lng),
    )
  }, [resolvedPositions, selectedItem, status])

  return (
    <div className="kakao-map-shell">
      <div className="kakao-map-canvas" ref={containerRef}></div>
      {status !== 'ready' ? (
        <DemoCampusMap
          items={items}
          selectedId={selectedId}
          selectedItem={selectedItem}
          onSelect={onSelect}
          message={fallbackMessage}
        />
      ) : (
        <div className="map-footer">
          <div>
            <strong>{selectedItem ? selectedItem.building : '아직 등록된 위치가 없습니다'}</strong>
            <p>
              {selectedItem
                ? selectedItem.kind === 'delivery'
                  ? `${selectedItem.restaurant} 수령 지점`
                  : `${selectedItem.title} 나눔 지점`
                : '등록된 글이 없습니다.'}
            </p>
          </div>
          {selectedItem ? <p>현재 선택한 글의 수령 위치를 지도에서 확인하고 있습니다.</p> : null}
        </div>
      )}
    </div>
  )
}
