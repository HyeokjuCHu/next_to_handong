import { campusLocations, type CampusPoint } from '../data/campusData'

interface LocationPickerMapProps {
  selectedPoint: CampusPoint | null
  selectedLabel: string
  onSelect: (point: CampusPoint) => void
}

const hiddenPickerLabels = new Set(['그레이스홀', 'GLC', 'HCA'])

const selectableLocations = campusLocations.filter(
  (location) => location.hitbox && !hiddenPickerLabels.has(location.label),
)

const fieldLabels = new Set(['로뎀잔디', '평봉필드'])

function getBlockTone(label: string) {
  if (fieldLabels.has(label)) {
    return 'field'
  }

  return 'hall'
}

export function LocationPickerMap({
  selectedPoint,
  selectedLabel,
  onSelect,
}: LocationPickerMapProps) {
  return (
    <div className="location-picker-shell">
      <div className="campus-map campus-map--picker campus-map--schematic">
        {selectableLocations.map((location) => {
          const hitbox = location.hitbox

          if (!hitbox) {
            return null
          }

          const isActive = selectedPoint?.building === location.label

          return (
            <button
              key={location.label}
              type="button"
              className={`campus-block campus-block--${getBlockTone(location.label)}${
                isActive ? ' is-active' : ''
              }`}
              style={{
                left: `${hitbox.left}%`,
                top: `${hitbox.top}%`,
                width: `${hitbox.right - hitbox.left}%`,
                height: `${hitbox.bottom - hitbox.top}%`,
              }}
              onClick={() =>
                onSelect({
                  building: location.label,
                  x: location.x,
                  y: location.y,
                  lat: location.lat,
                  lng: location.lng,
                })
              }
            >
              <span>{location.pickerLabel ?? location.label}</span>
            </button>
          )
        })}
      </div>

      <div className="location-picker-footer">
        <div>
          <strong>
            {selectedPoint
              ? selectedLabel || `${selectedPoint.building} 인근`
              : '학교 배치도에서 수령 위치를 골라 주세요'}
          </strong>
          <p>
            {selectedPoint
              ? `${selectedPoint.building} 기준 좌표로 저장됩니다.`
              : '건물 버튼을 누르면 해당 위치가 바로 저장됩니다.'}
          </p>
        </div>
        <p>제공해주신 학교 지도 배치를 기준으로 만든 커스텀 선택 지도입니다.</p>
      </div>
    </div>
  )
}
