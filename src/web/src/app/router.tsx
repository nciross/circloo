import { createBrowserRouter } from 'react-router'
import { Root, AuthBare, AuthOnly, ProfileOptional, PublicLanding } from './layouts'

const page = (load: () => Promise<{ default: React.ComponentType }>) => async () => ({ Component: (await load()).default })

export const router = createBrowserRouter([
  {
    Component: Root,
    children: [
      { path: '/', Component: PublicLanding },
      { path: '/signin', lazy: page(() => import('../features/auth/SignIn')) },
      { path: '/join/:code', lazy: page(() => import('../features/circles/JoinCircle')) },
      {
        lazy: page(() => import('../features/circles/GuestShell')),
        children: [{ path: '/c/:id', lazy: page(() => import('../features/circles/CircleRoom')) }],
      },
      {
        // The audience screen for a projector: the animator's own window, full screen, no app chrome (spec 006 US3 #7).
        Component: AuthBare,
        children: [{ path: '/app/circles/:id/audience', lazy: page(() => import('../features/circles/present/AudienceScreen')) }],
      },
      {
        Component: ProfileOptional,
        children: [{ path: '/app/welcome', lazy: page(() => import('../features/profile/Welcome')) }],
      },
      {
        Component: AuthOnly,
        children: [
          { path: '/app', lazy: page(() => import('../features/home/Home')) },
          { path: '/app/settings', lazy: page(() => import('../features/home/Settings')) },
          { path: '/app/icebreakers', lazy: page(() => import('../features/icebreakers/Icebreakers')) },
          { path: '/app/circles/new', lazy: page(() => import('../features/circles/CreateCircle')) },
          { path: '/app/circles/:id', lazy: page(() => import('../features/circles/CircleRoom')) },
          { path: '/app/integrations', lazy: page(() => import('../features/integrations/Integrations')) },
          { path: '/app/presentations', lazy: page(() => import('../features/presentations/Library')) },
          { path: '/app/presentations/:id', lazy: page(() => import('../features/presentations/Editor')) },
        ],
      },
      { path: '*', lazy: page(() => import('../features/NotFound')) },
    ],
  },
])
