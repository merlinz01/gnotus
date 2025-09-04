import { SunMoonIcon, MenuIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import useConfig from '../stores/config'
import { Link } from 'react-router-dom'
import SearchBox from './SearchBox'

export default function Header() {
  const [colorMode, setColorMode] = useState(localStorage.getItem('color-mode') || 'light')
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', colorMode)
    localStorage.setItem('color-mode', colorMode)
  }, [colorMode])
  const config = useConfig((state) => state.config)

  return (
    <header className="navbar bg-base-300 z-20 flex min-h-12 w-screen max-w-screen items-center p-1 shadow-md print:hidden">
      <button
        className="btn btn-ghost btn-square me-2"
        title="Toggle drawer"
        onClick={() => {
          const drawerToggle = document.getElementById('drawer-toggle') as HTMLInputElement | null
          if (drawerToggle) {
            drawerToggle.click()
          }
        }}
      >
        <MenuIcon />
      </button>
      <div className="flex grow items-center gap-2">
        <Link to="/">
          <img src="/api/icon.svg" alt="Site logo" className="mr-2 h-6 sm:h-8" />
        </Link>
        <h1 className="me-auto overflow-hidden text-lg font-bold text-ellipsis whitespace-nowrap sm:text-xl">
          {config.site_name}
        </h1>
        <SearchBox />
        <button
          className="btn btn-ghost btn-square"
          title="Toggle light/dark mode"
          onClick={() => {
            const newColorMode = colorMode === 'light' ? 'dark' : 'light'
            setColorMode(newColorMode)
          }}
        >
          <SunMoonIcon />
        </button>
      </div>
    </header>
  )
}
