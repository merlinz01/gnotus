import { useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { UsersIcon, UploadIcon, SettingsIcon } from 'lucide-react'
import useUser from '../stores/user'
import useConfig from '../stores/config'
import Role from '../types/role'
import './AdminPage.css'

export default function AdminPage() {
  const user = useUser((state) => state.user)
  const userLoaded = useUser((state) => state.loaded)
  const navigate = useNavigate()
  const config = useConfig((state) => state.config)

  useEffect(() => {
    document.title = `Administration - ${config.site_name}`
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
    <div className="admin-home">
      <h1 className="admin-home-title">Administration</h1>
      <div className="admin-home-grid">
        {user.role === Role.ADMIN && (
          <Link to="/_users" className="card admin-home-card">
            <div className="card-body admin-home-card-body">
              <UsersIcon />
              <div>
                <h2 className="card-title">Users</h2>
                <p className="admin-home-card-description">Manage user accounts and roles</p>
              </div>
            </div>
          </Link>
        )}
        <Link to="/_uploads" className="card admin-home-card">
          <div className="card-body admin-home-card-body">
            <UploadIcon />
            <div>
              <h2 className="card-title">Uploads</h2>
              <p className="admin-home-card-description">Manage uploaded files</p>
            </div>
          </div>
        </Link>
        {user.role === Role.ADMIN && (
          <Link to="/_settings" className="card admin-home-card">
            <div className="card-body admin-home-card-body">
              <SettingsIcon />
              <div>
                <h2 className="card-title">Settings</h2>
                <p className="admin-home-card-description">Configure site settings</p>
              </div>
            </div>
          </Link>
        )}
      </div>
    </div>
  )
}
