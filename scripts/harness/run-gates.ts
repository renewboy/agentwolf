import { runGatePhases, type RepositoryGate } from '@agent-arena/harness'

const repositoryGates: readonly RepositoryGate[] = [
  { label: 'architecture', command: 'pnpm', args: ['run', 'check:architecture'] },
  { label: 'artifacts', command: 'pnpm', args: ['run', 'check:artifacts'] },
  { label: 'docs', command: 'pnpm', args: ['run', 'check:docs'] },
  { label: 'skills', command: 'pnpm', args: ['run', 'check:skills'] },
]
const codeGates: readonly RepositoryGate[] = [
  { label: 'typecheck', command: 'pnpm', args: ['run', 'typecheck'] },
  { label: 'lint', command: 'pnpm', args: ['run', 'lint'] },
  { label: 'format', command: 'pnpm', args: ['run', 'format:check'] },
  { label: 'hygiene', command: 'pnpm', args: ['run', 'hygiene'] },
  { label: 'duplication', command: 'pnpm', args: ['run', 'duplication'] },
]

const staticPhases = [repositoryGates, codeGates] as const
const phases: Readonly<Record<string, readonly (readonly RepositoryGate[])[]>> = {
  static: staticPhases,
  all: [
    ...staticPhases,
    [{ label: 'tests', command: 'pnpm', args: ['test:coverage:raw'] }],
    [{ label: 'build', command: 'pnpm', args: ['build'] }],
  ],
}

const mode = process.argv[2] ?? 'all'
const selected = phases[mode]
if (!selected) throw new Error(`Unknown gate mode ${mode}`)

await runGatePhases(selected, {
  onStart: (gate) =>
    process.stdout.write(`\n[${gate.label}] ${gate.command} ${gate.args.join(' ')}\n`),
}).catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
})

process.stdout.write(`harness ${mode}: ok\n`)
