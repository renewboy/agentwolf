import { type ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Outlet, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const runtime = vi.hoisted(() => ({ developerMode: true }))
vi.mock('../src/hooks/useRuntimeConfig.js', () => ({
  RuntimeConfigProvider: ({ children }: { children: ReactNode }) => children,
  useRuntimeConfig: () => runtime,
}))
vi.mock('../src/components/AppShell.js', () => ({
  AppShell: () => (
    <div data-testid="shell">
      <Outlet />
    </div>
  ),
}))
vi.mock('../src/components/AsyncState.js', () => ({ LoadingState: () => <div>route loading</div> }))
vi.mock('../src/pages/LobbyPage.js', () => ({ LobbyPage: () => <div>lobby page</div> }))
vi.mock('../src/pages/AgentsPage.js', () => ({ AgentsPage: () => <div>agents page</div> }))
vi.mock('../src/pages/BoardsPage.js', () => ({ BoardsPage: () => <div>boards page</div> }))
vi.mock('../src/pages/CollectionPage.js', () => ({
  CollectionPage: () => <div>collection page</div>,
}))
vi.mock('../src/pages/SettingsPage.js', () => ({ SettingsPage: () => <div>settings page</div> }))
vi.mock('../src/pages/NewMatchPage.js', () => ({ NewMatchPage: () => <div>new match page</div> }))
vi.mock('../src/pages/DeveloperPage.js', () => ({ DeveloperPage: () => <div>developer page</div> }))
vi.mock('../src/pages/MatchPage.js', () => ({ MatchPage: () => <div>match page</div> }))

import { App } from '../src/App.js'

function Location() {
  return <output data-testid="location">{useLocation().pathname}</output>
}

function renderApp(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
      <Location />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  runtime.developerMode = true
  document.title = ''
})

describe('App routing', () => {
  it.each([
    ['/', 'lobby page'],
    ['/agents', 'agents page'],
    ['/boards', 'boards page'],
    ['/collection/characters', 'collection page'],
    ['/settings', 'settings page'],
    ['/matches/new', 'new match page'],
    ['/matches/match-test-abcdef/trajectory', 'developer page'],
  ])('renders %s', (path, content) => {
    renderApp(path)
    expect(screen.getByText(content)).toBeVisible()
    expect(screen.getByTestId('shell')).toBeVisible()
    expect(document.title).toBe('月影议会')
  })

  it('redirects collection, unknown, and disabled developer routes', async () => {
    const collection = renderApp('/collection')
    expect(await screen.findByText('collection page')).toBeVisible()
    expect(screen.getByTestId('location')).toHaveTextContent('/collection/characters')
    collection.unmount()

    const unknown = renderApp('/unknown')
    expect(await screen.findByText('lobby page')).toBeVisible()
    expect(screen.getByTestId('location')).toHaveTextContent('/')
    unknown.unmount()

    runtime.developerMode = false
    renderApp('/matches/match-test-abcdef/trajectory')
    expect(await screen.findByText('lobby page')).toBeVisible()
    expect(screen.getByTestId('location')).toHaveTextContent('/')
  })

  it('loads the Match route outside the application shell', async () => {
    renderApp('/matches/match-test-abcdef')
    expect(await screen.findByText('match page')).toBeVisible()
    expect(screen.queryByTestId('shell')).not.toBeInTheDocument()
  })
})
