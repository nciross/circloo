import { createBrowserRouter } from 'react-router'
import { Root, AuthOnly, ProfileOptional, PublicLanding } from './layouts'

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
        ],
      },
      { path: '*', lazy: page(() => import('../features/NotFound')) },
    ],
  },
])
