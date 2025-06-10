import { Route, Routes as ReactRoutes } from 'react-router-dom'
import { lazy } from 'react'
import DocPage from './pages/DocPage'

const HomePage = lazy(() => import('./pages/HomePage'))
const LoginPage = lazy(() => import('./pages/LoginPage'))
const LogoutPage = lazy(() => import('./pages/LogoutPage'))
const NewDocPage = lazy(() => import('./pages/NewDocPage'))
const DocEditorPage = lazy(() => import('./pages/DocEditorPage'))
const UsersPage = lazy(() => import('./pages/UsersPage'))
const RevisionsPage = lazy(() => import('./pages/RevisionsPage'))

export default function Routes() {
  return (
    <ReactRoutes>
      <Route path="/" element={<HomePage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/logout" element={<LogoutPage />} />
      <Route path="/_new" element={<NewDocPage />} />
      <Route path="/_edit/:docId" element={<DocEditorPage />} />
      <Route path="/_revisions/:docId" element={<RevisionsPage />} />
      <Route path="/_users" element={<UsersPage />} />
      <Route path="/*" element={<DocPage />} />
    </ReactRoutes>
  )
}
