import { useState, useEffect, useRef } from 'react'

interface CountdownResult {
  hours: number
  minutes: number
  seconds: number
  isExpired: boolean
  label: string
  /** 0-1 progress (1 = just started, 0 = expired) */
  progress: number
}

/**
 * Live countdown hook. Updates every 30 seconds.
 * Returns hours/minutes/label and progress ratio.
 */
export function useCountdown(expiresAt: string | null | undefined, totalHours?: number): CountdownResult {
  const [now, setNow] = useState(Date.now())
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    intervalRef.current = setInterval(() => setNow(Date.now()), 30000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [])

  if (!expiresAt) {
    return { hours: 0, minutes: 0, seconds: 0, isExpired: true, label: '', progress: 0 }
  }

  const expiresMs = new Date(expiresAt).getTime()
  const diff = expiresMs - now
  const isExpired = diff <= 0

  if (isExpired) {
    return { hours: 0, minutes: 0, seconds: 0, isExpired: true, label: '', progress: 0 }
  }

  const hours = Math.floor(diff / 3600000)
  const minutes = Math.floor((diff % 3600000) / 60000)
  const seconds = Math.floor((diff % 60000) / 1000)

  let label: string
  if (hours > 0) {
    label = `${hours}h ${minutes}min`
  } else if (minutes > 0) {
    label = `${minutes}min`
  } else {
    label = `${seconds}s`
  }

  const totalMs = (totalHours ?? hours + 1) * 3600000
  const progress = Math.min(1, Math.max(0, diff / totalMs))

  return { hours, minutes, seconds, isExpired, label, progress }
}
