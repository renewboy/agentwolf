import { getCopy } from '@agentwolf/assets'

export function parseRecordInput(value: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(value)
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(getCopy('errors.jsonObjectRequired'))
  }
  return parsed as Record<string, unknown>
}
