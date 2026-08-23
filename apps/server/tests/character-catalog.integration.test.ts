import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { CharacterCardInput } from '@agentwolf/contracts'
import { buildServer, type AgentWolfServer } from '../src/app.js'

const roots: string[] = []
const servers: AgentWolfServer[] = []

afterEach(async () => {
  await Promise.allSettled(servers.splice(0).map((server) => server.close()))
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('Character catalog', () => {
  it('serves twelve built-ins and supports upload, copy, edit, board defaults, and snapshots', async () => {
    const server = await createServer()
    const listed = await server.app.inject({ method: 'GET', url: '/api/characters' })
    expect(listed.statusCode).toBe(200)
    expect(listed.json()).toHaveLength(12)
    const conan = listed.json()[0]
    expect(conan).toMatchObject({
      id: 'character-edogawa-conan',
      editable: false,
      source: 'built-in',
    })
    const portrait = await server.app.inject({
      method: 'GET',
      url: `/api/character-assets/${conan.portraitAssetId}`,
    })
    expect(portrait.statusCode).toBe(200)
    expect(portrait.headers['content-type']).toContain('image/png')

    const uploaded = await server.app.inject({
      method: 'POST',
      url: '/api/character-assets',
      payload: { dataUrl: validWebpDataUrl },
    })
    expect(uploaded.statusCode).toBe(201)
    expect(uploaded.json()).toMatchObject({ mediaType: 'image/webp' })

    const copiedResponse = await server.app.inject({
      method: 'POST',
      url: '/api/characters/character-edogawa-conan/copy',
    })
    expect(copiedResponse.statusCode).toBe(201)
    const copied = copiedResponse.json()
    expect(copied).toMatchObject({ source: 'custom', editable: true, revision: 1 })
    const updateInput: CharacterCardInput = {
      name: '侦探角色',
      universe: copied.universe,
      summary: copied.summary,
      personality: copied.personality,
      socialStyle: copied.socialStyle,
      reasoningPresentation: copied.reasoningPresentation,
      speechStyle: copied.speechStyle,
      boundaries: copied.boundaries,
      portraitAssetId: uploaded.json().id,
    }
    const updatedResponse = await server.app.inject({
      method: 'PUT',
      url: `/api/characters/${copied.id}`,
      payload: updateInput,
    })
    expect(updatedResponse.statusCode).toBe(200)
    expect(updatedResponse.json()).toMatchObject({ name: '侦探角色', revision: 2 })

    const board = server.boards.create({
      name: 'Character defaults',
      description: '',
      roles: [
        { roleId: 'role-werewolf', count: 2 },
        { roleId: 'role-villager', count: 2 },
        { roleId: 'role-seer', count: 1 },
        { roleId: 'role-hunter', count: 1 },
      ],
      characters: Array.from({ length: 6 }, (_, index) => ({
        seat: index + 1,
        characterId: index < 2 ? copied.id : null,
      })),
      sheriff: false,
      victory: 'slaughter-all',
    })
    const profile = server.catalog.createProfile({
      name: 'Character test profile',
      toolId: 'tool-trae-cli',
      model: 'test-model',
      promptTimeoutMs: 5_000,
      connection: {},
    })
    const match = server.matches.createMatch({
      boardId: board.id,
      roleAssignment: 'random',
      seats: Array.from({ length: 6 }, (_, index) => ({
        seat: index + 1,
        name: index === 0 ? '柯南甲' : index === 1 ? '柯南乙' : `玩家${index + 1}`,
        profileId: profile.id,
      })),
    })
    const record = server.repository.getMatch(match.id)
    expect(record?.setup.seats[0]?.character).toMatchObject({
      id: copied.id,
      name: '侦探角色',
      revision: 2,
    })
    expect(record?.setup.seats[1]?.character?.id).toBe(copied.id)
    expect(record?.setup.seats[2]?.character).toBeNull()
    expect(match.seats[0]?.character).toMatchObject({ id: copied.id, name: '侦探角色' })

    const overridden = server.matches.createMatch({
      boardId: board.id,
      roleAssignment: 'random',
      seats: Array.from({ length: 6 }, (_, index) => ({
        seat: index + 1,
        name: `覆盖玩家${index + 1}`,
        profileId: profile.id,
        ...(index === 0 ? { characterId: null } : index === 2 ? { characterId: copied.id } : {}),
      })),
    })
    const overriddenRecord = server.repository.getMatch(overridden.id)
    expect(overriddenRecord?.setup.seats[0]?.character).toBeNull()
    expect(overriddenRecord?.setup.seats[1]?.character?.id).toBe(copied.id)
    expect(overriddenRecord?.setup.seats[2]?.character?.id).toBe(copied.id)

    server.characters.update(copied.id, { ...updateInput, name: '后续修改' })
    expect(server.repository.getMatch(match.id)?.setup.seats[0]?.character?.name).toBe('侦探角色')
    expect(() => server.characters.delete(copied.id)).toThrow(/used by board/)
    expect(() =>
      server.matches.createMatch({
        boardId: board.id,
        roleAssignment: 'random',
        seats: Array.from({ length: 6 }, (_, index) => ({
          seat: index + 1,
          name: index < 2 ? '重复昵称' : `唯一昵称${index}`,
          profileId: profile.id,
        })),
      }),
    ).toThrow(/names must be unique/)
  })
})

async function createServer(): Promise<AgentWolfServer> {
  const root = await mkdtemp(resolve(tmpdir(), 'agentwolf-character-catalog-'))
  roots.push(root)
  const server = await buildServer({
    config: {
      host: '127.0.0.1',
      port: 4310,
      dataDirectory: root,
      databasePath: resolve(root, 'agentwolf.sqlite'),
      publicBaseUrl: 'http://127.0.0.1:4310',
      projectRoot: process.cwd(),
      webDistPath: resolve(root, 'missing'),
      developerMode: false,
    },
  })
  servers.push(server)
  return server
}

const validWebpDataUrl =
  'data:image/webp;base64,UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEAAUAmJaQAA3AA/v3AgAA='
