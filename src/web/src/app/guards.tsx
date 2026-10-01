import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { useMe } from '../api/hooks'
import { DoorLoading } from '../components/DoorLoading'

export function RequireAuth({ children, allowIncompleteProfile = false }: { children: ReactNode; allowIncompleteProfile?: boolean }) {
  const { data: me, isPending } = useMe()
  const location = useLocation()
  if (isPending) return <DoorLoading />
  if (!me) {
    const returnTo = `${location.pathname}${location.search}`
    return <Navigate to={`/signin?returnTo=${encodeURIComponent(returnTo)}`} replace />
  }
  if (!me.profileCompleted && !allowIncompleteProfile) {
    return <Navigate to={`/app/welcome?returnTo=${encodeURIComponent(location.pathname)}`} replace />
  }
  return <>{children}</>
}

export function PublicOnly({ children, to = '/app' }: { children: ReactNode; to?: string }) {
  const { data: me, isPending } = useMe()
  if (isPending) return <>{children}</>
  if (me) return <Navigate to={to} replace />
  return <>{children}</>
}
