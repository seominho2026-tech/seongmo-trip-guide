import type { Map as MapLibre } from 'maplibre-gl'
import type { AllPaintProperties } from '@maplibre/maplibre-gl-style-spec'

/**
 * 바탕 지도(OpenFreeMap positron)를 크로마 종이색으로 다시 칠한다.
 * 스타일에 없는 레이어·속성은 건너뛴다(타일 제공처가 스타일을 바꿔도 멈추지 않게).
 */
export function paintPaper(map: MapLibre) {
  const set = (layer: string, prop: keyof AllPaintProperties, value: unknown) => {
    if (!map.getLayer(layer)) return
    try {
      map.setPaintProperty(layer, prop, value as never)
    } catch {
      /* 레이어 종류가 달라 속성이 없으면 그냥 둔다 */
    }
  }
  set('background', 'background-color', '#fbf8f2')
  set('water', 'fill-color', '#d6dfdf')
  set('waterway', 'line-color', '#c9d5d6')
  set('park', 'fill-color', '#e4e4d3')
  set('landcover_wood', 'fill-color', '#e6e5d6')
  set('landuse_residential', 'fill-color', '#efebe3')
  set('building', 'fill-color', '#e7e1d5')
  set('aeroway-area', 'fill-color', '#ebe6dc')
  for (const layer of map.getStyle().layers ?? []) {
    const id = layer.id
    if (layer.type === 'line' && id.startsWith('highway_') && id.endsWith('_inner')) set(id, 'line-color', '#fbfaf7')
    if (layer.type === 'line' && id === 'highway_minor') set(id, 'line-color', '#fbfaf7')
    if (layer.type === 'line' && id.endsWith('_casing')) set(id, 'line-color', '#ddd6c8')
    if (layer.type === 'line' && id.endsWith('_subtle')) set(id, 'line-color', '#e9e3d7')
    if (layer.type === 'line' && id.startsWith('railway')) set(id, 'line-color', '#d8d1c3')
    if (layer.type === 'line' && id.startsWith('boundary_')) set(id, 'line-color', '#b9b1a3')
    if (layer.type === 'symbol') {
      // 바탕 지명은 옅게 두어 우리 번호 핀과 이름이 먼저 보이게 한다.
      set(id, 'text-color', id.startsWith('label_city') || id.startsWith('label_country') ? '#6b655e' : '#8d867c')
      set(id, 'text-halo-color', 'rgba(251,248,242,0.9)')
    }
  }
}
