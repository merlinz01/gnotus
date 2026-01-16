import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import axios, { getErrorMessage } from '../axios'
import useUser from '../stores/user'
import useConfig from '../stores/config'
import Role from '../types/role'

export default function SettingsPage() {
  const user = useUser((state) => state.user)
  const userLoaded = useUser((state) => state.loaded)
  const globalConfig = useConfig((state) => state.config)
  const setGlobalConfig = useConfig((state) => state.setConfig)
  const navigate = useNavigate()

  const [siteName, setSiteName] = useState('')
  const [primaryColor, setPrimaryColor] = useState('')
  const [secondaryColor, setSecondaryColor] = useState('')
  const [primaryColorDark, setPrimaryColorDark] = useState('')
  const [secondaryColorDark, setSecondaryColorDark] = useState('')
  const [iconPreviewUrl, setIconPreviewUrl] = useState('/api/icon')
  const [currentIconId, setCurrentIconId] = useState<number | null>(null)
  const [uploadingIcon, setUploadingIcon] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    document.title = `Settings - ${globalConfig.site_name}`
  }, [globalConfig])

  useEffect(() => {
    if (!userLoaded) return
    if (!user || user.role !== Role.ADMIN) {
      navigate('/')
      return
    }
    fetchConfig()
  }, [user, userLoaded, navigate])

  const fetchConfig = async () => {
    setLoading(true)
    try {
      const response = await axios.get('/api/config.json')
      setSiteName(response.data.site_name)
      setPrimaryColor(response.data.primary_color)
      setSecondaryColor(response.data.secondary_color)
      setPrimaryColorDark(response.data.primary_color_dark)
      setSecondaryColorDark(response.data.secondary_color_dark)
      setCurrentIconId(response.data.site_icon_upload_id)
      setIconPreviewUrl(`/api/icon?t=${Date.now()}`)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  const handleIconUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploadingIcon(true)
    setError(null)
    setSuccess(false)
    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await axios.post('/api/icon', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })

      setCurrentIconId(response.data.id)
      setIconPreviewUrl(`/api/icon?t=${Date.now()}`)
      setSuccess(true)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setUploadingIcon(false)
    }
  }

  const handleRevertIcon = async () => {
    setUploadingIcon(true)
    setError(null)
    setSuccess(false)
    try {
      await axios.delete('/api/icon')
      setCurrentIconId(null)
      setIconPreviewUrl(`/api/icon?t=${Date.now()}`)
      setSuccess(true)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setUploadingIcon(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSuccess(false)
    try {
      const response = await axios.put('/api/config.json', {
        site_name: siteName,
        primary_color: primaryColor,
        secondary_color: secondaryColor,
        primary_color_dark: primaryColorDark,
        secondary_color_dark: secondaryColorDark,
      })
      const configWithTimestamp = { ...response.data, loaded_at: Date.now() }
      setGlobalConfig(configWithTimestamp)
      localStorage.setItem('app_config', JSON.stringify(configWithTimestamp))
      setSuccess(true)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  if (!userLoaded || !user || user.role !== Role.ADMIN) {
    return null
  }

  return (
    <div className="m-4 flex max-h-full flex-col overflow-y-auto">
      <nav className="breadcrumbs text-sm" aria-label="Breadcrumbs">
        <ul>
          <li>
            <Link to="/_admin">Administration</Link>
          </li>
          <li>Settings</li>
        </ul>
      </nav>
      <div className="card border-base-300 bg-base-200 border shadow-lg">
        <div className="card-body">
          <h1 className="card-title text-2xl">Site Settings</h1>
          {loading ? (
            <div className="flex justify-center p-4">
              <span className="loading loading-spinner loading-md"></span>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              {error && <div className="alert alert-error text-sm">{error}</div>}
              {success && (
                <div className="alert alert-success text-sm">Settings saved successfully</div>
              )}
              <fieldset className="fieldset">
                <label className="label">Site Icon</label>
                <div className="flex items-center gap-4">
                  <div className="bg-base-100 border-base-300 rounded-lg border p-2">
                    <img
                      src={iconPreviewUrl}
                      alt="Current site icon"
                      className="h-12 w-12 object-contain"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="btn btn-secondary btn-sm">
                      <input
                        type="file"
                        className="hidden"
                        accept=".svg,.png,.jpg,.jpeg,.ico,.webp,.gif,image/*"
                        onChange={handleIconUpload}
                        disabled={saving || uploadingIcon}
                      />
                      {uploadingIcon ? (
                        <span className="loading loading-spinner loading-sm"></span>
                      ) : (
                        'Upload New Icon'
                      )}
                    </label>
                    {currentIconId && (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={handleRevertIcon}
                        disabled={saving || uploadingIcon}
                      >
                        Revert to Default
                      </button>
                    )}
                  </div>
                </div>
                <p className="text-base-content/60 mt-1 text-xs">
                  Recommended: 48x48 to 512x512 pixels. Max 512KB. Supported: SVG, PNG, JPG, ICO,
                  WebP, GIF
                </p>
              </fieldset>
              <fieldset className="fieldset">
                <label className="label" htmlFor="site-name">
                  Site Name
                </label>
                <input
                  id="site-name"
                  type="text"
                  className="input input-bordered w-full"
                  value={siteName}
                  onChange={(e) => setSiteName(e.target.value)}
                  disabled={saving}
                />
              </fieldset>
              <div className="grid gap-4 sm:grid-cols-2">
                <fieldset className="fieldset">
                  <label className="label" htmlFor="primary-color">
                    Primary Color
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="primary-color"
                      type="color"
                      className="input input-bordered h-10 w-14 p-1"
                      value={primaryColor}
                      onChange={(e) => setPrimaryColor(e.target.value)}
                      disabled={saving}
                    />
                    <input
                      type="text"
                      className="input input-bordered flex-1"
                      value={primaryColor}
                      onChange={(e) => setPrimaryColor(e.target.value)}
                      disabled={saving}
                    />
                  </div>
                </fieldset>
                <fieldset className="fieldset">
                  <label className="label" htmlFor="secondary-color">
                    Secondary Color
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="secondary-color"
                      type="color"
                      className="input input-bordered h-10 w-14 p-1"
                      value={secondaryColor}
                      onChange={(e) => setSecondaryColor(e.target.value)}
                      disabled={saving}
                    />
                    <input
                      type="text"
                      className="input input-bordered flex-1"
                      value={secondaryColor}
                      onChange={(e) => setSecondaryColor(e.target.value)}
                      disabled={saving}
                    />
                  </div>
                </fieldset>
                <fieldset className="fieldset">
                  <label className="label" htmlFor="primary-color-dark">
                    Primary Color (Dark)
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="primary-color-dark"
                      type="color"
                      className="input input-bordered h-10 w-14 p-1"
                      value={primaryColorDark}
                      onChange={(e) => setPrimaryColorDark(e.target.value)}
                      disabled={saving}
                    />
                    <input
                      type="text"
                      className="input input-bordered flex-1"
                      value={primaryColorDark}
                      onChange={(e) => setPrimaryColorDark(e.target.value)}
                      disabled={saving}
                    />
                  </div>
                </fieldset>
                <fieldset className="fieldset">
                  <label className="label" htmlFor="secondary-color-dark">
                    Secondary Color (Dark)
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="secondary-color-dark"
                      type="color"
                      className="input input-bordered h-10 w-14 p-1"
                      value={secondaryColorDark}
                      onChange={(e) => setSecondaryColorDark(e.target.value)}
                      disabled={saving}
                    />
                    <input
                      type="text"
                      className="input input-bordered flex-1"
                      value={secondaryColorDark}
                      onChange={(e) => setSecondaryColorDark(e.target.value)}
                      disabled={saving}
                    />
                  </div>
                </fieldset>
              </div>
              <div className="card-actions mt-2">
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? <span className="loading loading-spinner loading-sm"></span> : 'Save'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
