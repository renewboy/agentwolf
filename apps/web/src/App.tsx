import { lazy, Suspense, useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { getCopy } from '@agentwolf/assets'
import { AppShell } from './components/AppShell.js'
import { AgentsPage } from './pages/AgentsPage.js'
import { BoardsPage } from './pages/BoardsPage.js'
import { LobbyPage } from './pages/LobbyPage.js'
import { NewMatchPage } from './pages/NewMatchPage.js'
import { SettingsPage } from './pages/SettingsPage.js'
import { LoadingState } from './components/AsyncState.js'
import { RuntimeConfigProvider, useRuntimeConfig } from './hooks/useRuntimeConfig.js'
import { DeveloperPage } from './pages/DeveloperPage.js'

const MatchPage = lazy(async () => {
  const module = await import('./pages/MatchPage.js')
  return { default: module.MatchPage }
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
        <Route path="settings" element={<SettingsPage />} />
        <Route
          path="matches/:matchId/trajectory"
          element={developerMode ? <DeveloperPage /> : <Navigate to="/" replace />}
        />
        <Route path="matches/new" element={<NewMatchPage />} />
      </Route>
      <Route
        path="matches/:matchId"
        element={
          <Suspense fallback={<LoadingState />}>
            <MatchPage />
          </Suspense>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
