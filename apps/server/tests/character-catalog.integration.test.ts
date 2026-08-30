import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  CharacterIdSchema,
  CharacterPortraitAssetIdSchema,
  RoleIdSchema,
  type CharacterCardInput,
} from '@agentwolf/contracts'
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
        { roleId: RoleIdSchema.parse('role-werewolf'), count: 2 },
        { roleId: RoleIdSchema.parse('role-villager'), count: 2 },
        { roleId: RoleIdSchema.parse('role-seer'), count: 1 },
        { roleId: RoleIdSchema.parse('role-hunter'), count: 1 },
      ],
      characters: Array.from({ length: 6 }, (_, index) => ({
        seat: index + 1,
        characterId: index < 2 ? copied.id : null,
      })),
      agentProfiles: [],
      sheriff: false,
      victory: 'slaughter-all',
    })
    const profile = server.catalog.createProfile({
      name: 'Character test profile',
      toolId: server.catalog.listTools()[0]!.id,
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

  it('enforces catalog ownership, portrait validation, and idempotent asset writes', async () => {
    const server = await createServer()
    const builtIn = server.characters.list()[0]!
    expect(server.characters.summaries()).toHaveLength(12)
    expect(server.characters.get(builtIn.id)).toEqual(builtIn)
    expect(server.characters.require(builtIn.id)).toEqual(builtIn)
    expect(server.characters.snapshot(builtIn.id)).toMatchObject({ id: builtIn.id })
    expect(server.characters.portrait(builtIn.portraitAssetId)).toMatchObject({
      mediaType: 'image/png',
    })
    const unknownId = CharacterIdSchema.parse('character-unknown-test')
    expect(server.characters.get(unknownId)).toBeNull()
    expect(() => server.characters.require(unknownId)).toThrow(/Unknown Character/)
    expect(() => server.characters.update(builtIn.id, characterInput(builtIn))).toThrow(/read-only/)
    expect(() => server.characters.update(unknownId, characterInput(builtIn))).toThrow(
      /Unknown Character/,
    )
    expect(() => server.characters.delete(builtIn.id)).toThrow(/read-only/)
    expect(() => server.characters.delete(unknownId)).toThrow(/Unknown Character/)
    expect(() =>
      server.characters.create({
        ...characterInput(builtIn),
        portraitAssetId: CharacterPortraitAssetIdSchema.parse('portrait-unknown-test'),
      }),
    ).toThrow(/Unknown Character portrait/)

    await expect(
      server.characters.uploadPortrait({ dataUrl: 'data:image/webp;base64,A' }),
    ).rejects.toThrow(/between 1 byte and 5 MB/)
    await expect(
      server.characters.uploadPortrait({
        dataUrl: `data:image/webp;base64,${Buffer.alloc(5_000_001).toString('base64')}`,
      }),
    ).rejects.toThrow(/between 1 byte and 5 MB/)
    await expect(
      server.characters.uploadPortrait({
        dataUrl: `data:image/webp;base64,${Buffer.from('not-a-webp').toString('base64')}`,
      }),
    ).rejects.toThrow(/valid WebP/)

    const firstAsset = await server.characters.uploadPortrait({ dataUrl: validWebpDataUrl })
    const repeatedAsset = await server.characters.uploadPortrait({ dataUrl: validWebpDataUrl })
    expect(repeatedAsset.id).toBe(firstAsset.id)
    expect(server.characters.portrait(firstAsset.id)).toMatchObject({ mediaType: 'image/webp' })
    expect(
      server.characters.portrait(CharacterPortraitAssetIdSchema.parse('portrait-missing-test')),
    ).toBeNull()

    const created = server.characters.create({
      ...characterInput(builtIn),
      name: '临时角色',
      portraitAssetId: firstAsset.id,
    })
    const copied = server.characters.copy(created.id)
    expect(copied.name).toContain(created.name)
    server.characters.delete(created.id)
    server.characters.delete(copied.id)
    expect(server.characters.get(created.id)).toBeNull()
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
      publicSpeechInterruptMode: 'legacy',
    },
  })
  servers.push(server)
  return server
}

const validWebpDataUrl =
  'data:image/webp;base64,UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEAAUAmJaQAA3AA/v3AgAA='

function characterInput(
  character: ReturnType<AgentWolfServer['characters']['require']>,
): CharacterCardInput {
  return {
    name: character.name,
    universe: character.universe,
    summary: character.summary,
    personality: character.personality,
    socialStyle: character.socialStyle,
    reasoningPresentation: character.reasoningPresentation,
    speechStyle: character.speechStyle,
    boundaries: character.boundaries,
    portraitAssetId: character.portraitAssetId,
  }
}
