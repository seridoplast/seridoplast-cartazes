import { useRef, useState } from 'react'
import type { PointerEvent } from 'react'
import { Move, Scaling } from 'lucide-react'
import { percent } from '../render'
import type { Zone } from '../types'

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
export function ZoneEditor({ imageURL, zone, onChange }: { imageURL: string; zone: Zone; onChange: (value: Zone) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const start = useRef<{ kind: 'move' | 'resize'; pointerX: number; pointerY: number; zone: Zone } | null>(null)
  const [dragging, setDragging] = useState(false)
  const begin = (event: PointerEvent<HTMLDivElement>, kind: 'move' | 'resize') => {
    event.preventDefault(); event.stopPropagation()
    start.current = { kind, pointerX: event.clientX, pointerY: event.clientY, zone: { ...zone } }
    event.currentTarget.setPointerCapture(event.pointerId)
    setDragging(true)
  }
  const move = (event: PointerEvent<HTMLDivElement>) => {
    if (!start.current || !ref.current) return
    const box = ref.current.getBoundingClientRect()
    const dx = (event.clientX - start.current.pointerX) / box.width
    const dy = (event.clientY - start.current.pointerY) / box.height
    const { zone: old, kind } = start.current
    if (kind === 'move') onChange({ ...old, x: clamp(old.x + dx, 0, 1 - old.w), y: clamp(old.y + dy, 0, 1 - old.h) })
    else onChange({ ...old, w: clamp(old.w + dx, .20, 1 - old.x), h: clamp(old.h + dy, .16, 1 - old.y) })
  }
  const stop = () => { start.current = null; setDragging(false) }
  return <div className="zone-editor-stage" ref={ref}>
    <img src={imageURL} alt="Imagem base do modelo" draggable={false}/>
    <div className={`zone-rect ${dragging ? 'dragging' : ''}`} style={{ left: percent(zone.x), top: percent(zone.y), width: percent(zone.w), height: percent(zone.h) }}
      onPointerDown={event => begin(event, 'move')} onPointerMove={move} onPointerUp={stop} onPointerCancel={stop}>
      <span className="zone-tag"><Move size={13}/> Área editável</span>
      <div className="zone-handle" title="Redimensionar a área" onPointerDown={event => begin(event, 'resize')} onPointerMove={move} onPointerUp={stop} onPointerCancel={stop}><Scaling size={18}/></div>
    </div>
  </div>
}
