import { useEffect, useState } from 'react'
import axios, { getErrorMessage } from '../axios'
import useUser from '../stores/user'
import { useNavigate } from 'react-router-dom'
import useConfig from '../stores/config'

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
    <div className="flex h-full flex-row items-center justify-center">
      <form className="card card-border bg-base-200 max-w-100 grow shadow-lg" onSubmit={submit}>
        <div className="card-body">
          <div className="card-title">
            <h2 className="text-2xl font-bold">Log in</h2>
          </div>
          <fieldset className="fieldset">
            <label className="label" htmlFor="login-username">
              Username
            </label>
            <input
              type="text"
              id="login-username"
              name="username"
              placeholder="Enter your username"
              className="input input-bordered w-full"
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
              className="input input-bordered w-full"
              required
            />
          </fieldset>
          {error && (
            <div className="alert alert-error shadow-lg">
              <span>{error}</span>
            </div>
          )}
          <div className="card-actions justify-end">
            <button type="submit" className="btn btn-primary w-25">
              {loading ? <span className="loading loading-spinner loading-sm"></span> : 'Log in'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
