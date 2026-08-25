import * as nunjucks from 'nunjucks'
import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, relative, resolve, sep } from 'node:path'
import type { PluginId } from '@agentwolf/contracts'
import {
  PromptBundleManifestSchema,
  type PromptAudience,
  type PromptBundleManifest,
  type PromptEventPresentation,
} from './schema.js'

export interface LoadedPromptBundle {
  readonly id: '_core' | PluginId
  readonly root: string
  readonly manifest: PromptBundleManifest
  readonly templates: ReadonlyMap<string, string>
}

export function resolvePromptRoot(input: string | URL | undefined): string {
  return realpathSync(
    input instanceof URL
      ? fileURLToPath(input)
      : (input ?? fileURLToPath(new URL('../../prompts', import.meta.url))),
  )
}

export function loadPromptBundle(id: '_core' | PluginId, directory: string): LoadedPromptBundle {
  if (!existsSync(directory) || !statSync(directory).isDirectory()) {
    throw new Error(`Missing Prompt bundle ${id} at ${directory}`)
  }
  const root = realpathSync(directory)
  const manifestPath = containedFile(root, 'bundle.json')
  const manifest = PromptBundleManifestSchema.parse(JSON.parse(readFileSync(manifestPath, 'utf8')))
  if (manifest.pluginId !== id) {
    throw new Error(`Prompt bundle ${id} declares ${manifest.pluginId}`)
  }
  const templates = new Map<string, string>()
  for (const path of recursiveFiles(root)) {
    const localPath = relative(root, path)
    if (localPath === 'bundle.json') continue
    if (!localPath.endsWith('.njk')) throw new Error(`Unsupported Prompt bundle file ${path}`)
    templates.set(`${id}/${localPath.split(sep).join('/')}`, readFileSync(path, 'utf8'))
  }
  for (const reference of manifestTemplateReferences(manifest)) {
    const name = resolvePromptTemplate(id, reference)
    const owner = name.slice(0, name.indexOf('/'))
    if (owner === id && !templates.has(name)) {
      throw new Error(`Prompt bundle ${id} references missing template ${reference}`)
    }
  }
  return { id, root, manifest, templates }
}

export function promptEnvironment(bundles: readonly LoadedPromptBundle[]): nunjucks.Environment {
  const templates = new Map<string, string>()
  for (const bundle of bundles) {
    for (const [name, source] of bundle.templates) templates.set(name, source)
  }
  return new nunjucks.Environment(new FrozenTemplateLoader(templates), {
    autoescape: false,
    throwOnUndefined: true,
    trimBlocks: false,
    lstripBlocks: false,
  })
}

export function bundleEventPresentations(
  manifest: PromptBundleManifest,
): PromptEventPresentation[] {
  return [
    ...manifest.events,
    ...manifest.announcements.map(
      (announcement): PromptEventPresentation => ({
        eventType: 'public.announcement',
        where: { code: announcement.code },
        audience: announcement.audience,
        paragraphAfter: false,
        ...(announcement.text !== undefined ? { text: announcement.text } : {}),
        ...(announcement.template !== undefined ? { template: announcement.template } : {}),
        ...(announcement.omit ? { omit: true as const } : {}),
      }),
    ),
  ]
}

export function validatePromptBundleGraph(bundles: readonly LoadedPromptBundle[]): void {
  const byId = new Map(bundles.map((bundle) => [bundle.id, bundle]))
  for (const bundle of bundles) {
    for (const imported of bundle.manifest.imports) {
      if (!byId.has(imported)) {
        throw new Error(`Prompt bundle ${bundle.id} imports missing ${imported}`)
      }
    }
    for (const entry of externalManifestReferences(bundle)) {
      const importedName = resolvePromptTemplate(bundle.id, entry.reference)
      const importedBundleId = importedName.slice(0, importedName.indexOf('/')) as
        | '_core'
        | PluginId
      if (importedBundleId !== '_core' && !bundle.manifest.imports.includes(importedBundleId)) {
        throw new Error(`Prompt bundle ${bundle.id} references undeclared ${importedBundleId}`)
      }
      const importedBundle = byId.get(importedBundleId)
      const shared = importedBundle?.manifest.shared.find(
        (candidate) => resolvePromptTemplate(importedBundleId, candidate.template) === importedName,
      )
      if (!shared) {
        throw new Error(`Prompt bundle ${bundle.id} references non-shared asset ${importedName}`)
      }
      if (!audienceCanImport(entry.audience, shared.audience)) {
        throw new Error(
          `Prompt bundle ${bundle.id} cannot use ${shared.audience} asset ${importedName}`,
        )
      }
    }
    for (const [name, source] of bundle.templates) {
      const usageAudience = templateAudience(bundle, name)
      for (const importedName of staticTemplateImports(source, name)) {
        const slash = importedName.indexOf('/')
        if (slash < 1) {
          throw new Error(`Prompt template ${name} uses an unqualified import ${importedName}`)
        }
        const importedBundleId = importedName.slice(0, slash) as '_core' | PluginId
        if (
          importedBundleId !== bundle.id &&
          importedBundleId !== '_core' &&
          !bundle.manifest.imports.includes(importedBundleId)
        ) {
          throw new Error(`Prompt template ${name} imports undeclared bundle ${importedBundleId}`)
        }
        const importedBundle = byId.get(importedBundleId)
        if (!importedBundle?.templates.has(importedName)) {
          throw new Error(`Prompt template ${name} imports missing ${importedName}`)
        }
        if (importedBundleId !== bundle.id && importedBundleId !== '_core') {
          const shared = importedBundle.manifest.shared.find(
            (entry) => resolvePromptTemplate(importedBundleId, entry.template) === importedName,
          )
          if (!shared) {
            throw new Error(`Prompt template ${name} imports non-shared asset ${importedName}`)
          }
          if (!audienceCanImport(usageAudience, shared.audience)) {
            throw new Error(
              `Prompt template ${name} cannot import ${shared.audience} asset ${importedName}`,
            )
          }
        }
      }
    }
  }
  validateImportCycles(bundles)
}

function externalManifestReferences(
  bundle: LoadedPromptBundle,
): Array<{ reference: string; audience: PromptAudience }> {
  const result: Array<{ reference: string; audience: PromptAudience }> = []
  const add = (reference: string | null | undefined, audience: PromptAudience) => {
    if (reference?.startsWith('@')) result.push({ reference, audience })
  }
  for (const phase of bundle.manifest.phases) add(phase.template, phase.audience)
  for (const event of bundleEventPresentations(bundle.manifest)) {
    add(event.template, event.audience)
  }
  for (const role of bundle.manifest.roles) {
    for (const ability of role.abilities) add(ability.interruptTemplate, 'player')
  }
  return result
}

export function precompilePromptTemplates(
  environment: nunjucks.Environment,
  bundles: readonly LoadedPromptBundle[],
): void {
  for (const bundle of bundles) {
    for (const name of bundle.templates.keys()) environment.getTemplate(name, true)
  }
}

export function resolvePromptTemplate(bundleId: '_core' | PluginId, reference: string): string {
  return reference.startsWith('@') ? reference.slice(1) : `${bundleId}/${reference}`
}

export function validateCorePromptTools(manifest: PromptBundleManifest): void {
  const names = (manifest.core?.tools ?? []).map((tool) => tool.name)
  if (new Set(names).size !== names.length) {
    throw new Error('Core Prompt tool declarations must be unique')
  }
}

export function assertPromptRootHasNoLocale(root: string): void {
  for (const path of recursiveFiles(root)) {
    const segments = relative(root, path).split(sep)
    if (
      segments.some((segment) => /^(?:[a-z]{2}(?:-[A-Z]{2})?|locale|locales|i18n)$/.test(segment))
    ) {
      throw new Error(`Prompt assets cannot introduce a locale axis: ${path}`)
    }
  }
}

class FrozenTemplateLoader extends nunjucks.Loader {
  public constructor(private readonly templates: ReadonlyMap<string, string>) {
    super()
  }

  public getSource(name: string): nunjucks.LoaderSource {
    const source = this.templates.get(name)
    if (source === undefined) throw new Error(`Unknown Prompt template ${name}`)
    return { src: source, path: name, noCache: false }
  }
}

function recursiveFiles(root: string): string[] {
  const result: string[] = []
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name)
    if (entry.isSymbolicLink()) throw new Error(`Prompt bundles cannot contain symlinks: ${path}`)
    if (entry.isDirectory()) result.push(...recursiveFiles(path))
    else result.push(containedFile(root, entry.name))
  }
  return result
}

function containedFile(root: string, localPath: string): string {
  const path = realpathSync(resolve(root, localPath))
  if (path !== root && !path.startsWith(`${root}${sep}`)) {
    throw new Error(`Prompt path escapes bundle ${root}: ${localPath}`)
  }
  return path
}

function manifestTemplateReferences(manifest: PromptBundleManifest): string[] {
  return [
    ...(manifest.core ? Object.values(manifest.core.layouts) : []),
    ...manifest.shared.map((entry) => entry.template),
    ...manifest.roles.flatMap((role) => [
      role.template,
      ...role.abilities.flatMap((ability) => ability.interruptTemplate ?? []),
    ]),
    ...manifest.phases.flatMap((phase) => phase.template ?? []),
    ...manifest.events.flatMap((event) => event.template ?? []),
    ...manifest.announcements.flatMap((announcement) => announcement.template ?? []),
  ]
}

function validateImportCycles(bundles: readonly LoadedPromptBundle[]): void {
  const byId = new Map(bundles.map((bundle) => [bundle.id, bundle]))
  const visiting = new Set<string>()
  const visited = new Set<string>()
  const visit = (id: string, path: readonly string[]): void => {
    if (visited.has(id)) return
    if (visiting.has(id)) {
      throw new Error(`Prompt bundle import cycle: ${[...path, id].join(' -> ')}`)
    }
    visiting.add(id)
    for (const dependency of byId.get(id as '_core' | PluginId)?.manifest.imports ?? []) {
      visit(dependency, [...path, id])
    }
    visiting.delete(id)
    visited.add(id)
  }
  for (const bundle of bundles) visit(bundle.id, [])
}

function templateAudience(bundle: LoadedPromptBundle, name: string): PromptAudience {
  const audiences: PromptAudience[] = []
  const add = (reference: string | null | undefined, audience: PromptAudience) => {
    if (reference && resolvePromptTemplate(bundle.id, reference) === name) audiences.push(audience)
  }
  for (const role of bundle.manifest.roles) add(role.template, 'public')
  for (const role of bundle.manifest.roles) {
    for (const ability of role.abilities) add(ability.interruptTemplate, 'player')
  }
  for (const phase of bundle.manifest.phases) add(phase.template, phase.audience)
  for (const event of bundleEventPresentations(bundle.manifest)) add(event.template, event.audience)
  for (const shared of bundle.manifest.shared) add(shared.template, shared.audience)
  if (bundle.manifest.core) {
    for (const reference of Object.values(bundle.manifest.core.layouts)) add(reference, 'public')
  }
  return audiences.includes('public') ? 'public' : (audiences[0] ?? 'public')
}

function audienceCanImport(importer: PromptAudience, imported: PromptAudience): boolean {
  if (imported === 'public') return true
  if (importer === 'god') return true
  return importer === imported
}

function staticTemplateImports(source: string, name: string): string[] {
  const tags = source.match(/\{%\s*(?:include|extends|import|from)\b[^%]*%\}/g) ?? []
  return tags.map((tag) => {
    const match = tag.match(/["']([^"']+)["']/)
    if (!match) throw new Error(`Prompt template ${name} uses a dynamic import`)
    return match[1]!
  })
}
