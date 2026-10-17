import { useEffect, useState } from 'react'
import axios from '../axios'
import useUser from '../stores/user'
import { useNavigate } from 'react-router-dom'
import useConfig from '../stores/config'
import './AuthPage.css'

export default function LogoutPage() {
  const setUser = useUser((state) => state.setUser)
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const config = useConfig((state) => state.config)
  useEffect(() => {
    document.title = `Logging out - ${config.site_name}`
  }, [config])
  useEffect(() => {
    const submit = async () => {
      setError(null)
      setLoading(true)
      try {
        await axios.post('/api/auth/logout')
        setUser(null)
        navigate('/')
      } catch (err) {
        console.error('Login error:', err)
        setError('An error occurred while trying to log out. Please try again later.')
      } finally {
        setLoading(false)
      }
    }
    submit()
  })

  return (
    <div className="auth-page">
      <div className="logout-status">
        {error && (
          <div className="alert alert-error form-error">
            <span>{error}</span>
          </div>
        )}
        {loading && <span className="loading" role="status"></span>}
      </div>
    </div>
  )
}
