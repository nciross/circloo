import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

export type SignInStep = 'email' | 'code'

interface SignInState {
  step: SignInStep
  email: string
  /** Epoch ms after which "send a new code" is allowed. */
  resendAvailableAt: number
  codeSent: (email: string, resendAfterSeconds: number) => void
  editEmail: () => void
  reset: () => void
}

const initial = { step: 'email' as SignInStep, email: '', resendAvailableAt: 0 }

/** Flow state survives a reload (the visitor switches to their mail app and back). Session only. */
export const useSignInStore = create<SignInState>()(
  persist(
    (set) => ({
      ...initial,
      codeSent: (email, resendAfterSeconds) =>
        set({ step: 'code', email, resendAvailableAt: Date.now() + resendAfterSeconds * 1000 }),
      editEmail: () => set({ step: 'email' }),
      reset: () => set(initial),
    }),
    { name: 'circloo-signin', storage: createJSONStorage(() => sessionStorage) },
  ),
)
