import { getCopy } from '@agentwolf/assets'
import type { CharacterPortraitAssetId } from '@agentwolf/contracts'

const acceptedTypes = new Set(['image/png', 'image/jpeg', 'image/webp'])
const maximumFileBytes = 5_000_000
const portraitSize = 1024

export function characterPortraitUrl(assetId: CharacterPortraitAssetId): string {
  return `/api/character-assets/${encodeURIComponent(assetId)}`
}

export async function normalizeCharacterPortrait(file: File): Promise<string> {
  if (!acceptedTypes.has(file.type) || file.size <= 0 || file.size > maximumFileBytes) {
    throw new Error(getCopy('characterLibrary.portraitHint'))
  }
  const image = await createImageBitmap(file)
  try {
    const canvas = document.createElement('canvas')
    canvas.width = portraitSize
    canvas.height = portraitSize
    const context = canvas.getContext('2d')
    if (!context) throw new Error(getCopy('characterLibrary.portraitRequired'))
    const sourceSize = Math.min(image.width, image.height)
    const sourceX = (image.width - sourceSize) / 2
    const sourceY = (image.height - sourceSize) / 2
    context.drawImage(
      image,
      sourceX,
      sourceY,
      sourceSize,
      sourceSize,
      0,
      0,
      portraitSize,
      portraitSize,
    )
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (value) => (value ? resolve(value) : reject(new Error('Unable to encode portrait'))),
        'image/webp',
        0.9,
      )
    })
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.addEventListener('load', () => {
        if (typeof reader.result === 'string') resolve(reader.result)
        else reject(new Error(getCopy('common.requestFailed')))
      })
      reader.addEventListener('error', () =>
        reject(reader.error ?? new Error('Unable to read portrait')),
      )
      reader.readAsDataURL(blob)
    })
  } finally {
    image.close()
  }
}
