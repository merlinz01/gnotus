import { lazy } from 'react'
import type { RouteObject } from 'react-router-dom'
import DocPage from './pages/DocPage'
import App from './App'

const HomePage = lazy(() => import('./pages/HomePage'))
const LoginPage = lazy(() => import('./pages/LoginPage'))
const LogoutPage = lazy(() => import('./pages/LogoutPage'))
const NewDocPage = lazy(() => import('./pages/NewDocPage'))
const DocEditorPage = lazy(() => import('./pages/DocEditorPage'))
const UsersPage = lazy(() => import('./pages/UsersPage'))
const RevisionsPage = lazy(() => import('./pages/RevisionsPage'))
const UploadsPage = lazy(() => import('./pages/UploadsPage'))
const SharedDocPage = lazy(() => import('./pages/SharedDocPage'))
const AdminPage = lazy(() => import('./pages/AdminPage'))

const routes: RouteObject[] = [
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'login', element: <LoginPage /> },
      { path: 'logout', element: <LogoutPage /> },
      { path: '_new', element: <NewDocPage /> },
      { path: '_edit/:docId', element: <DocEditorPage /> },
      { path: '_revisions/:docId', element: <RevisionsPage /> },
      { path: '_admin', element: <AdminPage /> },
      { path: '_users', element: <UsersPage /> },
      { path: '_uploads', element: <UploadsPage /> },
      { path: '_share/:token', element: <SharedDocPage /> },
      { path: '*', element: <DocPage /> },
    ],
  },
]

export default routes
