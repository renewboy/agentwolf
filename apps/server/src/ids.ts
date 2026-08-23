import { randomBytes } from 'node:crypto'

function suffix(): string {
  return randomBytes(6).toString('hex')
}

function slug(value: string): string {
  const normalized = value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24)
  return normalized || 'item'
}

export function createReadableId(prefix: 'profile' | 'tool' | 'match', label: string): string {
  return `${prefix}-${slug(label)}-${suffix()}`
}
