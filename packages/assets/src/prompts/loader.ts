import * as nunjucks from 'nunjucks'
import { fileURLToPath } from 'node:url'
import type { PluginId } from '@agentwolf/contracts'
import {
  assertPromptRootHasNoLocale as assertCorePromptRootHasNoLocale,
  loadPromptBundle as loadCorePromptBundle,
  precompilePromptTemplates as precompileCorePromptTemplates,
  promptEnvironment as corePromptEnvironment,
  resolvePromptRoot as resolveCorePromptRoot,
  resolvePromptTemplate,
  validatePromptBundleGraph as validateCorePromptBundleGraph,
  type LoadedPromptBundle as CoreLoadedPromptBundle,
  type PromptAudienceClass,
  type PromptBundleAdapter,
  type PromptTemplateReference,
} from '@agent-arena/prompt-runtime'
import {
  PromptBundleManifestSchema,
  type PromptAudience,
  type PromptBundleManifest,
  type PromptEventPresentation,
} from './schema.js'

type BundleId = '_core' | PluginId

export type LoadedPromptBundle = CoreLoadedPromptBundle<PromptBundleManifest, BundleId>

const bundleAdapter: PromptBundleAdapter<PromptBundleManifest, BundleId, PromptAudience> = {
  parseManifest: (input) => PromptBundleManifestSchema.parse(input),
  bundleId: (manifest) => manifest.pluginId,
  imports: (manifest) => manifest.imports,
  templateReferences: (manifest) => manifestTemplateReferences(manifest),
  sharedTemplates: (manifest) =>
    manifest.shared.map((entry) => ({
      reference: entry.template,
      audience: entry.audience,
    })),
  normalizeAudience: promptAudienceClass,
  isImplicitImport: (_owner, imported) => imported === '_core',
}

export function resolvePromptRoot(input: string | URL | undefined): string {
  return resolveCorePromptRoot(
    input instanceof URL
      ? fileURLToPath(input)
      : (input ?? fileURLToPath(new URL('../../prompts', import.meta.url))),
  )
}

export function loadPromptBundle(id: BundleId, directory: string): LoadedPromptBundle {
  return loadCorePromptBundle(id, directory, bundleAdapter)
}

export function promptEnvironment(bundles: readonly LoadedPromptBundle[]): nunjucks.Environment {
  return corePromptEnvironment(bundles)
}

export function validatePromptBundleGraph(bundles: readonly LoadedPromptBundle[]): void {
  try {
    validateCorePromptBundleGraph(bundles, bundleAdapter)
  } catch (error) {
    if (!(error instanceof Error)) throw error
    throw new Error(legacyAudienceMessage(error.message), { cause: error })
  }
}

export function precompilePromptTemplates(
  environment: nunjucks.Environment,
  bundles: readonly LoadedPromptBundle[],
): void {
  precompileCorePromptTemplates(environment, bundles)
}

export { resolvePromptTemplate }

export function assertPromptRootHasNoLocale(root: string): void {
  assertCorePromptRootHasNoLocale(root)
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

export function validateCorePromptTools(manifest: PromptBundleManifest): void {
  const names = (manifest.core?.tools ?? []).map((tool) => tool.name)
  if (new Set(names).size !== names.length) {
    throw new Error('Core Prompt tool declarations must be unique')
  }
}

function manifestTemplateReferences(
  manifest: PromptBundleManifest,
): PromptTemplateReference<PromptAudience>[] {
  const references: PromptTemplateReference<PromptAudience>[] = []
  const add = (reference: string | null | undefined, audience: PromptAudience) => {
    if (reference) references.push({ reference, audience })
  }
  for (const shared of manifest.shared) add(shared.template, shared.audience)
  for (const role of manifest.roles) {
    add(role.template, 'public')
    for (const ability of role.abilities) add(ability.interruptTemplate, 'player')
  }
  for (const phase of manifest.phases) add(phase.template, phase.audience)
  for (const event of bundleEventPresentations(manifest)) add(event.template, event.audience)
  if (manifest.core) {
    for (const reference of Object.values(manifest.core.layouts)) add(reference, 'public')
  }
  return references
}

function promptAudienceClass(audience: PromptAudience): PromptAudienceClass {
  switch (audience) {
    case 'public':
      return 'public'
    case 'player':
      return 'participant'
    case 'faction':
      return 'group'
    case 'god':
      return 'host'
    default: {
      const exhaustive: never = audience
      return exhaustive
    }
  }
}

function legacyAudienceMessage(message: string): string {
  return message
    .replace('cannot import participant asset', 'cannot use player asset')
    .replace('cannot import group asset', 'cannot use faction asset')
    .replace('cannot import host asset', 'cannot use god asset')
}
