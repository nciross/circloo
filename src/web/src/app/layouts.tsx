import { Outlet, useNavigation } from 'react-router'
import { RequireAuth, PublicOnly } from './guards'
import { useLocaleSync, useThemeSync } from './locale'
import { Landing } from '../features/landing/Landing'
import { Loading } from '../components/Loading'
import { AppShell } from '../features/shell/AppShell'

export function Root() {
  useLocaleSync()
  useThemeSync()
  const navigation = useNavigation()
  return navigation.state === 'loading' && !navigation.location?.pathname.startsWith('/app') ? <Loading /> : <Outlet />
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
      <AppShell />
    </RequireAuth>
  )
}

/** Signed in, without the app shell: full-screen pages such as the audience screen. */
export function AuthBare() {
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
