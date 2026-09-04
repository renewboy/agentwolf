import { mkdirSync } from 'node:fs'
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { DatabaseSync, type SQLInputValue } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import {
  deleteCodeBuddyHostSessions,
  deleteCodexFamilyHostSessions,
  type HostSessionOwner,
} from '../src/provider-session-storage.js'

const roots: string[] = []
const targetId = '01a065d0-1111-7111-8111-111111111111'
const retainedId = '01a065d0-2222-7222-8222-222222222222'

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('Provider host Session storage', () => {
  it('physically deletes one Codex-family Session across files, SQLite, and UI indexes', async () => {
    const root = await temporaryRoot('agentwolf-codex-host-delete-')
    const targetWorkspace = resolve(root, 'matches', 'target', 'players', 'player-1', 'workspace')
    const retainedWorkspace = resolve(
      root,
      'matches',
      'retained',
      'players',
      'player-1',
      'workspace',
    )
    await Promise.all([
      mkdir(targetWorkspace, { recursive: true }),
      mkdir(retainedWorkspace, { recursive: true }),
    ])
    const targetSession = resolve(root, 'archived_sessions', `rollout-${targetId}.jsonl`)
    const retainedSession = resolve(
      root,
      'sessions',
      '2026',
      '09',
      '03',
      `rollout-${retainedId}.jsonl`,
    )
    await writeCodexSession(targetSession, targetId, targetWorkspace, true)
    await writeCodexSession(retainedSession, retainedId, retainedWorkspace)
    await write(resolve(targetSession.replace(/\.jsonl$/u, '.artifacts'), 'artifact.txt'), 'target')
    await write(resolve(root, 'thread-writer-locks', `${targetId}.lock`), 'target')
    await write(resolve(root, 'session-peers', `${targetId.replaceAll('-', '')}.json`), 'target')
    await write(resolve(root, 'shell_snapshots', `${targetId}.1.sh`), 'target')
    await write(
      resolve(root, 'session_index.jsonl'),
      `${JSON.stringify({ id: targetId, thread_name: 'target' })}\n${JSON.stringify({ id: retainedId, thread_name: 'retained' })}\n`,
    )
    await write(
      resolve(root, '.codex-global-state.json'),
      JSON.stringify({
        ids: [targetId, retainedId],
        bindings: { target: targetId, keep: retainedId },
      }),
    )
    createCodexFamilyDatabases(
      root,
      targetWorkspace,
      retainedWorkspace,
      targetSession,
      retainedSession,
    )

    await deleteCodexFamilyHostSessions({
      storageRoot: root,
      sessions: [owner(targetId, targetWorkspace)],
    })

    await expect(access(targetSession)).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(access(targetSession.replace(/\.jsonl$/u, '.artifacts'))).rejects.toMatchObject({
      code: 'ENOENT',
    })
    await expect(access(retainedSession)).resolves.toBeUndefined()
    for (const path of [
      resolve(root, 'thread-writer-locks', `${targetId}.lock`),
      resolve(root, 'session-peers', `${targetId.replaceAll('-', '')}.json`),
      resolve(root, 'shell_snapshots', `${targetId}.1.sh`),
    ]) {
      await expect(access(path)).rejects.toMatchObject({ code: 'ENOENT' })
    }
    expect(await readFile(resolve(root, 'session_index.jsonl'), 'utf8')).not.toContain(targetId)
    const globalState = await readFile(resolve(root, '.codex-global-state.json'), 'utf8')
    expect(globalState).not.toContain(targetId)
    expect(globalState).toContain(retainedId)
    for (const [relativePath, table] of [
      ['state_5.sqlite', 'threads'],
      ['thread_history_1.sqlite', 'thread_items'],
      ['logs_2.sqlite', 'logs'],
      ['sqlite/codex-dev.db', 'local_thread_catalog'],
    ] as const) {
      expect(databaseCount(resolve(root, relativePath), table, targetId)).toBe(0)
      expect(databaseCount(resolve(root, relativePath), table, retainedId)).toBe(1)
      expect(databaseQuickCheck(resolve(root, relativePath))).toBe('ok')
      expect(databaseFreelist(resolve(root, relativePath))).toBe(0)
    }
  })

  it('rejects a Codex-family Session whose stored workspace has another owner', async () => {
    const root = await temporaryRoot('agentwolf-codex-host-owner-')
    const expected = resolve(root, 'expected')
    const actual = resolve(root, 'actual')
    await Promise.all([mkdir(expected), mkdir(actual)])
    const session = resolve(root, 'sessions', `rollout-${targetId}.jsonl`)
    await writeCodexSession(session, targetId, actual)

    await expect(
      deleteCodexFamilyHostSessions({
        storageRoot: root,
        sessions: [owner(targetId, expected)],
      }),
    ).rejects.toThrow(/belongs to/)
    await expect(access(session)).resolves.toBeUndefined()
  })

  it('deletes exact CodeBuddy Session files, traces, logs, and state references', async () => {
    const root = await temporaryRoot('agentwolf-codebuddy-host-delete-')
    const targetWorkspace = resolve(root, 'matches', 'target', 'players', 'player-1', 'workspace')
    const retainedWorkspace = resolve(
      root,
      'matches',
      'retained',
      'players',
      'player-1',
      'workspace',
    )
    await Promise.all([
      mkdir(targetWorkspace, { recursive: true }),
      mkdir(retainedWorkspace, { recursive: true }),
    ])
    const targetSession = resolve(root, 'projects', 'target', `${targetId}.jsonl`)
    const retainedSession = resolve(root, 'projects', 'retained', `${retainedId}.jsonl`)
    await writeCodeBuddySession(targetSession, targetId, targetWorkspace)
    await writeCodeBuddySession(retainedSession, retainedId, retainedWorkspace)
    const targetTrace = resolve(root, 'traces', '1', 'trace-target.json')
    const retainedTrace = resolve(root, 'traces', '1', 'trace-retained.json')
    const targetLog = resolve(root, 'logs', '2026-09-03', 'target.log')
    await write(targetTrace, JSON.stringify({ sessionId: targetId }))
    await write(retainedTrace, JSON.stringify({ sessionId: retainedId }))
    await write(targetLog, `Session ${targetId}`)
    await write(
      resolve(root, 'user-state.json'),
      JSON.stringify({ recentSessions: [targetId, retainedId] }),
    )

    await deleteCodeBuddyHostSessions({
      storageRoot: root,
      sessions: [owner(targetId, targetWorkspace)],
    })

    for (const path of [targetSession, targetTrace, targetLog]) {
      await expect(access(path)).rejects.toMatchObject({ code: 'ENOENT' })
    }
    await expect(access(retainedSession)).resolves.toBeUndefined()
    await expect(access(retainedTrace)).resolves.toBeUndefined()
    const state = await readFile(resolve(root, 'user-state.json'), 'utf8')
    expect(state).not.toContain(targetId)
    expect(state).toContain(retainedId)
  })

  it('rejects invalid or conflicting Session identities before touching storage', async () => {
    const root = await temporaryRoot('agentwolf-host-delete-invalid-')
    await expect(
      deleteCodexFamilyHostSessions({
        storageRoot: root,
        sessions: [owner('../escape', root)],
      }),
    ).rejects.toThrow(/Invalid Provider Session ID/)
    await expect(
      deleteCodexFamilyHostSessions({
        storageRoot: root,
        sessions: [
          owner(targetId, root),
          {
            ...owner(targetId, root),
            runtimeWorkspace: resolve(root, 'other-runtime'),
          },
        ],
      }),
    ).rejects.toThrow(/Conflicting ownership/)
  })

  it('treats a repeated current-Session cleanup as idempotent', async () => {
    const root = await temporaryRoot('agentwolf-host-delete-absent-')
    const workspace = resolve(root, 'workspace')
    await mkdir(workspace)
    await writeCodexSession(
      resolve(root, 'sessions', `rollout-${targetId}.jsonl`),
      targetId,
      workspace,
    )
    await write(resolve(root, 'session_index.jsonl'), `${JSON.stringify({ id: targetId })}\n`)

    await deleteCodexFamilyHostSessions({
      storageRoot: root,
      sessions: [owner(targetId, workspace)],
    })
    await deleteCodexFamilyHostSessions({
      storageRoot: root,
      sessions: [owner(targetId, workspace)],
    })

    expect(await readFile(resolve(root, 'session_index.jsonl'), 'utf8')).toBe('')
  })

  it('rejects a target file without Codex Session metadata', async () => {
    const root = await temporaryRoot('agentwolf-host-delete-metadata-')
    const path = resolve(root, 'sessions', `rollout-${targetId}.jsonl`)
    await write(path, '')

    await expect(
      deleteCodexFamilyHostSessions({
        storageRoot: root,
        sessions: [owner(targetId, resolve(root, 'workspace'))],
      }),
    ).rejects.toThrow(/Missing session_meta/)
    await expect(access(path)).resolves.toBeUndefined()
  })
})

function createCodexFamilyDatabases(
  root: string,
  targetWorkspace: string,
  retainedWorkspace: string,
  targetSession: string,
  retainedSession: string,
): void {
  createDatabase(resolve(root, 'state_5.sqlite'), [
    'CREATE TABLE threads (id TEXT PRIMARY KEY, cwd TEXT NOT NULL, rollout_path TEXT)',
    'CREATE TABLE thread_artifacts (id TEXT PRIMARY KEY, thread_id TEXT)',
    'CREATE TABLE thread_spawn_edges (parent_thread_id TEXT, child_thread_id TEXT)',
  ])
  insertRows(resolve(root, 'state_5.sqlite'), [
    ['INSERT INTO threads VALUES (?, ?, ?)', [targetId, targetWorkspace, targetSession]],
    ['INSERT INTO threads VALUES (?, ?, ?)', [retainedId, retainedWorkspace, retainedSession]],
    ['INSERT INTO thread_artifacts VALUES (?, ?)', ['target-artifact', targetId]],
    ['INSERT INTO thread_artifacts VALUES (?, ?)', ['retained-artifact', retainedId]],
    ['INSERT INTO thread_spawn_edges VALUES (?, ?)', [targetId, retainedId]],
    ['INSERT INTO thread_spawn_edges VALUES (?, ?)', [retainedId, retainedId]],
  ])
  createDatabase(resolve(root, 'sqlite/state_5.sqlite'), [
    'CREATE TABLE threads (id TEXT PRIMARY KEY, cwd TEXT NOT NULL)',
  ])
  insertRows(resolve(root, 'sqlite/state_5.sqlite'), [
    ['INSERT INTO threads VALUES (?, ?)', [targetId, targetWorkspace]],
    ['INSERT INTO threads VALUES (?, ?)', [retainedId, retainedWorkspace]],
  ])
  createDatabase(resolve(root, 'thread_history_1.sqlite'), [
    'CREATE TABLE thread_items (thread_id TEXT)',
    'CREATE TABLE thread_turns (thread_id TEXT)',
    'CREATE TABLE thread_history_projection_state (thread_id TEXT)',
  ])
  for (const table of ['thread_items', 'thread_turns', 'thread_history_projection_state']) {
    insertIds(resolve(root, 'thread_history_1.sqlite'), table)
  }
  createDatabase(resolve(root, 'logs_2.sqlite'), ['CREATE TABLE logs (thread_id TEXT)'])
  insertIds(resolve(root, 'logs_2.sqlite'), 'logs')
  createDatabase(resolve(root, 'sqlite/codex-dev.db'), [
    'CREATE TABLE local_thread_catalog (thread_id TEXT, cwd TEXT)',
    'CREATE TABLE thread_timeline_ledger (thread_id TEXT)',
  ])
  insertRows(resolve(root, 'sqlite/codex-dev.db'), [
    ['INSERT INTO local_thread_catalog VALUES (?, ?)', [targetId, targetWorkspace]],
    ['INSERT INTO local_thread_catalog VALUES (?, ?)', [retainedId, retainedWorkspace]],
    ['INSERT INTO thread_timeline_ledger VALUES (?)', [targetId]],
    ['INSERT INTO thread_timeline_ledger VALUES (?)', [retainedId]],
  ])
}

function createDatabase(path: string, schemas: readonly string[]): void {
  mkdirSyncParent(path)
  const database = new DatabaseSync(path)
  try {
    for (const schema of schemas) database.exec(schema)
  } finally {
    database.close()
  }
}

function insertIds(path: string, table: string): void {
  insertRows(path, [
    [`INSERT INTO "${table}" VALUES (?)`, [targetId]],
    [`INSERT INTO "${table}" VALUES (?)`, [retainedId]],
  ])
}

function insertRows(
  path: string,
  rows: ReadonlyArray<readonly [string, readonly SQLInputValue[]]>,
): void {
  const database = new DatabaseSync(path)
  try {
    for (const [sql, values] of rows) database.prepare(sql).run(...values)
  } finally {
    database.close()
  }
}

function databaseCount(path: string, table: string, sessionId: string): number {
  const database = new DatabaseSync(path, { readOnly: true })
  try {
    const column = table === 'threads' ? 'id' : 'thread_id'
    const row = database
      .prepare(`SELECT count(*) AS count FROM "${table}" WHERE "${column}" = ?`)
      .get(sessionId) as { count: number }
    return Number(row.count)
  } finally {
    database.close()
  }
}

function databaseQuickCheck(path: string): string {
  const database = new DatabaseSync(path, { readOnly: true })
  try {
    return (database.prepare('PRAGMA quick_check').get() as { quick_check: string }).quick_check
  } finally {
    database.close()
  }
}

function databaseFreelist(path: string): number {
  const database = new DatabaseSync(path, { readOnly: true })
  try {
    return Number(
      (database.prepare('PRAGMA freelist_count').get() as { freelist_count: number })
        .freelist_count,
    )
  } finally {
    database.close()
  }
}

async function writeCodexSession(
  path: string,
  sessionId: string,
  cwd: string,
  legacyId = false,
): Promise<void> {
  await write(
    path,
    `${JSON.stringify({
      type: 'session_meta',
      payload: { [legacyId ? 'session_id' : 'id']: sessionId, cwd },
    })}\n`,
  )
}

async function writeCodeBuddySession(path: string, sessionId: string, cwd: string): Promise<void> {
  await write(
    path,
    `${JSON.stringify({ type: 'session-meta', sessionId })}\n${JSON.stringify({ type: 'message', cwd })}\n`,
  )
}

async function write(path: string, value: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, value, 'utf8')
}

function owner(sessionId: string, workspace: string): HostSessionOwner {
  return { sessionId, canonicalWorkspace: workspace, runtimeWorkspace: workspace }
}

function mkdirSyncParent(path: string): void {
  mkdirSync(dirname(path), { recursive: true })
}

async function temporaryRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(resolve(tmpdir(), prefix))
  roots.push(root)
  return root
}
