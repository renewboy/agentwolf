import { access, readdir } from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'
import { createClassicRuleset } from '../../packages/game-engine/src/index.js'
import { text, failIfErrors, projectRoot } from './files.js'

const errors: string[] = []
const skillsRoot = resolve(projectRoot, 'packages/assets/player-skills')
const playerSkillRoot = resolve(skillsRoot, 'agentwolf-player')
const strategySkillRoot = resolve(skillsRoot, 'werewolf-strategy')
const codingSkillsRoot = resolve(projectRoot, '.agents/skills')
const roleDevelopmentSkillRoot = resolve(codingSkillsRoot, 'agentwolf-role-development')
const architectureDocumentationSkillRoot = resolve(
  codingSkillsRoot,
  'agentwolf-architecture-documentation',
)

for (const playerOnlySkill of ['agentwolf-player', 'werewolf-strategy']) {
  try {
    await access(resolve(codingSkillsRoot, playerOnlySkill))
    errors.push(`Player Skill source ${playerOnlySkill} must not be stored under .agents/skills`)
  } catch {
    // Project coding-agent Skills must not expose player-only Skills.
  }
}

const playerSkill = await validateSkill('agentwolf-player', playerSkillRoot)
const strategySkill = await validateSkill('werewolf-strategy', strategySkillRoot)
await validateSkill('agentwolf-role-development', roleDevelopmentSkillRoot)
await validateSkill('agentwolf-architecture-documentation', architectureDocumentationSkillRoot)
await requireFile(
  architectureDocumentationSkillRoot,
  'references/architecture-document-template.md',
)

const actionReference = await text(resolve(playerSkillRoot, 'references/actions.md'))
for (const tool of [
  'submit_speech',
  'submit_vote',
  'submit_night_action',
  'submit_sheriff_action',
  'trigger_skill',
  'submit_postgame_review',
]) {
  if (!playerSkill.includes(tool) && !actionReference.includes(tool)) {
    errors.push(`agentwolf-player does not document ${tool}`)
  }
}

const playerMetadata = await text(resolve(playerSkillRoot, 'agents/openai.yaml'))
if (!/display_name:\s*['"]AgentWolf Player['"]/.test(playerMetadata)) {
  errors.push('agentwolf-player UI display name is stale')
}
const strategyMetadata = await text(resolve(strategySkillRoot, 'agents/openai.yaml'))
if (!/display_name:\s*['"]狼人杀攻略['"]/.test(strategyMetadata)) {
  errors.push('werewolf-strategy UI display name is stale')
}

const promptContract = await text(
  resolve(projectRoot, 'packages/assets/prompts/_core/player-contract.njk'),
)
if (playerSkill !== promptContract) {
  errors.push(
    'agentwolf-player/SKILL.md must exactly match packages/assets/prompts/_core/player-contract.njk',
  )
}

const installedRoleIds = createClassicRuleset()
  .roles.list()
  .map((role) => role.id)
  .sort()
const installedStrategyPages = new Map<string, string>([
  ['role-awakened-hidden-wolf', 'robotwolf.md'],
  ['role-guard', 'guard.md'],
  ['role-hunter', 'hunter.md'],
  ['role-idiot', 'idiot.md'],
  ['role-magic-mirror-girl', 'psychic.md'],
  ['role-seer', 'seer.md'],
  ['role-villager', 'villager.md'],
  ['role-werewolf', 'werewolf.md'],
  ['role-white-wolf-king', 'whitewolf.md'],
  ['role-witch', 'witch.md'],
])
const strategyRoleDirectory = resolve(strategySkillRoot, 'references/roles')
const strategyRoleFiles = (await readdir(strategyRoleDirectory))
  .filter((fileName) => fileName.endsWith('.md') && fileName !== 'index.md')
  .sort()
compareSets(
  'installed Roles',
  installedRoleIds,
  'installed strategy mappings',
  [...installedStrategyPages.keys()].sort(),
)

const roleIndexPath = 'references/roles/index.md'
if (!strategySkill.includes(`](${roleIndexPath})`)) {
  errors.push(`werewolf-strategy/SKILL.md does not index ${roleIndexPath}`)
}
const roleIndex = await text(resolve(strategySkillRoot, roleIndexPath))
for (const [roleId, fileName] of installedStrategyPages) {
  if (!strategyRoleFiles.includes(fileName)) {
    errors.push(`strategy Role index is missing ${fileName} for ${roleId}`)
  }
  if (!roleIndex.includes(`](${fileName})`)) {
    errors.push(`strategy Role index does not link ${fileName} for ${roleId}`)
  }
}

for (const fileName of strategyRoleFiles) {
  const guide = await text(resolve(strategyRoleDirectory, fileName))
  for (const heading of ['技能介绍', '角色介绍', '相关阅读']) {
    if (!guide.includes(`## ${heading}`)) {
      errors.push(`strategy Role page ${fileName} is missing ${heading}`)
    }
  }
  if (!/\]\(\.\.\/articles\/[^)]+\.md\)/.test(guide)) {
    errors.push(`strategy Role page ${fileName} has no local related article`)
  }
  if (guide.includes('资料来源')) errors.push(`strategy Role page ${fileName} contains 资料来源`)
}

const strategyArticleDirectory = resolve(strategySkillRoot, 'references/articles')
const strategyArticleFiles = (await readdir(strategyArticleDirectory))
  .filter((fileName) => fileName.endsWith('.md'))
  .sort()
if (strategyArticleFiles.length < 52) {
  errors.push('strategy article graph does not cover every Role entry article')
}
for (const fileName of strategyArticleFiles) {
  const article = await text(resolve(strategyArticleDirectory, fileName))
  if (!article.includes('## 攻略正文')) {
    errors.push(`strategy article ${fileName} is missing 攻略正文`)
  }
  if (article.includes('## 内容摘要'))
    errors.push(`strategy article ${fileName} contains a summary`)
  if (article.includes('资料来源')) errors.push(`strategy article ${fileName} contains 资料来源`)
}
const reportedArticle = await text(resolve(strategyArticleDirectory, '2023080801.md'))
for (const phrase of ['内心认同角色', '发言模板分享', '统一战线', '不怕死的态度', '逆向思维']) {
  if (!reportedArticle.includes(phrase)) {
    errors.push(`strategy article 2023080801.md is missing source section: ${phrase}`)
  }
}
await validateMarkdownGraph(strategySkillRoot, 'SKILL.md')

const promptRoleIds: string[] = []
const promptBundlesRoot = resolve(projectRoot, 'packages/assets/prompts/bundles')
for (const directory of await readdir(promptBundlesRoot, { withFileTypes: true })) {
  if (!directory.isDirectory()) continue
  const manifestPath = resolve(promptBundlesRoot, directory.name, 'bundle.json')
  const manifest = JSON.parse(await text(manifestPath)) as {
    roles?: Array<{ id?: unknown; template?: unknown }>
  }
  for (const role of manifest.roles ?? []) {
    if (typeof role.id !== 'string' || typeof role.template !== 'string') {
      errors.push(`${directory.name}/bundle.json has an invalid Role entry`)
      continue
    }
    promptRoleIds.push(role.id)
    const template = await text(resolve(promptBundlesRoot, directory.name, role.template))
    if (!template.includes("section == 'public'")) {
      errors.push(`${directory.name}/${role.template} is missing a public Role introduction`)
    }
    const strategyPage = installedStrategyPages.get(role.id)
    if (!strategyPage) {
      errors.push(`${directory.name}/${role.template} has no installed strategy mapping`)
      continue
    }
    const guide = await text(resolve(strategyRoleDirectory, strategyPage))
    const introduction = markdownSection(guide, '角色介绍')
    if (!introduction || !template.includes(introduction)) {
      errors.push(
        `${directory.name}/${role.template} does not contain the source Role introduction`,
      )
    }
    if (/基础打法是|常见错误是|进阶时/.test(template)) {
      errors.push(`${directory.name}/${role.template} contains a hand-written strategy paragraph`)
    }
    if (template.includes('以下角色介绍用于通用打法背景')) {
      errors.push(`${directory.name}/${role.template} contains an added Role introduction preface`)
    }
  }
}
compareSets('installed Roles', installedRoleIds, 'public Prompt Roles', promptRoleIds.sort())

failIfErrors(errors, 'skills')

async function validateSkill(name: string, root: string): Promise<string> {
  const skill = await text(resolve(root, 'SKILL.md'))
  const frontmatter = skill.match(/^---\n([\s\S]*?)\n---/)
  if (!frontmatter) errors.push(`${name}/SKILL.md is missing YAML frontmatter`)
  if (!new RegExp(`^name:\\s*${name}$`, 'm').test(frontmatter?.[1] ?? '')) {
    errors.push(`skill name must be ${name}`)
  }
  if (!/^description:\s*\S.{20,}$/m.test(frontmatter?.[1] ?? '')) {
    errors.push(`${name} description is missing or too short`)
  }
  if (/\[TODO|TODO:/.test(skill)) errors.push(`${name} contains unfinished scaffold placeholders`)
  await requireFile(root, 'agents/openai.yaml')
  return skill
}

function markdownSection(markdown: string, heading: string): string | null {
  return (
    markdown
      .match(new RegExp(`^## ${heading}\\n\\n([\\s\\S]*?)(?=\\n\\n## |$)`, 'm'))?.[1]
      ?.trim() ?? null
  )
}

async function requireFile(root: string, path: string): Promise<void> {
  try {
    await access(resolve(root, path))
  } catch {
    errors.push(`skill is missing ${path}`)
  }
}

function compareSets(
  leftLabel: string,
  left: readonly string[],
  rightLabel: string,
  right: readonly string[],
): void {
  const leftSet = new Set(left)
  const rightSet = new Set(right)
  for (const value of leftSet) {
    if (!rightSet.has(value)) errors.push(`${rightLabel} is missing ${value} from ${leftLabel}`)
  }
  for (const value of rightSet) {
    if (!leftSet.has(value)) errors.push(`${rightLabel} contains orphan ${value}`)
  }
  if (leftSet.size !== left.length) errors.push(`${leftLabel} contains duplicate entries`)
  if (rightSet.size !== right.length) errors.push(`${rightLabel} contains duplicate entries`)
}

async function validateMarkdownGraph(root: string, entryPath: string): Promise<void> {
  const reachable = new Set<string>()
  const pending = [entryPath]
  while (pending.length > 0) {
    const currentPath = pending.pop()
    if (!currentPath || reachable.has(currentPath)) continue
    reachable.add(currentPath)
    const markdown = await text(resolve(root, currentPath))
    for (const match of markdown.matchAll(/\]\(([^)#]+\.md)(?:#[^)]+)?\)/g)) {
      const linkedPath = match[1]
      if (!linkedPath) continue
      const targetPath = relative(root, resolve(root, dirname(currentPath), linkedPath))
      if (targetPath.startsWith('..')) {
        errors.push(`strategy link escapes Skill root: ${currentPath} -> ${linkedPath}`)
        continue
      }
      try {
        await access(resolve(root, targetPath))
      } catch {
        errors.push(`strategy link is broken: ${currentPath} -> ${linkedPath}`)
        continue
      }
      pending.push(targetPath)
    }
  }

  const allMarkdown = await listMarkdownFiles(root)
  compareSets(
    'strategy markdown files',
    allMarkdown.sort(),
    'reachable strategy pages',
    [...reachable].sort(),
  )
}

async function listMarkdownFiles(root: string, current = root): Promise<string[]> {
  const files: string[] = []
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const absolutePath = resolve(current, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await listMarkdownFiles(root, absolutePath)))
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(relative(root, absolutePath))
    }
  }
  return files
}
