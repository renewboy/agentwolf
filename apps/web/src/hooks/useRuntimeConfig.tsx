import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { RuntimeConfig } from '@agentwolf/contracts'
import { api } from '../api.js'
import { ErrorState, LoadingState } from '../components/AsyncState.js'

const RuntimeConfigContext = createContext<RuntimeConfig>({ developerMode: false })

export function RuntimeConfigProvider({ children }: { readonly children: ReactNode }) {
  const [config, setConfig] = useState<RuntimeConfig | null>(null)
  const [error, setError] = useState<string | null>(null)
  const load = (): void => {
    setError(null)
    void api
      .runtimeConfig()
      .then(setConfig)
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)))
  }
  useEffect(load, [])
  if (error) return <ErrorState message={error} retry={load} />
  if (!config) return <LoadingState />
  return <RuntimeConfigContext.Provider value={config}>{children}</RuntimeConfigContext.Provider>
}

export function useRuntimeConfig(): RuntimeConfig {
  return useContext(RuntimeConfigContext)
}
