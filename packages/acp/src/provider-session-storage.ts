import { existsSync } from 'node:fs'
import {
  readFile,
  readdir,
  realpath,
  rename,
  rmdir,
  rm,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises'
import { basename, dirname, relative, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

export interface HostSessionOwner {
  readonly sessionId: string
  readonly canonicalWorkspace: string
  readonly runtimeWorkspace: string
}

export interface HostSessionDeletionInput {
  readonly storageRoot: string
  readonly sessions: readonly HostSessionOwner[]
}

interface ThreadRow {
  readonly id: string
  readonly cwd: string | null
  readonly rollout_path?: string | null
}

interface DatabaseDeletePlan {
  readonly relativePath: string
  readonly tables: readonly {
    readonly name: string
    readonly columns: readonly string[]
  }[]
}

const sessionIdPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,319}$/u

const codexFamilyDatabasePlans: readonly DatabaseDeletePlan[] = [
  {
    relativePath: 'state_5.sqlite',
    tables: [
      { name: 'thread_artifacts', columns: ['thread_id'] },
      { name: 'thread_dynamic_tools', columns: ['thread_id'] },
      { name: 'thread_spawn_completion_deliveries', columns: ['child_thread_id'] },
      { name: 'thread_spawn_edges', columns: ['parent_thread_id', 'child_thread_id'] },
      { name: 'inbox_offsets', columns: ['thread_id'] },
      { name: 'workflow_node_attempts', columns: ['agent_thread_id'] },
      { name: 'workflow_nodes', columns: ['artifact_owner_thread_id'] },
      { name: 'workflow_revisions', columns: ['owner_thread_id'] },
      { name: 'workflow_runs', columns: ['owner_thread_id'] },
      { name: 'workflow_definitions', columns: ['owner_thread_id'] },
      { name: 'workflow_artifacts', columns: ['owner_thread_id'] },
      { name: 'threads', columns: ['id'] },
    ],
  },
  {
    relativePath: 'thread_history_1.sqlite',
    tables: [
      { name: 'thread_realtime_items', columns: ['thread_id'] },
      { name: 'thread_items', columns: ['thread_id'] },
      { name: 'thread_turns', columns: ['thread_id'] },
      { name: 'thread_history_projection_state', columns: ['thread_id'] },
    ],
  },
  { relativePath: 'logs_2.sqlite', tables: [{ name: 'logs', columns: ['thread_id'] }] },
  {
    relativePath: 'goals_1.sqlite',
    tables: [
      { name: 'thread_goal_continuation_deferrals', columns: ['thread_id'] },
      { name: 'legacy_thread_goal_backfill', columns: ['thread_id'] },
      { name: 'thread_goals', columns: ['thread_id'] },
    ],
  },
  {
    relativePath: 'memories_1.sqlite',
    tables: [{ name: 'stage1_outputs', columns: ['thread_id'] }],
  },
  {
    relativePath: 'queue_1.sqlite',
    tables: [
      { name: 'queued_items', columns: ['thread_id'] },
      { name: 'queued_thread_revisions', columns: ['thread_id'] },
    ],
  },
  {
    relativePath: 'sqlite/state_5.sqlite',
    tables: [
      { name: 'thread_dynamic_tools', columns: ['thread_id'] },
      { name: 'thread_spawn_edges', columns: ['parent_thread_id', 'child_thread_id'] },
      { name: 'agent_job_items', columns: ['assigned_thread_id'] },
      { name: 'threads', columns: ['id'] },
    ],
  },
  {
    relativePath: 'sqlite/logs_2.sqlite',
    tables: [{ name: 'logs', columns: ['thread_id'] }],
  },
  {
    relativePath: 'sqlite/goals_1.sqlite',
    tables: [{ name: 'thread_goals', columns: ['thread_id'] }],
  },
  {
    relativePath: 'sqlite/memories_1.sqlite',
    tables: [{ name: 'stage1_outputs', columns: ['thread_id'] }],
  },
  {
    relativePath: 'sqlite/codex-dev.db',
    tables: [
      { name: 'automation_runs', columns: ['thread_id'] },
      { name: 'automations', columns: ['target_thread_id'] },
      { name: 'inbox_items', columns: ['thread_id'] },
      { name: 'thread_timeline_ledger', columns: ['thread_id'] },
      { name: 'local_thread_catalog', columns: ['thread_id'] },
    ],
  },
  {
    relativePath: 'sqlite/codex-history-snapshots-dev.db',
    tables: [{ name: 'app_server_history_snapshots', columns: ['thread_id'] }],
  },
]

export async function deleteCodexFamilyHostSessions(
  input: HostSessionDeletionInput,
): Promise<void> {
  const storageRoot = resolve(input.storageRoot)
  const owners = sessionOwners(input.sessions)
  const sessionFiles = await findCodexFamilySessionFiles(storageRoot, owners)
  await validateDatabaseOwners(storageRoot, owners)
  for (const path of sessionFiles) {
    await unlink(path)
    const artifacts = path.replace(/\.jsonl$/u, '.artifacts')
    await rm(artifacts, { recursive: true, force: true })
    await pruneEmptyDirectories(dirname(path), sessionRootFor(storageRoot, path))
  }
  await deleteAuxiliaryFiles(storageRoot, owners)
  await rewriteJsonLines(resolve(storageRoot, 'session_index.jsonl'), owners)
  await rewriteJsonState(resolve(storageRoot, '.codex-global-state.json'), owners)
  for (const plan of codexFamilyDatabasePlans) {
    deleteDatabaseRows(resolve(storageRoot, plan.relativePath), owners, plan)
  }
}

export async function deleteCodeBuddyHostSessions(input: HostSessionDeletionInput): Promise<void> {
  const storageRoot = resolve(input.storageRoot)
  const owners = sessionOwners(input.sessions)
  const projectFiles = await findCodeBuddySessionFiles(storageRoot, owners)
  for (const path of projectFiles) {
    await unlink(path)
    await pruneEmptyDirectories(dirname(path), resolve(storageRoot, 'projects'))
  }
  for (const directory of ['traces', 'logs']) {
    const root = resolve(storageRoot, directory)
    for (const path of await walkFiles(root)) {
      const text = await readFile(path, 'utf8')
      if (![...owners.keys()].some((id) => text.includes(id))) continue
      await unlink(path)
      await pruneEmptyDirectories(dirname(path), root)
    }
  }
  await rewriteJsonState(resolve(storageRoot, 'user-state.json'), owners)
}

function sessionOwners(sessions: readonly HostSessionOwner[]): Map<string, HostSessionOwner> {
  const owners = new Map<string, HostSessionOwner>()
  for (const session of sessions) {
    if (!sessionIdPattern.test(session.sessionId)) {
      throw new Error(`Invalid Provider Session ID ${session.sessionId}`)
    }
    const existing = owners.get(session.sessionId)
    if (
      existing &&
      (existing.canonicalWorkspace !== session.canonicalWorkspace ||
        existing.runtimeWorkspace !== session.runtimeWorkspace)
    ) {
      throw new Error(`Conflicting ownership for Provider Session ${session.sessionId}`)
    }
    owners.set(session.sessionId, session)
  }
  return owners
}

async function findCodexFamilySessionFiles(
  storageRoot: string,
  owners: ReadonlyMap<string, HostSessionOwner>,
): Promise<string[]> {
  const candidates = new Set<string>()
  for (const rootName of ['sessions', 'archived_sessions']) {
    const root = resolve(storageRoot, rootName)
    for (const path of await walkFiles(root)) {
      if (
        path.endsWith('.jsonl') &&
        [...owners.keys()].some((sessionId) => basename(path).includes(sessionId))
      ) {
        candidates.add(path)
      }
    }
  }
  for (const dbPath of [
    resolve(storageRoot, 'state_5.sqlite'),
    resolve(storageRoot, 'sqlite/state_5.sqlite'),
  ]) {
    for (const row of readThreadRows(dbPath, owners.keys())) {
      if (row.rollout_path) candidates.add(resolve(row.rollout_path))
    }
  }
  const files: string[] = []
  for (const path of candidates) {
    if (!isInside(storageRoot, path)) {
      throw new Error(`Provider Session path escapes its host store: ${path}`)
    }
    if (!existsSync(path)) continue
    const meta = await readCodexSessionMeta(path)
    const owner = owners.get(meta.id)
    if (!owner) continue
    await requireExpectedWorkspace(meta.cwd, owner, meta.id)
    files.push(path)
  }
  return files
}

async function findCodeBuddySessionFiles(
  storageRoot: string,
  owners: ReadonlyMap<string, HostSessionOwner>,
): Promise<string[]> {
  const files: string[] = []
  for (const path of await walkFiles(resolve(storageRoot, 'projects'))) {
    if (!path.endsWith('.jsonl')) continue
    const owner = owners.get(basename(path, '.jsonl'))
    if (!owner) continue
    const meta = await readCodeBuddySessionMeta(path)
    if (meta.id !== owner.sessionId) {
      throw new Error(`CodeBuddy Session ID mismatch in ${path}`)
    }
    await requireExpectedWorkspace(meta.cwd, owner, meta.id)
    files.push(path)
  }
  return files
}

async function validateDatabaseOwners(
  storageRoot: string,
  owners: ReadonlyMap<string, HostSessionOwner>,
): Promise<void> {
  for (const path of [
    resolve(storageRoot, 'state_5.sqlite'),
    resolve(storageRoot, 'sqlite/state_5.sqlite'),
  ]) {
    for (const row of readThreadRows(path, owners.keys())) {
      const owner = owners.get(row.id)
      if (owner && row.cwd) await requireExpectedWorkspace(row.cwd, owner, row.id)
    }
  }
  const catalogPath = resolve(storageRoot, 'sqlite/codex-dev.db')
  if (!existsSync(catalogPath)) return
  const database = new DatabaseSync(catalogPath, { readOnly: true })
  try {
    if (!hasColumns(database, 'local_thread_catalog', ['thread_id', 'cwd'])) return
    const statement = database.prepare(
      'SELECT thread_id AS id, cwd FROM local_thread_catalog WHERE thread_id = ?',
    )
    for (const sessionId of owners.keys()) {
      for (const row of statement.all(sessionId) as unknown as ThreadRow[]) {
        const owner = owners.get(row.id)
        if (owner && row.cwd) await requireExpectedWorkspace(row.cwd, owner, row.id)
      }
    }
  } finally {
    database.close()
  }
}

function readThreadRows(path: string, sessionIds: Iterable<string>): ThreadRow[] {
  if (!existsSync(path)) return []
  const database = new DatabaseSync(path, { readOnly: true })
  try {
    if (!hasColumns(database, 'threads', ['id', 'cwd'])) return []
    const hasRolloutPath = hasColumns(database, 'threads', ['rollout_path'])
    const statement = database.prepare(
      `SELECT id, cwd${hasRolloutPath ? ', rollout_path' : ''} FROM threads WHERE id = ?`,
    )
    return [...sessionIds].flatMap(
      (sessionId) => statement.all(sessionId) as unknown as ThreadRow[],
    )
  } finally {
    database.close()
  }
}

function deleteDatabaseRows(
  path: string,
  owners: ReadonlyMap<string, HostSessionOwner>,
  plan: DatabaseDeletePlan,
): void {
  if (!existsSync(path)) return
  const database = new DatabaseSync(path)
  let changed = 0
  try {
    database.exec('PRAGMA busy_timeout=30000; PRAGMA foreign_keys=ON; PRAGMA secure_delete=ON;')
    database.exec('BEGIN IMMEDIATE')
    try {
      for (const table of plan.tables) {
        if (!hasColumns(database, table.name, table.columns)) continue
        const condition = table.columns.map((column) => `"${column}" = ?`).join(' OR ')
        const statement = database.prepare(`DELETE FROM "${table.name}" WHERE ${condition}`)
        for (const sessionId of owners.keys()) {
          const result = statement.run(...table.columns.map(() => sessionId))
          changed += Number(result.changes)
        }
      }
      database.exec('COMMIT')
    } catch (error) {
      database.exec('ROLLBACK')
      throw error
    }
    if (changed > 0) {
      database.exec('PRAGMA wal_checkpoint(TRUNCATE); VACUUM; PRAGMA wal_checkpoint(TRUNCATE);')
    }
    const quickCheck = database.prepare('PRAGMA quick_check').get() as
      | { quick_check?: string }
      | undefined
    if (quickCheck?.quick_check !== 'ok') throw new Error(`SQLite quick_check failed for ${path}`)
  } finally {
    database.close()
  }
}

function hasColumns(database: DatabaseSync, table: string, required: readonly string[]): boolean {
  const tableExists = database
    .prepare("SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(table) as { present?: number } | undefined
  if (!tableExists?.present) return false
  const columns = new Set(
    (
      database.prepare('SELECT name FROM pragma_table_info(?)').all(table) as Array<{
        name: string
      }>
    ).map((row) => row.name),
  )
  return required.every((column) => columns.has(column))
}

async function readCodexSessionMeta(path: string): Promise<{ id: string; cwd: string }> {
  const line = (await readFile(path, 'utf8')).split(/\r?\n/u).find(Boolean)
  const record = line ? (JSON.parse(line) as Record<string, unknown>) : null
  const payload = record?.['type'] === 'session_meta' ? record['payload'] : null
  if (!isRecord(payload)) throw new Error(`Missing session_meta in ${path}`)
  const id = payload['id'] ?? payload['session_id']
  if (typeof id !== 'string' || typeof payload['cwd'] !== 'string') {
    throw new Error(`Invalid session_meta in ${path}`)
  }
  return { id, cwd: payload['cwd'] }
}

async function readCodeBuddySessionMeta(path: string): Promise<{ id: string; cwd: string }> {
  let id: string | null = null
  let cwd: string | null = null
  for (const line of (await readFile(path, 'utf8')).split(/\r?\n/u)) {
    if (!line) continue
    const record = JSON.parse(line) as Record<string, unknown>
    if (record['type'] === 'session-meta' && typeof record['sessionId'] === 'string') {
      id = record['sessionId']
    }
    if (typeof record['cwd'] === 'string') cwd = record['cwd']
    if (id && cwd) return { id, cwd }
  }
  throw new Error(`Invalid CodeBuddy Session metadata in ${path}`)
}

async function requireExpectedWorkspace(
  storedCwd: string,
  owner: HostSessionOwner,
  sessionId: string,
): Promise<void> {
  const expected = new Set(
    await Promise.all(
      [owner.canonicalWorkspace, owner.runtimeWorkspace].map((path) => comparablePath(path)),
    ),
  )
  if (!expected.has(await comparablePath(storedCwd))) {
    throw new Error(`Provider Session ${sessionId} belongs to ${storedCwd}`)
  }
}

async function comparablePath(path: string): Promise<string> {
  const suffix: string[] = []
  let candidate = resolve(path)
  for (;;) {
    try {
      return resolve(await realpath(candidate), ...suffix.reverse())
    } catch (error) {
      if (!isMissingPath(error)) throw error
      const parent = dirname(candidate)
      if (parent === candidate) return resolve(path)
      suffix.push(basename(candidate))
      candidate = parent
    }
  }
}

async function deleteAuxiliaryFiles(
  storageRoot: string,
  owners: ReadonlyMap<string, HostSessionOwner>,
): Promise<void> {
  for (const sessionId of owners.keys()) {
    const direct = [
      resolve(storageRoot, 'thread-writer-locks', `${sessionId}.lock`),
      resolve(storageRoot, 'session-peers', `${sessionId.replaceAll('-', '')}.json`),
    ]
    for (const path of direct) await unlink(path).catch(ignoreMissingPath)
    const snapshots = resolve(storageRoot, 'shell_snapshots')
    for (const path of await walkFiles(snapshots)) {
      if (basename(path).startsWith(`${sessionId}.`)) await unlink(path)
    }
  }
}

async function rewriteJsonLines(
  path: string,
  owners: ReadonlyMap<string, HostSessionOwner>,
): Promise<void> {
  if (!existsSync(path)) return
  const source = await readFile(path, 'utf8')
  const lines = source.split(/\r?\n/u)
  const retained = lines.filter((line) => {
    if (!line) return false
    const record = JSON.parse(line) as Record<string, unknown>
    return typeof record['id'] !== 'string' || !owners.has(record['id'])
  })
  if (retained.length === lines.filter(Boolean).length) return
  await replaceFile(path, `${retained.join('\n')}${retained.length ? '\n' : ''}`)
}

async function rewriteJsonState(
  path: string,
  owners: ReadonlyMap<string, HostSessionOwner>,
): Promise<void> {
  if (!existsSync(path)) return
  const source = await readFile(path, 'utf8')
  if (![...owners.keys()].some((id) => source.includes(id))) return
  const scrub = (value: unknown): unknown => {
    if (typeof value === 'string') return owners.has(value) ? undefined : value
    if (Array.isArray(value)) return value.map(scrub).filter((entry) => entry !== undefined)
    if (!isRecord(value)) return value
    return Object.fromEntries(
      Object.entries(value).flatMap(([key, entry]) => {
        if (owners.has(key)) return []
        const next = scrub(entry)
        return next === undefined ? [] : [[key, next]]
      }),
    )
  }
  await replaceFile(path, JSON.stringify(scrub(JSON.parse(source))))
}

async function replaceFile(path: string, value: string): Promise<void> {
  const mode = (await stat(path)).mode & 0o777
  const temporary = `${path}.agentwolf-delete-${process.pid}`
  try {
    await writeFile(temporary, value, { encoding: 'utf8', mode })
    await rename(temporary, path)
  } finally {
    await unlink(temporary).catch(ignoreMissingPath)
  }
}

async function walkFiles(root: string): Promise<string[]> {
  const files: string[] = []
  try {
    for (const entry of await readdir(root, { withFileTypes: true })) {
      const path = resolve(root, entry.name)
      if (entry.isDirectory()) files.push(...(await walkFiles(path)))
      else if (entry.isFile()) files.push(path)
    }
  } catch (error) {
    if (!isMissingPath(error)) throw error
  }
  return files
}

async function pruneEmptyDirectories(path: string, stop: string): Promise<void> {
  let current = path
  while (current !== stop && isInside(stop, current)) {
    try {
      await rmdir(current)
    } catch (error) {
      if (isMissingPath(error) || hasErrorCode(error, 'ENOTEMPTY')) {
        return
      }
      throw error
    }
    current = dirname(current)
  }
}

function sessionRootFor(storageRoot: string, path: string): string {
  const archived = resolve(storageRoot, 'archived_sessions')
  return isInside(archived, path) ? archived : resolve(storageRoot, 'sessions')
}

function isInside(root: string, path: string): boolean {
  const local = relative(resolve(root), resolve(path))
  return local !== '' && !local.startsWith('..')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function ignoreMissingPath(error: unknown): void {
  if (!isMissingPath(error)) throw error
}

function isMissingPath(error: unknown): boolean {
  return hasErrorCode(error, 'ENOENT')
}

function hasErrorCode(error: unknown, code: string): boolean {
  return isRecord(error) && error['code'] === code
}
