export function completeSentences(text: string): {
  readonly segments: readonly string[]
  readonly consumedLength: number
} {
  const segments: string[] = []
  let start = 0
  for (let index = 0; index < text.length; index += 1) {
    if (!/[。！？!?；;\n]/u.test(text[index]!)) continue
    const segment = text.slice(start, index + 1).trim()
    if (segment) segments.push(segment)
    start = index + 1
  }
  return { segments, consumedLength: start }
}
