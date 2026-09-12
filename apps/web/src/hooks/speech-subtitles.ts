const graphemes = new Intl.Segmenter('zh-CN', { granularity: 'grapheme' })
const width = (character: string): number => (character.codePointAt(0)! > 0xffff ? 2 : 1)

export function subtitleWidth(text: string): number {
  return Array.from(graphemes.segment(text), ({ segment }) => width(segment)).reduce(
    (sum, value) => sum + value,
    0,
  )
}

export function subtitlePages(text: string, capacity: number): readonly string[] {
  const limit = Math.max(8, Number.isFinite(capacity) ? capacity : 24)
  const characters = Array.from(graphemes.segment(text), ({ segment }) => segment)
  const pages: string[] = []
  let start = 0
  while (start < characters.length) {
    let end = start
    let units = 0
    let boundary = start
    while (end < characters.length && units + width(characters[end]!) <= limit) {
      const character = characters[end++]!
      units += width(character)
      if (/[。！？!?；;，,、\s]/u.test(character) && units >= limit * 0.45) boundary = end
    }
    if (end < characters.length && boundary > start) end = boundary
    if (end < characters.length && /[。！？!?；;，,、：:）》」』”’]/u.test(characters[end]!))
      end += 1
    const page = characters.slice(start, end).join('').trim()
    if (page) pages.push(page)
    start = end
  }
  return pages
}
