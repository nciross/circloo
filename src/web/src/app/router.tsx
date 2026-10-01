import { createBrowserRouter } from 'react-router'
import { Root, AuthOnly, ProfileOptional, PublicLanding } from './layouts'

const page = (load: () => Promise<{ default: React.ComponentType }>) => async () => ({ Component: (await load()).default })

export const router = createBrowserRouter([
  {
    Component: Root,
    children: [
      { path: '/', Component: PublicLanding },
      { path: '/signin', lazy: page(() => import('../features/auth/SignIn')) },
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
        ],
      },
      { path: '*', lazy: page(() => import('../features/NotFound')) },
    ],
  },
])
