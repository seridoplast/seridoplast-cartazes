import { useRef, useState } from 'react'
import type { PointerEvent } from 'react'
import { Grip, Maximize2 } from 'lucide-react'
import { PosterCanvas } from './PosterCanvas'
import { elementZones, ELEMENT_LABELS, POSTER_ELEMENTS, percent } from '../render'
import type { Poster, PosterElement, PosterTemplate, Zone } from '../types'

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

type Drag = { element: PosterElement; kind: 'move' | 'resize'; x: number; y: number; zone: Zone }
export function ElementsEditor({ template, poster, imageURL, fontFamily, onChange }: {
  template: PosterTemplate; poster: Poster; imageURL: string; fontFamily?: string;
  onChange: (element: PosterElement, zone: Zone) => void
}) {
  const surface = useRef<HTMLDivElement>(null)
  const drag = useRef<Drag | null>(null)
  const [active, setActive] = useState<PosterElement | null>(null)
  const zones = elementZones(template)
  function start(event: PointerEvent<HTMLDivElement>, element: PosterElement, kind: Drag['kind']) {
    event.preventDefault(); event.stopPropagation()
    drag.current = { element, kind, x: event.clientX, y: event.clientY, zone: { ...zones[element] } }
    event.currentTarget.setPointerCapture(event.pointerId)
    setActive(element)
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    if (!drag.current || !surface.current) return
    const { width, height } = surface.current.getBoundingClientRect()
    if (!width || !height) return
    const { element, kind, zone, x, y } = drag.current
    const dx = (event.clientX - x) / width
    const dy = (event.clientY - y) / height
    if (kind === 'move') onChange(element, { ...zone,
      x: clamp(zone.x + dx, 0, 1 - zone.w), y: clamp(zone.y + dy, 0, 1 - zone.h) })
    else onChange(element, { ...zone,
      w: clamp(zone.w + dx, .08, 1 - zone.x), h: clamp(zone.h + dy, .025, 1 - zone.y) })
  }
  function stop() { drag.current = null; setActive(null) }
  return <div ref={surface} className="elements-stage">
    <PosterCanvas template={template} poster={poster} imageURL={imageURL} fontFamily={fontFamily}/>
    {POSTER_ELEMENTS.map(key => {
      const z = zones[key]
      return <div key={key} className={`element-handle ${active === key ? 'is-active' : ''}`}
        style={{ left: percent(z.x), top: percent(z.y), width: percent(z.w), height: percent(z.h) }}
        onPointerDown={e => start(e, key, 'move')}
        onPointerMove={move} onPointerUp={stop} onPointerCancel={stop}
        role="group" aria-label={`Mover ${ELEMENT_LABELS[key]}`} title={`Arraste para mover: ${ELEMENT_LABELS[key]}`}>
        <span className="element-handle-label"><Grip size={11}/>{ELEMENT_LABELS[key]}</span>
        <div className="element-resize" role="button" aria-label={`Redimensionar ${ELEMENT_LABELS[key]}`}
          onPointerDown={e => start(e, key, 'resize')} onPointerMove={move} onPointerUp={stop} onPointerCancel={stop}>
          <Maximize2 size={12}/></div>
      </div>
    })}
  </div>
}
