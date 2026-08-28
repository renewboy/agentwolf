import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getCopy } from '@agentwolf/assets'
import type { CharacterCard } from '@agentwolf/contracts'

const apiMocks = vi.hoisted(() => ({
  listCharacters: vi.fn(),
  createCharacter: vi.fn(),
  updateCharacter: vi.fn(),
  copyCharacter: vi.fn(),
  deleteCharacter: vi.fn(),
  uploadCharacterPortrait: vi.fn(),
}))
const portraitMocks = vi.hoisted(() => ({ normalize: vi.fn() }))

vi.mock('../src/api.js', () => ({ api: apiMocks }))
vi.mock('../src/character-portraits.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/character-portraits.js')>()),
  normalizeCharacterPortrait: portraitMocks.normalize,
}))

import { CollectionPage } from '../src/pages/CollectionPage.js'

function character(
  id: string,
  name: string,
  editable: boolean,
  overrides: Partial<CharacterCard> = {},
): CharacterCard {
  return {
    id,
    revision: 1,
    source: editable ? 'custom' : 'built-in',
    editable,
    name,
    universe: '测试宇宙',
    summary: '角色摘要',
    personality: ['冷静', '敏锐'],
    socialStyle: '直接',
    reasoningPresentation: '简洁',
    speechStyle: '自然',
    boundaries: ['遵守规则'],
    portraitAssetId: `portrait-${id.replace('character-', '')}`,
    createdAt: '2026-08-28T00:00:00.000Z',
    updatedAt: '2026-08-28T00:00:00.000Z',
    ...overrides,
  } as CharacterCard
}

const builtIn = character('character-built-in', '内置角色', false)
const editable = character('character-editable', '自建角色', true)

beforeEach(() => {
  for (const mock of Object.values(apiMocks)) mock.mockReset()
  portraitMocks.normalize.mockReset()
  apiMocks.listCharacters.mockResolvedValue([builtIn, editable])
  apiMocks.createCharacter.mockResolvedValue(editable)
  apiMocks.updateCharacter.mockResolvedValue(editable)
  apiMocks.copyCharacter.mockResolvedValue(editable)
  apiMocks.deleteCharacter.mockResolvedValue(undefined)
  apiMocks.uploadCharacterPortrait.mockResolvedValue({ id: 'portrait-uploaded' })
  portraitMocks.normalize.mockResolvedValue('data:image/webp;base64,QQ==')
})

describe('CollectionPage', () => {
  it('handles Error/string load failures and retry', async () => {
    apiMocks.listCharacters
      .mockRejectedValueOnce(new Error('load failed'))
      .mockRejectedValueOnce('string load failed')
      .mockResolvedValueOnce([builtIn])
    render(<CollectionPage />)
    expect(await screen.findByText('load failed')).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: getCopy('common.retry') }))
    expect(await screen.findByText('string load failed')).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: getCopy('common.retry') }))
    expect(await screen.findByText(builtIn.name)).toBeVisible()
  })

  it('selects, copies, and reports copy failures for read-only Characters', async () => {
    apiMocks.copyCharacter
      .mockRejectedValueOnce(new Error('copy failed'))
      .mockRejectedValueOnce('copy string failed')
      .mockResolvedValueOnce(editable)
    render(<CollectionPage />)
    expect(await screen.findByText(getCopy('characterLibrary.readOnly'))).toBeVisible()
    const copy = screen.getByRole('button', { name: getCopy('characterLibrary.copy') })
    await userEvent.click(copy)
    expect(await screen.findByText('copy failed')).toBeVisible()
    await userEvent.click(copy)
    expect(await screen.findByText('copy string failed')).toBeVisible()
    await userEvent.click(copy)
    expect(await screen.findByText(getCopy('characterLibrary.copied'))).toBeVisible()

    await userEvent.click(screen.getByRole('button', { name: /自建角色/u }))
    expect(screen.queryByText(getCopy('characterLibrary.readOnly'))).not.toBeInTheDocument()
  })

  it('creates a Character only after portrait upload and normalizes multiline fields', async () => {
    render(<CollectionPage />)
    await screen.findByText(builtIn.name)
    await userEvent.click(screen.getByRole('button', { name: getCopy('characterLibrary.create') }))
    await userEvent.click(screen.getByRole('button', { name: getCopy('characterLibrary.save') }))
    expect(await screen.findByText(getCopy('characterLibrary.portraitRequired'))).toBeVisible()

    const upload = document.querySelector<HTMLInputElement>('.aw-character-upload input')!
    fireEvent.change(upload, { target: { files: [] } })
    const file = new File(['image'], 'portrait.png', { type: 'image/png' })
    fireEvent.change(upload, { target: { files: [file] } })
    await waitFor(() => expect(apiMocks.uploadCharacterPortrait).toHaveBeenCalled())
    expect(document.querySelector('.aw-character-editor__portrait img')).toHaveAttribute(
      'src',
      '/api/character-assets/portrait-uploaded',
    )

    const controls = screen.getAllByRole('textbox')
    const values = [
      '新角色',
      '新宇宙',
      '新摘要',
      ' 冷静 \n\n 勇敢 ',
      '社交风格',
      '推理展示',
      '说话风格',
      ' 禁止越界 \n ',
    ]
    for (const [index, value] of values.entries()) {
      fireEvent.change(controls[index]!, { target: { value } })
    }
    await userEvent.click(screen.getByRole('button', { name: getCopy('characterLibrary.save') }))
    expect(apiMocks.createCharacter).toHaveBeenCalledWith(
      expect.objectContaining({
        name: '新角色',
        personality: ['冷静', '勇敢'],
        boundaries: ['禁止越界'],
        portraitAssetId: 'portrait-uploaded',
      }),
    )
    expect(await screen.findByText(getCopy('characterLibrary.saved'))).toBeVisible()
  })

  it('reports upload and save failures from Error and non-Error causes', async () => {
    portraitMocks.normalize
      .mockRejectedValueOnce(new Error('normalize failed'))
      .mockRejectedValueOnce('normalize string failed')
    apiMocks.updateCharacter
      .mockRejectedValueOnce(new Error('save failed'))
      .mockRejectedValueOnce('save string failed')
    render(<CollectionPage />)
    await screen.findByText(builtIn.name)
    await userEvent.click(screen.getByRole('button', { name: /自建角色/u }))
    const upload = document.querySelector<HTMLInputElement>('.aw-character-upload input')!
    fireEvent.change(upload, {
      target: { files: [new File(['x'], 'portrait.png', { type: 'image/png' })] },
    })
    expect(await screen.findByText('normalize failed')).toBeVisible()
    fireEvent.change(upload, {
      target: { files: [new File(['x'], 'portrait.png', { type: 'image/png' })] },
    })
    expect(await screen.findByText('normalize string failed')).toBeVisible()

    const save = screen.getByRole('button', { name: getCopy('characterLibrary.save') })
    await userEvent.click(save)
    expect(await screen.findByText('save failed')).toBeVisible()
    await userEvent.click(save)
    expect(await screen.findByText('save string failed')).toBeVisible()
  })

  it('updates, cancels deletion, deletes, and reports delete failures', async () => {
    apiMocks.deleteCharacter
      .mockRejectedValueOnce(new Error('delete failed'))
      .mockRejectedValueOnce('delete string failed')
      .mockResolvedValueOnce(undefined)
    apiMocks.listCharacters.mockResolvedValueOnce([builtIn, editable]).mockResolvedValue([builtIn])
    render(<CollectionPage />)
    await screen.findByText(builtIn.name)
    await userEvent.click(screen.getByRole('button', { name: /自建角色/u }))
    fireEvent.change(screen.getAllByRole('textbox')[0]!, { target: { value: '更新名称' } })
    await userEvent.click(screen.getByRole('button', { name: getCopy('characterLibrary.save') }))
    expect(apiMocks.updateCharacter).toHaveBeenCalled()

    const deleteButton = screen.getByRole('button', { name: getCopy('characterLibrary.delete') })
    await userEvent.click(deleteButton)
    await userEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: '取消' }),
    )
    await userEvent.click(deleteButton)
    await userEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: getCopy('characterLibrary.delete'),
      }),
    )
    expect(await screen.findByText('delete failed')).toBeVisible()
    await userEvent.click(deleteButton)
    await userEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: getCopy('characterLibrary.delete'),
      }),
    )
    expect(await screen.findByText('delete string failed')).toBeVisible()
    await userEvent.click(deleteButton)
    await userEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: getCopy('characterLibrary.delete'),
      }),
    )
    await waitFor(() =>
      expect(screen.getByText(getCopy('characterLibrary.readOnly'))).toBeVisible(),
    )
  })
})
