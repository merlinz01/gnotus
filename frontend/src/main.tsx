import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { BrowserRouter as Router } from 'react-router-dom'
import useConfig from './stores/config.ts'

const configJSON = localStorage.getItem('app_config')
if (configJSON) {
  try {
    const config = JSON.parse(configJSON)
    useConfig.getState().setConfig(config)
  } catch (error) {
    console.error('Failed to parse config from localStorage:', error)
    localStorage.removeItem('app_config')
  }
}

createRoot(document.body).render(
  <StrictMode>
    <Router>
      <App />
    </Router>
  </StrictMode>
)
