export type KakaoLatLng = {
  getLat?: () => number
  getLng?: () => number
  readonly latitude?: number
  readonly longitude?: number
}

export interface KakaoLatLngBounds {
  extend: (position: KakaoLatLng) => void
}

export interface KakaoMapInstance {
  setBounds: (bounds: KakaoLatLngBounds) => void
  panTo: (position: KakaoLatLng) => void
}

export interface KakaoMarkerInstance {
  setMap: (map: KakaoMapInstance | null) => void
}

export interface KakaoOverlayInstance {
  setMap: (map: KakaoMapInstance | null) => void
}

export interface KakaoApi {
  maps: {
    load: (callback: () => void) => void
    Map: new (
      container: HTMLElement,
      options: Record<string, unknown>,
    ) => KakaoMapInstance
    LatLng: new (latitude: number, longitude: number) => KakaoLatLng
    LatLngBounds: new () => KakaoLatLngBounds
    Marker: new (options: Record<string, unknown>) => KakaoMarkerInstance
    CustomOverlay: new (options: Record<string, unknown>) => KakaoOverlayInstance
    event: {
      addListener: (
        target: KakaoMapInstance | KakaoMarkerInstance,
        type: string,
        handler: (mouseEvent?: { latLng?: KakaoLatLng }) => void,
      ) => void
    }
    services?: {
      Status: {
        OK: string
        ZERO_RESULT: string
        ERROR: string
      }
      Places: new () => {
        keywordSearch: (
          keyword: string,
          callback: (
            result: Array<{ x: string; y: string; place_name?: string }>,
            status: string,
          ) => void,
          options?: Record<string, unknown>,
        ) => void
      }
    }
  }
}

type KakaoWindow = Window & {
  kakao?: KakaoApi
}

let kakaoLoaderPromise: Promise<KakaoApi> | null = null

export function loadKakaoMapsSdk(appKey: string) {
  if (!appKey) {
    return Promise.reject(new Error('Kakao Maps 앱 키가 비어 있어요.'))
  }

  const kakaoWindow = window as KakaoWindow
  if (kakaoWindow.kakao?.maps.load) {
    return new Promise<KakaoApi>((resolve) => {
      kakaoWindow.kakao?.maps.load(() => {
        if (kakaoWindow.kakao) {
          resolve(kakaoWindow.kakao)
        }
      })
    })
  }

  if (kakaoLoaderPromise) {
    return kakaoLoaderPromise
  }

  kakaoLoaderPromise = new Promise<KakaoApi>((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[data-kakao-maps-sdk="true"]',
    )

    const handleLoad = () => {
      const loadedWindow = window as KakaoWindow
      if (!loadedWindow.kakao?.maps.load) {
        reject(new Error('Kakao Maps SDK를 불러오지 못했어요.'))
        return
      }

      loadedWindow.kakao.maps.load(() => {
        if (loadedWindow.kakao) {
          resolve(loadedWindow.kakao)
        }
      })
    }

    if (existingScript) {
      if (kakaoWindow.kakao?.maps.load) {
        handleLoad()
        return
      }

      existingScript.addEventListener('load', handleLoad, { once: true })
      existingScript.addEventListener(
        'error',
        () => reject(new Error('Kakao Maps SDK 스크립트 로딩에 실패했어요.')),
        { once: true },
      )
      return
    }

    const script = document.createElement('script')
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?autoload=false&appkey=${appKey}&libraries=services`
    script.async = true
    script.defer = true
    script.dataset.kakaoMapsSdk = 'true'
    script.addEventListener('load', handleLoad, { once: true })
    script.addEventListener(
      'error',
      () => reject(new Error('Kakao Maps SDK 스크립트 로딩에 실패했어요.')),
      { once: true },
    )

    document.head.appendChild(script)
  })

  return kakaoLoaderPromise
}
