import { useEffect, useRef, useState } from 'react'
import { paintPoster } from '../render'
import type { Poster, PosterTemplate } from '../types'

export function PosterCanvas({ template, poster, imageURL, fontFamily = 'Arial', className = '' }:
{ template: PosterTemplate; poster: Poster; imageURL: string; fontFamily?: string; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let live = true
    if (!ref.current) return
    setError('')
    // Asynchronous image loading can outlive the current selection.
    paintPoster(ref.current, template, poster, imageURL, fontFamily, 880)
      .catch(err => { if (live) setError(err instanceof Error ? err.message : 'Erro ao desenhar') })
    return () => { live = false }
  }, [template, poster, imageURL, fontFamily])
  return <div className={`poster-canvas ${className}`}>
    <canvas ref={ref} aria-label={`Prévia do cartaz de ${poster.product_name}`}/>
    {error && <div className="canvas-error">{error}</div>}
  </div>
}
