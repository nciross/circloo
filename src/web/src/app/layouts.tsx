import { Outlet, useNavigation } from 'react-router'
import { RequireAuth, PublicOnly } from './guards'
import { useLocaleSync } from './locale'
import { Landing } from '../features/landing/Landing'
import { DoorLoading } from '../components/DoorLoading'

export function Root() {
  useLocaleSync()
  const navigation = useNavigation()
  return navigation.state === 'loading' && !navigation.location?.pathname.startsWith('/app') ? <DoorLoading /> : <Outlet />
}

export function PublicLanding() {
  return (
    <PublicOnly>
      <Landing />
    </PublicOnly>
  )
}

export function AuthOnly() {
  return (
    <RequireAuth>
      <Outlet />
    </RequireAuth>
  )
}

export function ProfileOptional() {
  return (
    <RequireAuth allowIncompleteProfile>
      <Outlet />
    </RequireAuth>
  )
}
