import { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import Header from './components/Header'
import useConfig from './stores/config'
import { LoaderPinwheelIcon } from 'lucide-react'
import axios, { getErrorMessage } from './axios'
import useUser from './stores/user'

function App() {
  const loaded = useConfig((state) => state.loaded)
  const config = useConfig((state) => state.config)
  const setConfig = useConfig((state) => state.setConfig)
  const userLoaded = useUser((state) => state.loaded)
  const setUser = useUser((state) => state.setUser)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    setError(null)
    if (!loaded) {
      const fetchConfig = async () => {
        try {
          const response = await axios.get('/api/config.json')
          setConfig(response.data)
          localStorage.setItem('app_config', JSON.stringify(response.data))
        } catch (error) {
          console.error('Failed to fetch config:', error)
          setError('Failed to load site configuration: ' + getErrorMessage(error))
        }
      }
      fetchConfig()
    }
  }, [loaded, setConfig])
  useEffect(() => {
    if (userLoaded) return
    const fetchUser = async () => {
      try {
        const response = await axios.get('/api/auth/user', {
          validateStatus(status) {
            return status === 200 || status === 401
          },
        })
        if (response.status === 200) {
          setUser(response.data)
        } else {
          setUser(null)
        }
      } catch (error) {
        console.error('Error fetching user data:', error)
        setUser(null)
      }
    }
    fetchUser()
  })
  useEffect(() => {
    if (config.primary_color)
      document.documentElement.style.setProperty('--gnotus-primary', config.primary_color)
    if (config.secondary_color)
      document.documentElement.style.setProperty('--gnotus-secondary', config.secondary_color)
    if (config.primary_color_dark)
      document.documentElement.style.setProperty('--gnotus-primary-dark', config.primary_color_dark)
    if (config.secondary_color_dark)
      document.documentElement.style.setProperty(
        '--gnotus-secondary-dark',
        config.secondary_color_dark
      )
  }, [config])

  if (error) {
    return (
      <div className="bg-base-100 flex h-screen items-center justify-center">
        <div className="bg-base-200 border-base-300 rounded-lg border p-4 text-sm text-red-500">
          {error}
        </div>
      </div>
    )
  } else if (!loaded) {
    return (
      <div className="bg-base-100 flex h-screen items-center justify-center">
        <LoaderPinwheelIcon className="text-primary animate-spin" role="status" />
      </div>
    )
  } else {
    return (
      <div className="bg-base-100 flex h-screen w-screen flex-col print:h-auto">
        <Header />
        <SidebarHolder>
          <Outlet />
        </SidebarHolder>
      </div>
    )
  }
}
export default App

function SidebarHolder({ children }: { children: React.ReactNode }) {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 750)
  const [showDrawer, setShowDrawer] = useState(localStorage.getItem('sidebar_open') === 'true')
  useEffect(() => {
    const handleBeforeUnload = () => {
      localStorage.setItem('sidebar_open', showDrawer.toString())
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [showDrawer])
  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 750px)')
    const handleMediaQueryChange = (event: MediaQueryListEvent) => {
      setIsMobile(event.matches)
    }
    mediaQuery.addEventListener('change', handleMediaQueryChange)
    return () => {
      mediaQuery.removeEventListener('change', handleMediaQueryChange)
    }
  }, [])
  useEffect(() => {
    if (isMobile) {
      setShowDrawer(false)
    }
  }, [isMobile])

  return (
    <div className="drawer flex grow flex-row overflow-y-hidden">
      <input
        id="drawer-toggle"
        type="checkbox"
        className="drawer-toggle"
        alt="Toggle drawer"
        checked={showDrawer}
        onChange={(e) => setShowDrawer(e.target.checked)}
      />
      <div
        className={
          'print:hidden ' +
          (isMobile
            ? `drawer-side z-30 ${showDrawer ? 'drawer-open' : ''}`
            : 'border-base-300 transition-width flex w-64 shrink-0 flex-col overflow-hidden border-r duration-300 ease-out')
        }
        style={{ width: showDrawer ? undefined : 0 }}
      >
        <label htmlFor="drawer-toggle" className="drawer-overlay"></label>
        <div className="bg-base-200 h-full">
          <Sidebar />
        </div>
      </div>
      <div className="drawer-content flex grow flex-col">{children}</div>
    </div>
  )
}
