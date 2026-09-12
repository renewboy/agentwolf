import { useEffect, useState } from 'react'
import type { SpeechAudioStatus } from '@agentwolf/contracts'
import { api } from '../api.js'

export function useSpeechAudioStatus() {
  const [status, setStatus] = useState<SpeechAudioStatus | null>(null)
  const [disconnected, setDisconnected] = useState(false)
  useEffect(() => {
    let closed = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const lifetime = new AbortController()
    const poll = async () => {
      let delay = 1_000
      try {
        const next = await api.speechAudioStatus(
          AbortSignal.any([lifetime.signal, AbortSignal.timeout(5_000)]),
        )
        if (closed) return
        setStatus(next)
        setDisconnected(false)
        if (next.state === 'ready' || next.state === 'disabled') delay = 10_000
      } catch {
        if (!closed) setDisconnected(true)
      }
      if (!closed) timer = setTimeout(() => void poll(), delay)
    }
    void poll()
    return () => {
      closed = true
      lifetime.abort()
      clearTimeout(timer)
    }
  }, [])
  return { status, disconnected }
}
