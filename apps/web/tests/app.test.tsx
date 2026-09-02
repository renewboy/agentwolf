import { useEffect, type ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Link, MemoryRouter, Outlet, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const runtime = vi.hoisted(() => ({ developerMode: true }))
const sessionLifecycle = vi.hoisted(() => ({ mounts: 0, unmounts: 0 }))
vi.mock('../src/hooks/useRuntimeConfig.js', () => ({
  RuntimeConfigProvider: ({ children }: { children: ReactNode }) => children,
  useRuntimeConfig: () => runtime,
}))
vi.mock('../src/hooks/useMatchSession.js', () => ({
  MatchSessionProvider: ({ children }: { children: ReactNode }) => {
    useEffect(() => {
      sessionLifecycle.mounts += 1
      return () => {
        sessionLifecycle.unmounts += 1
      }
    }, [])
    return children
  },
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
vi.mock('../src/pages/DeveloperPage.js', () => ({
  DeveloperPage: () => (
    <div>
      developer page <Link to="..">back to match</Link>
    </div>
  ),
}))
vi.mock('../src/pages/MatchPage.js', () => ({
  MatchPage: () => (
    <div>
      match page <Link to="trajectory">open trajectory</Link>
    </div>
  ),
}))

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
  sessionLifecycle.mounts = 0
  sessionLifecycle.unmounts = 0
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
  ])('renders %s', async (path, content) => {
    renderApp(path)
    expect(await screen.findByText(content)).toBeVisible()
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

  it('keeps one Match session mounted while switching to and from trajectory', async () => {
    const rendered = renderApp('/matches/match-test-abcdef')
    expect(await screen.findByText(/match page/)).toBeVisible()
    expect(sessionLifecycle).toEqual({ mounts: 1, unmounts: 0 })
    await userEvent.click(screen.getByRole('link', { name: 'open trajectory' }))
    expect(await screen.findByText(/developer page/)).toBeVisible()
    expect(sessionLifecycle).toEqual({ mounts: 1, unmounts: 0 })
    await userEvent.click(screen.getByRole('link', { name: 'back to match' }))
    expect(await screen.findByText(/match page/)).toBeVisible()
    expect(sessionLifecycle).toEqual({ mounts: 1, unmounts: 0 })
    rendered.unmount()
    expect(sessionLifecycle).toEqual({ mounts: 1, unmounts: 1 })
  })
})
