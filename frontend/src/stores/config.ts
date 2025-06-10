import { create } from 'zustand'

interface Config {
  site_name: string
  site_description: string
  primary_color?: string
  secondary_color?: string
}

interface ConfigState {
  config: Config
  loaded: boolean
  setConfig: (config: Config) => void
}
export const DEFAULT_CONFIG: Config = {
  site_name: 'Gnotus',
  site_description: '',
  primary_color: '#4A90E2',
  secondary_color: '#50E3C2',
}

const useConfig = create<ConfigState>()((set) => ({
  config: DEFAULT_CONFIG,
  loaded: false,
  setConfig: (config: Config) => {
    set({
      config: {
        ...DEFAULT_CONFIG,
        ...config,
      },
      loaded: true,
    })
  },
}))

export default useConfig
