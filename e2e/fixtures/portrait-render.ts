import type { CharacterPerformance } from '@agentwolf/assets'

/** Runs inside Chromium so evidence uses the same Canvas and WebGL renderers as playback. */
export async function renderPortrait(definition: CharacterPerformance) {
  const facePath = '/src/components/match/portrait-face.ts'
  const meshPath = '/src/components/match/portrait-mesh.ts'
  const artPath = '/src/components/match/CharacterPortrait.tsx'
  const { PortraitFace } = (await import(
    facePath
  )) as typeof import('../../apps/web/src/components/match/portrait-face.js')
  const { PortraitMesh } = (await import(
    meshPath
  )) as typeof import('../../apps/web/src/components/match/portrait-mesh.js')
  const { loadPortraitImages } = (await import(
    artPath
  )) as typeof import('../../apps/web/src/components/match/CharacterPortrait.js')
  const images = await loadPortraitImages(definition.id)
  const face = new PortraitFace(definition, images[0]!)
  const ctx = face.canvas.getContext('2d')!
  const pixels = () => ctx.getImageData(0, 0, face.canvas.width, face.canvas.height).data.slice()
  const neutral = pixels()
  const montage = document.createElement('canvas')
  montage.width = face.canvas.width * 3
  montage.height = face.canvas.height
  const drawing = montage.getContext('2d')!
  drawing.drawImage(face.canvas, 0, 0)
  face.draw(1, 0)
  const blink = pixels()
  drawing.drawImage(face.canvas, face.canvas.width, 0)
  face.draw(0, 0.7)
  const speaking = pixels()
  drawing.drawImage(face.canvas, face.canvas.width * 2, 0)
  face.draw(0, 0)
  const restored = pixels()
  const changed = (other: Uint8ClampedArray) =>
    other.reduce((sum, value, i) => sum + Number(value !== neutral[i]), 0)
  const canvas = document.createElement('canvas')
  canvas.width = 384
  canvas.height = 576
  const mesh = new PortraitMesh(canvas, definition, images)
  const gl = canvas.getContext('webgl')!
  const captures: string[] = []
  const frames: Uint8Array[] = []
  for (let frame = 0; frame <= 140; frame++) {
    mesh.draw(frame / 30, 1 / 30, frame < 60 ? 0.14 : 0)
    if (frame === 0 || frame === 45 || frame === 140) {
      const data = new Uint8Array(canvas.width * canvas.height * 4)
      gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, data)
      frames.push(data)
      captures.push(canvas.toDataURL())
    }
  }
  const movingPixels = frames[1]!.reduce(
    (sum, value, i) => sum + Number(value !== frames[2]![i]),
    0,
  )
  mesh.dispose()
  return {
    sourceCount: images.length,
    width: images[0]!.naturalWidth,
    height: images[0]!.naturalHeight,
    blinkChanges: changed(blink),
    mouthChanges: changed(speaking),
    restoredChanges: changed(restored),
    movingPixels,
    face: montage.toDataURL(),
    captures,
  }
}
