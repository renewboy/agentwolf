import { mkdir, readdir, unlink, writeFile } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const entryUrl = new URL('https://www.langrensha.net/#screen-roles')
const scriptDirectory = resolve(fileURLToPath(new URL('.', import.meta.url)))
const projectRoot = resolve(scriptDirectory, '../..')
const referencesRoot = resolve(
  projectRoot,
  'packages/assets/player-skills/werewolf-strategy/references',
)
const roleDirectory = resolve(referencesRoot, 'roles')
const articleDirectory = resolve(referencesRoot, 'articles')
const roleAliases = new Map([['psychic', '魔镜少女']])

const homeHtml = await fetchText(entryUrl)
const catalogUrl = await resolveCatalogUrl(homeHtml)
const catalog = parseCatalog(await fetchJson(catalogUrl))
const articleGraph = await loadArticles(catalog.roles)

const roleFiles = new Map(
  catalog.roles.map((role) => [`${role.id}.md`, renderRole(role, articleGraph)]),
)
const articleFiles = new Map(
  [...articleGraph.values()].map((article) => [`${article.id}.md`, renderArticle(article)]),
)

await mkdir(roleDirectory, { recursive: true })
await mkdir(articleDirectory, { recursive: true })
await syncMarkdownDirectory(roleDirectory, roleFiles)
await syncMarkdownDirectory(articleDirectory, articleFiles)
await writeFile(resolve(roleDirectory, 'index.md'), renderIndex(catalog.roles), 'utf8')

process.stdout.write(
  `已从 ${entryUrl.href} 整理 ${catalog.roles.length} 个角色、${articleGraph.size} 篇攻略正文。\n`,
)

interface SourceRole {
  id: string
  name: string
  faction: string
  skill: string
  character: string
  related: SourceRelatedArticle[]
}

interface SourceRelatedArticle {
  title: string
  url: string
}

interface SourceCatalog {
  schemaVersion: number
  roles: SourceRole[]
}

interface CapturedArticle {
  id: string
  title: string
  date: string
  body: string
  related: SourceRelatedArticle[]
  sourceUrl: URL
}

async function resolveCatalogUrl(home: string): Promise<URL> {
  const scriptPaths = [...home.matchAll(/<script[^>]+src=["']([^"']+)["'][^>]*>/gi)]
    .map((match) => match[1])
    .filter((path): path is string => path !== undefined)
  for (const scriptPath of scriptPaths) {
    const scriptUrl = new URL(scriptPath, entryUrl)
    const script = await fetchText(scriptUrl)
    const catalogPath = script.match(/ROLE_CATALOG_PATH\s*=\s*["']([^"']+)["']/)?.[1]
    if (catalogPath) return new URL(catalogPath, entryUrl)
  }
  throw new Error('角色介绍页没有声明角色目录地址')
}

async function loadArticles(roles: SourceRole[]): Promise<Map<string, CapturedArticle>> {
  const pending: SourceRelatedArticle[] = []
  const queuedUrls = new Set<string>()
  for (const role of roles) {
    for (const related of role.related) {
      enqueueArticle(related, entryUrl, pending, queuedUrls)
    }
  }

  const loadedArticles = new Map<string, CapturedArticle>()
  while (pending.length > 0) {
    const requestedArticle = pending.shift()
    if (!requestedArticle) break
    const sourceUrl = normalizeArticleUrl(new URL(requestedArticle.url, entryUrl))
    const html = await fetchText(sourceUrl)
    const id = sourceUrl.pathname.match(/\/(\d+)\.html$/)?.[1]
    if (!id) throw new Error(`相关阅读地址缺少文章编号：${sourceUrl.href}`)

    const title = decodeHtml(
      html.match(/<h1[^>]*data-article-detail-title[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ??
        requestedArticle.title,
    )
    const date = html.match(/<time[^>]*datetime=["']([^"']+)["']/i)?.[1] ?? ''
    const bodyHtml = extractElementBody(html, 'data-article-detail-body')
    const body = htmlFragmentToMarkdown(bodyHtml, sourceUrl)
    if (!body) throw new Error(`相关阅读缺少正文：${sourceUrl.href}`)

    const relatedBlock =
      html.match(/<ul[^>]*data-article-detail-related[^>]*>([\s\S]*?)<\/ul>/i)?.[1] ?? ''
    const related = extractArticleLinks(relatedBlock, sourceUrl)

    loadedArticles.set(id, { id, title, date, body, related, sourceUrl })
    for (const linkedArticle of [...related, ...extractArticleLinks(bodyHtml, sourceUrl)]) {
      enqueueArticle(linkedArticle, sourceUrl, pending, queuedUrls)
    }

    if (loadedArticles.size % 25 === 0) {
      process.stdout.write(`已读取 ${loadedArticles.size} 篇正文，待读取 ${pending.length} 篇。\n`)
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 120))
  }
  return loadedArticles
}

function enqueueArticle(
  article: SourceRelatedArticle,
  baseUrl: URL,
  pending: SourceRelatedArticle[],
  queuedUrls: Set<string>,
): void {
  const sourceUrl = normalizeArticleUrl(new URL(article.url, baseUrl))
  if (!isArticleUrl(sourceUrl) || queuedUrls.has(sourceUrl.href)) return
  queuedUrls.add(sourceUrl.href)
  pending.push({ title: article.title, url: sourceUrl.href })
}

function extractArticleLinks(fragment: string, baseUrl: URL): SourceRelatedArticle[] {
  return [...fragment.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
    .flatMap((match) => {
      const href = match[1]
      const label = match[2]
      if (href === undefined || label === undefined) return []
      return [{ title: decodeHtml(label), url: normalizeArticleUrl(new URL(href, baseUrl)).href }]
    })
    .filter((article) => isArticleUrl(new URL(article.url)))
}

function normalizeArticleUrl(url: URL): URL {
  const normalized = new URL(url)
  normalized.hash = ''
  normalized.search = ''
  return normalized
}

function isArticleUrl(url: URL): boolean {
  return url.origin === entryUrl.origin && /^\/strategy\/\d+\.html$/.test(url.pathname)
}

function extractElementBody(html: string, attribute: string): string {
  const openingPattern = new RegExp(`<div[^>]*${attribute}[^>]*>`, 'i')
  const opening = openingPattern.exec(html)
  if (!opening) return ''

  const contentStart = opening.index + opening[0].length
  const divPattern = /<\/?div\b[^>]*>/gi
  divPattern.lastIndex = contentStart
  let depth = 1
  for (let match = divPattern.exec(html); match; match = divPattern.exec(html)) {
    if (/^<\/div/i.test(match[0])) {
      depth -= 1
      if (depth === 0) return html.slice(contentStart, match.index)
    } else {
      depth += 1
    }
  }
  return ''
}

function htmlFragmentToMarkdown(fragment: string, sourceUrl: URL): string {
  let markdown = fragment
    .replace(/<!--([\s\S]*?)-->/g, '')
    .replace(
      /<figure[^>]*class=["'][^"']*article-detail-main-figure[^"']*["'][^>]*>[\s\S]*?<\/figure>/gi,
      '',
    )
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')

  markdown = markdown.replace(
    /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
    (_match, href: string, label: string) => {
      const targetUrl = normalizeArticleUrl(new URL(href, sourceUrl))
      const articleId = targetUrl.pathname.match(/^\/strategy\/(\d+)\.html$/)?.[1]
      const text = decodeHtml(label)
      return articleId ? `[${escapeMarkdown(text)}](${articleId}.md)` : text
    },
  )

  markdown = markdown
    .replace(/<h2\b[^>]*>/gi, '\n## ')
    .replace(/<\/h2>/gi, '\n\n')
    .replace(/<h3\b[^>]*>/gi, '\n### ')
    .replace(/<\/h3>/gi, '\n\n')
    .replace(/<(?:strong|b)\b[^>]*>/gi, '**')
    .replace(/<\/(?:strong|b)>/gi, '**')
    .replace(/<(?:em|i)\b[^>]*>/gi, '*')
    .replace(/<\/(?:em|i)>/gi, '*')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '\n- ')
    .replace(/<\/li>/gi, '')
    .replace(/<p\b[^>]*>/gi, '')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<img\b[^>]*alt=["']([^"']*)["'][^>]*>/gi, '$1')
    .replace(/<img\b[^>]*>/gi, '')
    .replace(/<[^>]+>/g, '')

  return decodeHtml(markdown)
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function parseCatalog(value: unknown): SourceCatalog {
  if (!isRecord(value) || value.schemaVersion !== 1 || !Array.isArray(value.roles)) {
    throw new Error('角色目录格式无效')
  }
  const roles = value.roles.map((candidate, index): SourceRole => {
    if (
      !isRecord(candidate) ||
      !isText(candidate.id) ||
      !/^[a-z0-9_-]+$/.test(candidate.id) ||
      !isText(candidate.name) ||
      !isText(candidate.faction) ||
      !isText(candidate.skill) ||
      !isText(candidate.character) ||
      !Array.isArray(candidate.related)
    ) {
      throw new Error(`第 ${index + 1} 个角色格式无效`)
    }
    const roleName = candidate.name
    const related = candidate.related.map((item, relatedIndex): SourceRelatedArticle => {
      if (!isRecord(item) || !isText(item.title) || !isText(item.url)) {
        throw new Error(`${roleName} 的第 ${relatedIndex + 1} 条相关阅读格式无效`)
      }
      return { title: item.title, url: item.url }
    })
    return {
      id: candidate.id,
      name: candidate.name,
      faction: candidate.faction,
      skill: candidate.skill,
      character: candidate.character,
      related,
    }
  })
  const ids = new Set(roles.map((role) => role.id))
  if (ids.size !== roles.length) throw new Error('角色目录包含重复角色')
  return { schemaVersion: 1, roles }
}

function renderIndex(roles: SourceRole[]): string {
  const roleLinks = roles
    .map((role, index) => {
      const alias = roleAliases.get(role.id)
      const label = alias ? `${role.name}（${alias}）` : role.name
      return `${index + 1}. [${escapeMarkdown(label)}](${role.id}.md)`
    })
    .join('\n')
  return `# 角色攻略目录

先选择角色，阅读技能介绍和角色介绍，再按当前问题进入相关阅读。对局中的角色规则、可用目标和行动限制，以裁判当场说明为准。

## 角色

${roleLinks}
`
}

function renderRole(role: SourceRole, availableArticles: Map<string, CapturedArticle>): string {
  const relatedLinks = role.related
    .map((related) => {
      const id = new URL(related.url, entryUrl).pathname.match(/\/(\d+)\.html$/)?.[1]
      if (!id || !availableArticles.has(id))
        throw new Error(`${role.name} 的相关阅读没有对应文章：${related.url}`)
      return `- [${escapeMarkdown(related.title)}](../articles/${id}.md)`
    })
    .join('\n')
  return `# ${role.name}

[返回角色目录](index.md)

## 技能介绍

${role.skill}

## 角色介绍

${role.character}

## 相关阅读

${relatedLinks}
`
}

function renderArticle(article: CapturedArticle): string {
  const dateLine = article.date ? `\n发布日期：${article.date}\n` : ''
  const relatedSection =
    article.related.length === 0
      ? ''
      : `
## 相关阅读

${article.related
  .map((related) => {
    const targetUrl = normalizeArticleUrl(new URL(related.url, article.sourceUrl))
    const id = targetUrl.pathname.match(/^\/strategy\/(\d+)\.html$/)?.[1]
    if (!id) throw new Error(`${article.title} 的相关阅读没有文章编号：${related.url}`)
    return `- [${escapeMarkdown(related.title)}](${id}.md)`
  })
  .join('\n')}
`
  return `# ${article.title}

[返回角色目录](../roles/index.md)
${dateLine}
## 攻略正文

${article.body}
${relatedSection}
`
}

async function syncMarkdownDirectory(
  directory: string,
  files: ReadonlyMap<string, string>,
): Promise<void> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.md') && !files.has(entry.name)) {
      await unlink(resolve(directory, entry.name))
    }
  }
  for (const [name, content] of files) {
    if (basename(name) !== name || !name.endsWith('.md')) {
      throw new Error(`生成文件名无效：${name}`)
    }
    await writeFile(resolve(directory, name), content, 'utf8')
  }
}

async function fetchJson(url: URL): Promise<unknown> {
  return JSON.parse(await fetchText(url)) as unknown
}

async function fetchText(url: URL): Promise<string> {
  const response = await fetch(url, {
    headers: { 'user-agent': 'AgentWolf strategy catalog updater' },
    signal: AbortSignal.timeout(20_000),
  })
  if (!response.ok) throw new Error(`${url.href} 返回 ${response.status}`)
  return response.text()
}

function decodeHtml(value: string): string {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;|&#34;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&ldquo;/g, '“')
    .replace(/&rdquo;/g, '”')
    .replace(/&lsquo;/g, '‘')
    .replace(/&rsquo;/g, '’')
    .replace(/&mdash;/g, '—')
    .replace(/&hellip;/g, '…')
    .replace(/&#x([0-9a-f]+);/gi, (_match, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    )
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replace(/[ \t\f\v]+/g, ' ')
    .trim()
}

function escapeMarkdown(value: string): string {
  return value.replace(/([\\[\]])/g, '\\$1')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}
