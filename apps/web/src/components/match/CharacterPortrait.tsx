import { useEffect, useRef, useState } from 'react'
import type { CharacterPerformance } from '@agentwolf/assets'
import { PortraitMesh } from './portrait-mesh.js'

const portraitArt = new Map(
  Object.entries(
    import.meta.glob<string>(
      '../../../../../packages/assets/characters/performances/*/neutral.webp',
      { eager: true, import: 'default', query: '?url' },
    ),
  ).map(([path, url]) => [path.split('/').at(-2)!, [url]] as const),
)

const cache = new Map<string, Promise<readonly HTMLImageElement[]>>()
export function loadPortraitImages(id: string): Promise<readonly HTMLImageElement[]> {
  const urls = portraitArt.get(id)
  if (!urls) return Promise.reject(new Error('Portrait artwork unavailable'))
  const existing = cache.get(id)
  if (existing) return existing
  const loaded = Promise.all(
    urls.map(
      (url) =>
        new Promise<HTMLImageElement>((resolve, reject) => {
          const image = new Image()
          image.addEventListener('load', () => resolve(image), { once: true })
          image.addEventListener('error', () => reject(new Error('Portrait asset unavailable')), {
            once: true,
          })
          image.src = url
        }),
    ),
  ).catch((error: unknown) => {
    cache.delete(id)
    throw error
  })
  cache.set(id, loaded)
  return loaded
}

export function CharacterPortrait({
  rig,
  images,
  side,
  motion,
  readLevel,
}: {
  readonly rig: CharacterPerformance
  readonly images: readonly HTMLImageElement[]
  readonly side: 'left' | 'right'
  readonly motion: boolean
  readonly readLevel: () => number
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const surface = canvas.current
    if (!surface || !motion) {
      setReady(false)
      return undefined
    }
    let renderer: PortraitMesh
    try {
      renderer = new PortraitMesh(surface, rig, images)
    } catch {
      setReady(false)
      return undefined
    }
    let frame = 0,
      previous = 0
    const resize = () => {
      const box = surface.getBoundingClientRect(),
        ratio = Math.min(window.devicePixelRatio || 1, 2)
      const scale = Math.min(box.width / rig.width, box.height / rig.height) * ratio
      surface.width = Math.max(1, Math.round(rig.width * scale))
      surface.height = Math.max(1, Math.round(rig.height * scale))
    }
    const observer = new ResizeObserver(resize)
    observer.observe(surface)
    resize()
    const tick = (time: number) => {
      frame = requestAnimationFrame(tick)
      if (time - previous < 1000 / 30) return
      renderer.draw(time / 1000, Math.min(0.05, (time - previous) / 1000), readLevel())
      previous = time
    }
    const lost = (event: Event) => {
      event.preventDefault()
      cancelAnimationFrame(frame)
      setReady(false)
    }
    surface.addEventListener('webglcontextlost', lost)
    frame = requestAnimationFrame(tick)
    setReady(true)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      surface.removeEventListener('webglcontextlost', lost)
      renderer.dispose()
    }
  }, [images, motion, readLevel, rig])
  return (
    <div
      className="aw-speaking-portrait"
      data-side={side}
      data-portrait={rig.id}
      data-mirrored={side === 'right' && rig.mirrorOnRight}
      aria-hidden="true"
    >
      <img src={images[0]!.src} alt="" className="aw-speaking-portrait__still" />
      {motion ? (
        <canvas ref={canvas} className="aw-speaking-portrait__canvas" data-ready={ready} />
      ) : null}
    </div>
  )
}
