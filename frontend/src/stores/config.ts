import { create } from 'zustand'

interface Config {
  site_name: string
  primary_color?: string
  secondary_color?: string
  primary_color_dark?: string
  secondary_color_dark?: string
  site_icon_upload_id?: number | null
  loaded_at?: number
}

interface ConfigState {
  config: Config
  loaded: boolean
  setConfig: (config: Config) => void
}
export const DEFAULT_CONFIG: Config = {
  site_name: 'Gnotus',
  primary_color: '#4A90E2',
  secondary_color: '#50E3C2',
  primary_color_dark: '#4A90E2',
  secondary_color_dark: '#50E3C2',
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
