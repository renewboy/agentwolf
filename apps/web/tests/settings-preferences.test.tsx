import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

const apiMocks = vi.hoisted(() => ({
  globalSettings: vi.fn(async () => ({ speechCharacterLimit: 300 })),
  updateGlobalSettings: vi.fn(),
}))
vi.mock('../src/api.js', () => ({ api: apiMocks }))

import { SettingsPage } from '../src/pages/SettingsPage.js'

describe('观战偏好', () => {
  it('立即保存特效强度，并在重新进入时恢复浏览器偏好', async () => {
    const first = render(<SettingsPage />)
    const select = await screen.findByRole('combobox', { name: '技能特效' })
    expect(select).toHaveAttribute('data-value', 'full')
    await userEvent.click(select)
    await userEvent.click(screen.getByRole('option', { name: '精简' }))
    expect(window.localStorage.getItem('agentwolf.role-effect-mode')).toBe('reduced')
    await userEvent.click(select)
    await userEvent.click(screen.getByRole('option', { name: '关闭' }))
    expect(window.localStorage.getItem('agentwolf.role-effect-mode')).toBe('off')
    expect(apiMocks.updateGlobalSettings).not.toHaveBeenCalled()
    first.unmount()
    render(<SettingsPage />)
    expect(await screen.findByRole('combobox', { name: '技能特效' })).toHaveAttribute(
      'data-value',
      'off',
    )
  })
})
