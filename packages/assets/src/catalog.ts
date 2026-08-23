import copy from '../copy/zh-CN.json' with { type: 'json' }
import names from '../names/zh-CN.json' with { type: 'json' }

export const zhCN = copy
export const nicknameWords = names

export type CopyCatalog = typeof zhCN

export function getCopy(key: string): string {
  let value: unknown = zhCN
  for (const segment of key.split('.')) {
    if (typeof value !== 'object' || value === null || !(segment in value)) {
      throw new Error(`Unknown copy key: ${key}`)
    }
    value = (value as Record<string, unknown>)[segment]
  }
  if (typeof value !== 'string') throw new Error(`Copy key is not a string: ${key}`)
  return value
}

export function formatCopy(
  template: string,
  values: Readonly<Record<string, string | number | boolean>>,
): string {
  return template.replace(/\{\{([a-zA-Z][a-zA-Z0-9]*)\}\}/g, (_match, key: string) => {
    const value = values[key]
    if (value === undefined) throw new Error(`Missing copy value: ${key}`)
    return String(value)
  })
}
