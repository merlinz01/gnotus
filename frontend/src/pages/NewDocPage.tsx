import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import axios from '../axios'
import useUser from '../stores/user'
import type Doc from '../types/doc'
import useConfig from '../stores/config'

export default function NewDocPage() {
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [documents, setDocuments] = useState<Doc[]>([] as Doc[])
  const navigate = useNavigate()
  const user = useUser((state) => state.user)
  const userLoaded = useUser((state) => state.loaded)
  const storagePrefix = useUser((state) => state.storagePrefix)
  const config = useConfig((state) => state.config)
  const [searchParams] = useSearchParams()
  const [parentId, setParentId] = useState(searchParams.get('parent') || '')
  const [slug, setSlug] = useState('')
  const [title, setTitle] = useState('')
  useEffect(() => {
    document.title = `New Document - ${config.site_name}`
  }, [config])
  useEffect(() => {
    if (!userLoaded) {
      return
    }
    if (!user) {
      navigate('/login')
    }
    const fetchDocuments = async () => {
      setError(null)
      setLoading(true)
      try {
        const response = await axios.get('/api/docs/')
        setDocuments(response.data.items)
      } catch (err) {
        console.error('Error fetching documents:', err)
        setError('Failed to load documents. Please try again later.')
      } finally {
        setLoading(false)
      }
    }
    fetchDocuments()
  }, [user, userLoaded, navigate])
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setSaving(true)
    try {
      const response = await axios.post('/api/docs/', {
        parent_id:
          (event.currentTarget.elements.namedItem('parentId')! as HTMLInputElement).value || null,
        title: (event.currentTarget.elements.namedItem('titleField')! as HTMLInputElement).value,
        slug: (event.currentTarget.elements.namedItem('slug')! as HTMLInputElement).value,
        public:
          documents.find((doc) => doc.id === parseInt(event.currentTarget.parentId.value, 10))
            ?.public || false,
      })
      localStorage.setItem(
        `${storagePrefix}doc:${response.data.urlpath}`,
        JSON.stringify({ data: response.data, timestamp: Date.now() })
      )
      for (const parent of response.data.parents) {
        localStorage.removeItem(`${storagePrefix}doc:${parent.urlpath}`)
      }
      localStorage.removeItem(`${storagePrefix}outline`)
      localStorage.removeItem(`${storagePrefix}outline-toplevel`)
      const evt = new CustomEvent('outline-changed')
      document.dispatchEvent(evt)
      navigate(`/_edit/${response.data.id}`)
    } catch (err) {
      console.error('Error creating document:', err)
      setError('Failed to create new document. Please try again later.')
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    const computedSlug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 100)
    setSlug(computedSlug)
  }, [title])

  return (
    <div className="card bg-base-200 m-4 max-h-full overflow-y-auto shadow-lg">
      <form className="card-body flex flex-col gap-4" onSubmit={submit} role="form">
        <div className="card-title">
          <h2 className="text-2xl font-bold">Create New Document</h2>
        </div>
        <fieldset className="fieldset">
          <label className="label" htmlFor="new-doc-parent">
            Parent document
          </label>
          <select
            id="new-doc-parent"
            name="parentId"
            className="select select-bordered w-full"
            value={parentId}
            onChange={(e) => setParentId(e.target.value)}
          >
            <option value="">(Top-level document)</option>
            {loading ? (
              <option disabled>Loading documents...</option>
            ) : (
              documents.map((doc) => (
                <option key={doc.id} value={doc.id}>
                  {doc.title}
                </option>
              ))
            )}
          </select>
          <label className="label" htmlFor="new-doc-title">
            Document title
          </label>
          <input
            id="new-doc-title"
            type="text"
            name="titleField"
            placeholder="How to make a widget"
            className="input input-bordered w-full"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
          <label className="label" htmlFor="new-doc-slug">
            URL slug
          </label>
          <input
            id="new-doc-slug"
            type="text"
            name="slug"
            placeholder="how-to-make-a-widget"
            className="input input-bordered w-full"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            required
          />
        </fieldset>
        {error && (
          <div className="alert alert-error shadow-lg">
            <span>{error}</span>
          </div>
        )}
        <button type="submit" className="btn btn-primary">
          {saving ? <span className="loading loading-spinner"></span> : 'Create Document'}
        </button>
      </form>
    </div>
  )
}
