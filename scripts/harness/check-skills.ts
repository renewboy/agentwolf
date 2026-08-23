import { access } from 'node:fs/promises'
import { resolve } from 'node:path'
import { text, failIfErrors, projectRoot } from './files.js'

const errors: string[] = []
const skillRoot = resolve(projectRoot, '.agents/skills/agentwolf-player')
const skill = await text(resolve(skillRoot, 'SKILL.md'))
const frontmatter = skill.match(/^---\n([\s\S]*?)\n---/)
if (!frontmatter) errors.push('agentwolf-player/SKILL.md is missing YAML frontmatter')
if (!/^name:\s*agentwolf-player$/m.test(frontmatter?.[1] ?? ''))
  errors.push('skill name must be agentwolf-player')
if (!/^description:\s*\S.{20,}$/m.test(frontmatter?.[1] ?? ''))
  errors.push('skill description is missing or too short')
if (/\[TODO|TODO:/.test(skill)) errors.push('skill contains unfinished scaffold placeholders')
for (const tool of [
  'submit_speech',
  'submit_vote',
  'submit_night_action',
  'submit_sheriff_action',
  'trigger_skill',
]) {
  if (
    !skill.includes(tool) &&
    !(await text(resolve(skillRoot, 'references/actions.md'))).includes(tool)
  ) {
    errors.push(`skill does not document ${tool}`)
  }
}
for (const path of ['agents/openai.yaml', 'references/actions.md']) {
  try {
    await access(resolve(skillRoot, path))
  } catch {
    errors.push(`skill is missing ${path}`)
  }
}
const metadata = await text(resolve(skillRoot, 'agents/openai.yaml'))
if (!/display_name:\s*['"]AgentWolf Player['"]/.test(metadata))
  errors.push('skill UI display name is stale')

failIfErrors(errors, 'skills')
