import copy from '../../packages/assets/copy/zh-CN.json' with { type: 'json' }
import names from '../../packages/assets/names/zh-CN.json' with { type: 'json' }
import characters from '../../packages/assets/characters/zh-CN.json' with { type: 'json' }
import { sourceFiles, text, localPath, failIfErrors, projectRoot } from './files.js'
import { access } from 'node:fs/promises'
import { resolve } from 'node:path'

const errors: string[] = []
const productionFiles = await sourceFiles(
  [
    'apps/web/src',
    'apps/server/src',
    'packages/contracts/src',
    'packages/game-engine/src',
    'packages/acp/src',
  ],
  new Set(['.ts', '.tsx']),
)
for (const path of productionFiles) {
  const content = await text(path)
  const relativePath = localPath(path)
  if (/\p{Script=Han}/u.test(content)) {
    errors.push(`${relativePath} contains Chinese copy outside packages/assets`)
  }
  if (relativePath.startsWith('apps/web/') && /\bstyle\s*=\s*\{/.test(content)) {
    errors.push(`${relativePath} contains an inline style prop`)
  }
  if (relativePath.startsWith('apps/web/') && /#[0-9a-fA-F]{3,8}\b/.test(content)) {
    errors.push(`${relativePath} contains a raw color outside the style asset package`)
  }
  if (relativePath.startsWith('apps/web/') && /<select\b/.test(content)) {
    errors.push(`${relativePath} contains a native select instead of GameSelect`)
  }
  if (
    relativePath.startsWith('apps/web/') &&
    /\b(?:(?:window|globalThis)\.)?(?:alert|confirm|prompt)\s*\(/.test(content)
  ) {
    errors.push(`${relativePath} contains a browser prompt instead of an application dialog`)
  }
  if (
    relativePath.startsWith('apps/web/') &&
    relativePath !== 'apps/web/src/hooks/useSpeechPlayback.ts' &&
    /\b(?:speechSynthesis|SpeechSynthesisUtterance)\b/.test(content)
  ) {
    errors.push(`${relativePath} bypasses the centralized speech playback controller`)
  }
}

const cssFiles = await sourceFiles(['apps', 'packages'], new Set(['.css']))
for (const path of cssFiles) {
  if (!localPath(path).startsWith('packages/assets/styles/')) {
    errors.push(`${localPath(path)} is CSS outside packages/assets/styles`)
  }
}

const promptFiles = await sourceFiles(['packages/assets/prompts'], new Set(['.md']))
for (const path of promptFiles) {
  const content = await text(path)
  if (/新增|以下是补充|补充信息|此前版本|旧版/.test(content)) {
    errors.push(`${localPath(path)} contains delivery metadata or history narration`)
  }
  if (/\bplayer-\d+\b/.test(content)) {
    errors.push(`${localPath(path)} hardcodes a concrete Player ID`)
  }
}

const copyKeys = new Set<string>()
collectCopyKeys(copy, '', copyKeys)
for (const path of await sourceFiles(['apps', 'packages'], new Set(['.ts', '.tsx']))) {
  const content = await text(path)
  for (const match of content.matchAll(/get(?:Asset)?Copy\(['"]([^'"]+)['"]\)/g)) {
    const key = match[1]!
    if (!copyKeys.has(key)) errors.push(`${localPath(path)} references missing copy key ${key}`)
  }
  for (const match of content.matchAll(
    /(?:labelKey|nameKey|descriptionKey|displayNameKey):\s*['"]([^'"]+)['"]/g,
  )) {
    const key = match[1]!
    if (!copyKeys.has(key)) errors.push(`${localPath(path)} references missing asset key ${key}`)
  }
}

if (new Set(names.prefixes).size !== names.prefixes.length || names.prefixes.length < 30) {
  errors.push('nickname prefixes must contain at least 30 unique values')
}
if (new Set(names.suffixes).size !== names.suffixes.length || names.suffixes.length < 30) {
  errors.push('nickname suffixes must contain at least 30 unique values')
}

if (characters.length !== 12 || new Set(characters.map(({ id }) => id)).size !== 12) {
  errors.push('built-in Character catalog must contain exactly 12 unique cards')
}
for (const character of characters) {
  if (character.editable || character.source !== 'built-in') {
    errors.push(`built-in Character ${character.id} must be read-only`)
  }
  if (character.personality.length < 2 || character.boundaries.length < 1) {
    errors.push(`built-in Character ${character.id} has an incomplete portrayal contract`)
  }
  try {
    await access(
      resolve(projectRoot, 'packages/assets/characters/portraits', character.portraitFile),
    )
  } catch {
    errors.push(`missing built-in Character portrait ${character.portraitFile}`)
  }
}

for (const required of [
  'packages/assets/styles/index.css',
  'packages/assets/prompts/player-foundation.md',
  'packages/assets/names/zh-CN.json',
  'docs/design/reference/match-stage.png',
  'docs/design/reference/match-stage.prompt.md',
  'docs/design/reference/match-motion.md',
]) {
  try {
    await access(resolve(projectRoot, required))
  } catch {
    errors.push(`missing required asset ${required}`)
  }
}

failIfErrors(errors, 'artifacts')

function collectCopyKeys(value: unknown, prefix: string, keys: Set<string>): void {
  if (typeof value === 'string') {
    keys.add(prefix)
    return
  }
  if (typeof value !== 'object' || value === null) return
  for (const [key, child] of Object.entries(value)) {
    collectCopyKeys(child, prefix ? `${prefix}.${key}` : key, keys)
  }
}
