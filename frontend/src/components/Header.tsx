import { SunMoonIcon, MenuIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import useConfig from '../stores/config'
import { Link } from 'react-router-dom'
import SearchBox from './SearchBox'
import './Header.css'

export default function Header() {
  const [colorMode, setColorMode] = useState(localStorage.getItem('color-mode') || 'light')
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', colorMode)
    localStorage.setItem('color-mode', colorMode)
  }, [colorMode])
  const config = useConfig((state) => state.config)

  return (
    <header className="navbar app-header">
      <button
        className="btn btn-ghost btn-square app-header-menu"
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
      <div className="app-header-bar">
        <Link to="/">
          <img src="/api/icon" alt="Icon" className="app-header-logo" />
        </Link>
        <h1 className="app-header-title">{config.site_name}</h1>
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
