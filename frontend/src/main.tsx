import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import useConfig from './stores/config.ts'
import routes from './Routes.tsx'
import ErrorBoundary from './components/ErrorBoundary.tsx'

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

const router = createBrowserRouter(routes)

createRoot(document.body).render(
  <StrictMode>
    <ErrorBoundary>
      <RouterProvider router={router} />
    </ErrorBoundary>
  </StrictMode>
)
