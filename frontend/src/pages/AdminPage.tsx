import { useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { UsersIcon, UploadIcon, SettingsIcon } from 'lucide-react'
import useUser from '../stores/user'
import useConfig from '../stores/config'
import Role from '../types/role'

export default function AdminPage() {
  const user = useUser((state) => state.user)
  const userLoaded = useUser((state) => state.loaded)
  const navigate = useNavigate()
  const config = useConfig((state) => state.config)

  useEffect(() => {
    document.title = `Admin - ${config.site_name}`
  }, [config])

  useEffect(() => {
    if (!userLoaded) {
      return
    }
    if (!user || (user.role !== Role.ADMIN && user.role !== Role.USER)) {
      navigate('/')
    }
  }, [user, userLoaded, navigate])

  if (!userLoaded || !user || (user.role !== Role.ADMIN && user.role !== Role.USER)) {
    return null
  }

  return (
    <div className="mx-auto w-full max-w-200 px-4 py-6">
      <h1 className="text-primary mb-6 text-3xl font-bold">Administration</h1>
      <div className="grid gap-4 sm:grid-cols-2">
        {user.role === Role.ADMIN && (
          <Link
            to="/_users"
            className="card bg-base-200 hover:bg-base-300 transition-colors"
          >
            <div className="card-body flex-row items-center gap-4">
              <UsersIcon className="h-8 w-8" />
              <div>
                <h2 className="card-title">Users</h2>
                <p className="text-sm opacity-70">Manage user accounts and roles</p>
              </div>
            </div>
          </Link>
        )}
        <Link
          to="/_uploads"
          className="card bg-base-200 hover:bg-base-300 transition-colors"
        >
          <div className="card-body flex-row items-center gap-4">
            <UploadIcon className="h-8 w-8" />
            <div>
              <h2 className="card-title">Uploads</h2>
              <p className="text-sm opacity-70">Manage uploaded files</p>
            </div>
          </div>
        </Link>
        {user.role === Role.ADMIN && (
          <Link
            to="/_settings"
            className="card bg-base-200 hover:bg-base-300 transition-colors"
          >
            <div className="card-body flex-row items-center gap-4">
              <SettingsIcon className="h-8 w-8" />
              <div>
                <h2 className="card-title">Settings</h2>
                <p className="text-sm opacity-70">Configure site settings</p>
              </div>
            </div>
          </Link>
        )}
      </div>
    </div>
  )
}
