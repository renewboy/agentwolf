import { lazy, Suspense, useEffect } from 'react'
import { Navigate, Outlet, Route, Routes, useParams } from 'react-router-dom'
import { getCopy } from '@agentwolf/assets'
import { AppShell } from './components/AppShell.js'
import { AgentsPage } from './pages/AgentsPage.js'
import { BoardsPage } from './pages/BoardsPage.js'
import { CollectionPage } from './pages/CollectionPage.js'
import { LobbyPage } from './pages/LobbyPage.js'
import { NewMatchPage } from './pages/NewMatchPage.js'
import { SettingsPage } from './pages/SettingsPage.js'
import { LoadingState } from './components/AsyncState.js'
import { RuntimeConfigProvider, useRuntimeConfig } from './hooks/useRuntimeConfig.js'
import { MatchSessionProvider } from './hooks/useMatchSession.js'

const MatchPage = lazy(async () => {
  const module = await import('./pages/MatchPage.js')
  return { default: module.MatchPage }
})

const DeveloperPage = lazy(async () => {
  const module = await import('./pages/DeveloperPage.js')
  return { default: module.DeveloperPage }
})

export function App() {
  useEffect(() => {
    document.title = getCopy('brand')
  }, [])
  return (
    <RuntimeConfigProvider>
      <AppRoutes />
    </RuntimeConfigProvider>
  )
}

function AppRoutes() {
  const { developerMode } = useRuntimeConfig()
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<LobbyPage />} />
        <Route path="agents" element={<AgentsPage />} />
        <Route path="boards" element={<BoardsPage />} />
        <Route path="collection" element={<Navigate to="/collection/characters" replace />} />
        <Route path="collection/characters" element={<CollectionPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="matches/new" element={<NewMatchPage />} />
      </Route>
      <Route path="matches/:matchId" element={<MatchSessionRoute />}>
        <Route
          index
          element={
            <Suspense fallback={<LoadingState />}>
              <MatchPage />
            </Suspense>
          }
        />
        <Route element={<AppShell />}>
          <Route
            path="trajectory"
            element={
              developerMode ? (
                <Suspense fallback={<LoadingState />}>
                  <DeveloperPage />
                </Suspense>
              ) : (
                <Navigate to="/" replace />
              )
            }
          />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

function MatchSessionRoute() {
  const { matchId } = useParams<{ matchId: string }>()
  return (
    <MatchSessionProvider matchId={matchId}>
      <Outlet />
    </MatchSessionProvider>
  )
}
