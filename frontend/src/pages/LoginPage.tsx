import { useEffect, useState } from 'react'
import axios, { getErrorMessage } from '../axios'
import useUser from '../stores/user'
import { useNavigate } from 'react-router-dom'
import useConfig from '../stores/config'
import './AuthPage.css'

export default function LoginPage() {
  const setUser = useUser((state) => state.setUser)
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const config = useConfig((state) => state.config)
  useEffect(() => {
    document.title = `Log in - ${config.site_name}`
  }, [config])
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const response = await axios.post(
        '/api/auth/login',
        {
          username: (event.currentTarget.elements.namedItem('username') as HTMLInputElement).value,
          password: (event.currentTarget.elements.namedItem('password') as HTMLInputElement).value,
        },
        {
          validateStatus(status) {
            return status === 200 || status === 401
          },
        }
      )
      if (response.status === 200) {
        setUser(response.data.user)
        navigate('/')
      } else {
        setUser(null)
        setError('Login failed: ' + getErrorMessage(response.data?.detail) || 'Invalid credentials')
      }
    } catch (err) {
      console.error('Login error:', err)
      setError('An error occurred while trying to log in. Please try again later.')
    } finally {
      setLoading(false)
      const pw = document.getElementById('login-password')
      if (pw) (pw as HTMLInputElement).value = ''
    }
  }

  return (
    <div className="auth-page">
      <form className="card card-border auth-card" onSubmit={submit}>
        <div className="card-body">
          <h2 className="card-title page-heading">Log in</h2>
          <fieldset className="fieldset">
            <label className="label" htmlFor="login-username">
              Username
            </label>
            <input
              type="text"
              id="login-username"
              name="username"
              placeholder="Enter your username"
              className="input"
              required
            />
            <label className="label" htmlFor="login-password">
              Password
            </label>
            <input
              id="login-password"
              type="password"
              name="password"
              placeholder="Enter your password"
              className="input"
              required
            />
          </fieldset>
          {error && (
            <div className="alert alert-error form-error">
              <span>{error}</span>
            </div>
          )}
          <div className="card-actions auth-actions">
            <button type="submit" className="btn btn-primary auth-submit">
              {loading ? <span className="loading loading-sm"></span> : 'Log in'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
