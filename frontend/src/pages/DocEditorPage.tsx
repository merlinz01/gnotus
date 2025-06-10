import { Link, useParams } from 'react-router-dom'
import { useCallback, useEffect, useState } from 'react'
import axios from '../axios'
import useUser from '../stores/user'
import { useNavigate } from 'react-router-dom'
import type Doc from '../types/doc'
import markdownit from 'markdown-it'
import DOMPurify from 'dompurify'
import '../assets/content.css'
import { ChevronDownIcon, ChevronUpIcon, HistoryIcon, TrashIcon } from 'lucide-react'
import useConfig from '../stores/config'

const md = markdownit({
  html: true,
  linkify: true,
  typographer: true,
})

export default function DocEditorPage() {
  const { docId } = useParams()
  const [doc, setDoc] = useState<Doc | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const user = useUser((state) => state.user)
  const storagePrefix = useUser((state) => state.storagePrefix)
  const userLoaded = useUser((state) => state.loaded)
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [urlpath, setUrlpath] = useState('')
  const [isPublic, setIsPublic] = useState(false)
  const [content, setContent] = useState('')
  const [deleting, setDeleting] = useState(false)
  const config = useConfig((state) => state.config)
  useEffect(() => {
    if (doc) {
      document.title = `Editing ${doc.title} - ${config.site_name}`
    } else {
      document.title = `Edit Document - ${config.site_name}`
    }
  }, [doc, config])

  useEffect(() => {
    if (!userLoaded) {
      return
    }
    if (!user) {
      navigate('/login')
      return
    }
    const fetchDoc = async () => {
      setError(null)
      setLoading(true)
      try {
        const response = await axios.get(`/api/docs/${docId}?include_source=true`)
        setDoc(response.data)
        setTitle(response.data.title)
        setUrlpath(response.data.urlpath)
        setIsPublic(response.data.public)
        setContent(response.data.markdown)
      } catch (error) {
        console.error('Error fetching document:', error)
        setError('Failed to load document. Please try again later.')
      } finally {
        setLoading(false)
      }
    }
    fetchDoc()
  }, [docId, user, userLoaded, navigate])

  const saveDoc = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      if (!doc) return
      setError(null)
      setSaving(true)
      try {
        const response = await axios.put(`/api/docs/${doc.id}`, {
          title: title,
          urlpath: urlpath,
          public: isPublic,
          markdown: content,
        })
        setDoc(response.data)
        localStorage.removeItem(`${storagePrefix}doc:${response.data.urlpath}`)
        for (const parent of response.data.parents) {
          localStorage.removeItem(`${storagePrefix}doc:${parent.urlpath}`)
        }
        localStorage.removeItem(`${storagePrefix}outline`)
        localStorage.removeItem(`${storagePrefix}outline-toplevel`)
        const evt = new CustomEvent('outline-changed')
        document.dispatchEvent(evt)
        navigate(`/${response.data.urlpath}`)
      } catch (error) {
        console.error('Error updating document:', error)
        setError('Failed to update document. Please try again later.')
      } finally {
        setSaving(false)
      }
    },
    [doc, storagePrefix, isPublic, content, navigate, title, urlpath]
  )

  const moveDoc = useCallback(
    async (direction: 'up' | 'down') => {
      if (!doc) return
      setError(null)
      setSaving(true)
      try {
        await axios.post(`/api/docs/${doc.id}/move?direction=${direction}`)
        for (const parent of doc.parents) {
          localStorage.removeItem(`${storagePrefix}doc:${parent.urlpath}`)
        }
        localStorage.removeItem(`${storagePrefix}outline`)
        localStorage.removeItem(`${storagePrefix}outline-toplevel`)
        const evt = new CustomEvent('outline-changed')
        document.dispatchEvent(evt)
      } catch (error) {
        console.error(`Error moving document ${direction}:`, error)
        setError(`Failed to move document ${direction}. Please try again later.`)
      } finally {
        setSaving(false)
      }
    },
    [doc, storagePrefix]
  )

  const deleteDoc = useCallback(async () => {
    if (!doc) return
    if (
      !window.confirm(
        'Are you sure you want to delete this document? This action cannot be undone.'
      )
    ) {
      return
    }
    setError(null)
    setDeleting(true)
    try {
      await axios.delete(`/api/docs/${doc.id}`)
      localStorage.removeItem(`${storagePrefix}doc:${doc.urlpath}`)
      for (const parent of doc.parents) {
        localStorage.removeItem(`${storagePrefix}doc:${parent.urlpath}`)
      }
      localStorage.removeItem(`${storagePrefix}outline`)
      localStorage.removeItem(`${storagePrefix}outline-toplevel`)
      const evt = new CustomEvent('outline-changed')
      document.dispatchEvent(evt)
      navigate('/')
    } catch (error) {
      console.error('Error deleting document:', error)
      setError('Failed to delete document. Please try again later.')
    } finally {
      setDeleting(false)
    }
  }, [doc, storagePrefix, navigate])

  return (
    <div className="card bg-base-200 m-4 shadow-lg">
      <form className="card-body flex flex-col gap-4" onSubmit={saveDoc}>
        <div className="card-title">
          <h2 className="text-2xl font-bold">Edit document</h2>
          {loading && <span className="loading loading-spinner loading-lg" role="status"></span>}
          <div className="grow"></div>
          <button
            type="button"
            className="btn btn-ghost btn-square text-secondary"
            onClick={() => moveDoc('up')}
            title="Move document up"
          >
            <ChevronUpIcon />
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-square text-secondary"
            onClick={() => moveDoc('down')}
            title="Move document down"
          >
            <ChevronDownIcon />
          </button>
          <Link
            to={`/_revisions/${doc?.id}`}
            className="btn btn-ghost btn-square text-primary"
            title="View document history"
          >
            <HistoryIcon />
          </Link>
          <button
            type="button"
            className="btn btn-ghost btn-square text-error"
            onClick={deleteDoc}
            title="Delete document"
          >
            {deleting ? <span className="loading loading-spinner"></span> : <TrashIcon />}
          </button>
        </div>
        {error && (
          <div className="alert alert-error shadow-lg">
            <div>
              <span>{error}</span>
            </div>
          </div>
        )}
        <fieldset className="fieldset">
          <label className="label" htmlFor="doc-edit-title">
            Document title
          </label>
          <input
            type="text"
            id="doc-edit-title"
            name="doctitle"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="input input-bordered w-full"
            disabled={loading || saving}
            required
          />
          <label className="label" htmlFor="doc-edit-urlpath">
            Document URL path
          </label>
          <input
            type="text"
            id="doc-edit-urlpath"
            name="urlpath"
            value={urlpath}
            onChange={(e) => setUrlpath(e.target.value)}
            className="input input-bordered w-full"
            disabled={loading || saving}
            required
          />
          <label htmlFor="doc-edit-public" className="label">
            <input
              type="checkbox"
              name="public"
              id="doc-edit-public"
              className="toggle toggle-primary"
              checked={isPublic}
              onChange={(e) => setIsPublic(e.target.checked)}
              disabled={loading || saving}
            />
            <span className="label-text">Public document</span>
          </label>
          <label className="label">Document content</label>
          <div className="flex w-full flex-wrap justify-center gap-2">
            <textarea
              name="content"
              className="textarea textarea-bordered min-h-50 w-1/2 max-w-200 min-w-75 grow"
              placeholder="Write your document content here..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              disabled={loading || saving}
              onKeyDown={textAreaKeyDown}
              required
            ></textarea>
            <div
              className="border-accent bg-base-100 gnotus-content max-h-100 min-h-50 w-1/2 max-w-200 min-w-75 grow overflow-auto rounded-lg border p-2"
              dangerouslySetInnerHTML={{
                __html: DOMPurify.sanitize(md.render(content)),
              }}
            ></div>
          </div>
        </fieldset>
        <div className="card-actions">
          <button type="submit" className="btn btn-primary w-full" disabled={loading || saving}>
            {saving ? <span className="loading loading-spinner"></span> : 'Save Document'}
          </button>
        </div>
      </form>
    </div>
  )
}

const textAreaKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
  if (event.key === 'Tab') {
    event.preventDefault()
    const textarea = event.target as HTMLTextAreaElement

    const spaces = '    '
    const start = textarea.selectionStart
    const end = textarea.selectionEnd

    // Use insertText command if supported
    if (document.queryCommandSupported && document.queryCommandSupported('insertText')) {
      // Fallback-safe: temporarily focus, select, then insert text
      textarea.setSelectionRange(start, end)
      document.execCommand('insertText', false, spaces)
    } else {
      // Fallback for environments where execCommand is deprecated/unsupported
      const value = textarea.value
      textarea.value = value.slice(0, start) + spaces + value.slice(end)
      textarea.setSelectionRange(start + spaces.length, start + spaces.length)
    }
  }
}
