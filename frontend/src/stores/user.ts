import { create } from 'zustand'
import type User from '../types/user'

interface UserState {
  user: User | null
  loaded: boolean
  storagePrefix: string
  setUser: (user: User | null) => void
  clearUser: () => void
}

const useUser = create<UserState>()((set) => ({
  user: null as User | null,
  loaded: false,
  storagePrefix: '',
  setUser: (user: User | null) => {
    set({ user, loaded: true, storagePrefix: user ? `user:${user.id}:` : '' })
    if (!user) {
      for (const key in localStorage) {
        if (key.startsWith('user:')) {
          localStorage.removeItem(key)
        }
      }
    }
  },
  clearUser: () => set({ user: null }),
}))

export default useUser
