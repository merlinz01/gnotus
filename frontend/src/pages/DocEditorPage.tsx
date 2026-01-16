import { Link, useParams, useBlocker, useBeforeUnload } from 'react-router-dom'
import { useCallback, useEffect, useRef, useState } from 'react'
import axios, { getErrorMessage } from '../axios'
import useUser from '../stores/user'
import { useNavigate } from 'react-router-dom'
import type Doc from '../types/doc'
import markdownit from 'markdown-it'
import DOMPurify from 'dompurify'
import '../assets/content.css'
import {
  ChevronDownIcon,
  ChevronUpIcon,
  DownloadIcon,
  EyeIcon,
  HistoryIcon,
  Link2Icon,
  TrashIcon,
} from 'lucide-react'
import useConfig from '../stores/config'
import type Upload from '../types/upload'

const md = markdownit({
  html: true,
  linkify: true,
  typographer: true,
}).disable('code')

/**
 * Get all descendant IDs of a document by traversing the parent_id relationships.
 */
function getDescendantIds(documents: Doc[], parentId: number): Set<number> {
  const descendants = new Set<number>()
  const queue = [parentId]
  while (queue.length > 0) {
    const currentId = queue.shift()!
    for (const doc of documents) {
      if (doc.parent_id === currentId && !descendants.has(doc.id)) {
        descendants.add(doc.id)
        queue.push(doc.id)
      }
    }
  }
  return descendants
}

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
  const [slug, setSlug] = useState('')
  const [parentId, setParentId] = useState<string>('')
  const [documents, setDocuments] = useState<Doc[]>([])
  const [loadingDocs, setLoadingDocs] = useState(false)
  const [isPublic, setIsPublic] = useState(false)
  const [content, setContent] = useState('')
  const [deleting, setDeleting] = useState(false)
  const config = useConfig((state) => state.config)
  const [uploadingFile, setUploadingFile] = useState(false)
  const [docUploads, setDocUploads] = useState<Upload[]>([])
  const [loadingUploads, setLoadingUploads] = useState(false)
  // Track original values to detect unsaved changes
  const [originalValues, setOriginalValues] = useState({
    title: '',
    slug: '',
    parentId: '',
    isPublic: false,
    content: '',
  })
  // Ref to bypass blocker after successful save
  const skipBlockerRef = useRef(false)

  const hasUnsavedChanges = useCallback(() => {
    if (skipBlockerRef.current) return false
    return (
      title !== originalValues.title ||
      slug !== originalValues.slug ||
      parentId !== originalValues.parentId ||
      isPublic !== originalValues.isPublic ||
      content !== originalValues.content
    )
  }, [title, slug, parentId, isPublic, content, originalValues])

  // Block navigation when there are unsaved changes
  const blocker = useBlocker(hasUnsavedChanges)
  useEffect(() => {
    if (blocker.state === 'blocked') {
      if (window.confirm('You have unsaved changes. Discard them?')) {
        blocker.proceed()
      } else {
        blocker.reset()
      }
    }
  }, [blocker])

  const fetchDocUploads = async (docId: number) => {
    setLoadingUploads(true)
    try {
      const response = await axios.get(`/api/uploads/by-doc/${docId}`)
      setDocUploads(response.data)
    } catch (error) {
      console.error('Error fetching document uploads:', error)
    } finally {
      setLoadingUploads(false)
    }
  }

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
        setSlug(response.data.slug)
        // First parent in the array is the immediate parent
        const currentParentId =
          response.data.parents.length > 0 ? String(response.data.parents[0].id) : ''
        setParentId(currentParentId)
        setIsPublic(response.data.public)
        setContent(response.data.markdown)
        setOriginalValues({
          title: response.data.title,
          slug: response.data.slug,
          parentId: currentParentId,
          isPublic: response.data.public,
          content: response.data.markdown,
        })
        // Fetch uploads for this document
        fetchDocUploads(response.data.id)
      } catch (error) {
        console.error('Error fetching document:', error)
        setError('Failed to load document. Please try again later.')
      } finally {
        setLoading(false)
      }
    }
    const fetchDocuments = async () => {
      setLoadingDocs(true)
      try {
        const response = await axios.get('/api/docs/')
        setDocuments(response.data.items)
      } catch (error) {
        console.error('Error fetching documents:', error)
      } finally {
        setLoadingDocs(false)
      }
    }
    fetchDoc()
    fetchDocuments()
  }, [docId, user, userLoaded, navigate])

  // Ctrl+S to save
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        const form = document.querySelector('form')
        if (form) {
          form.requestSubmit()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Warn about unsaved changes on page close/refresh
  useBeforeUnload(
    useCallback(
      (e) => {
        if (hasUnsavedChanges()) {
          e.preventDefault()
        }
      },
      [hasUnsavedChanges]
    )
  )

  const saveDoc = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      if (!doc) return
      setError(null)
      setSaving(true)
      try {
        const updateData: Record<string, unknown> = {
          title: title,
          public: isPublic,
          markdown: content,
        }
        // Don't send slug/parent_id for home page (can't be changed)
        if (doc.parent_id !== null) {
          updateData.slug = slug
          updateData.parent_id = parentId ? parseInt(parentId, 10) : 0
        }
        const response = await axios.put(`/api/docs/${doc.id}`, updateData)
        setDoc(response.data)
        // Skip blocker for this navigation since we just saved
        skipBlockerRef.current = true
        localStorage.removeItem(`${storagePrefix}doc:${response.data.urlpath}`)
        for (const parent of response.data.parents) {
          localStorage.removeItem(`${storagePrefix}doc:${parent.urlpath}`)
        }
        localStorage.removeItem(`${storagePrefix}outline`)
        localStorage.removeItem(`${storagePrefix}outline-toplevel`)
        const evt = new CustomEvent('outline-changed')
        document.dispatchEvent(evt)
        navigate(response.data.urlpath)
      } catch (error) {
        console.error('Error updating document:', error)
        setError('Failed to update document. Please try again later.')
      } finally {
        setSaving(false)
      }
    },
    [doc, storagePrefix, isPublic, content, navigate, title, slug, parentId]
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
      // Skip blocker for this navigation since we just deleted
      skipBlockerRef.current = true
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

  const textAreaKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Tab') {
      event.preventDefault()
      const textarea = event.target as HTMLTextAreaElement
      insertTextAtCursor(textarea, '    ')
    }
  }

  const textAreaPaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const clipboardData = event.clipboardData
    if (!clipboardData || !clipboardData.files || clipboardData.files.length == 0) return
    event.preventDefault()
    const textarea = event.currentTarget as HTMLTextAreaElement
    textarea.focus()
    for (const file of clipboardData.files) {
      console.log('Pasted file:', file)
      uploadFile(file)
        .then((url) => {
          const fileName = file.name
          const text = file.type.startsWith('image/')
            ? `![${fileName}](${url})`
            : `[${fileName}](${url})`
          insertTextAtCursor(textarea, text)
        })
        .catch((error) => {
          console.error('Error uploading pasted file:', error)
          alert('Failed to upload pasted file: ' + getErrorMessage(error))
        })
    }
  }

  const textAreaDrop = (event: React.DragEvent<HTMLTextAreaElement>) => {
    const dataTransfer = event.dataTransfer
    if (!dataTransfer || !dataTransfer.files || dataTransfer.files.length == 0) return
    event.preventDefault()
    const textarea = event.currentTarget as HTMLTextAreaElement
    textarea.focus()
    for (const file of dataTransfer.files) {
      console.log('Dropped file:', file)
      uploadFile(file)
        .then((url) => {
          const fileName = file.name
          const text = file.type.startsWith('image/')
            ? `![${fileName}](${url})`
            : `[${fileName}](${url})`
          insertTextAtCursor(textarea, text)
        })
        .catch((error) => {
          console.error('Error uploading dropped file:', error)
          alert('Failed to upload dropped file: ' + getErrorMessage(error))
        })
    }
  }

  const insertTextAtCursor = (textarea: HTMLTextAreaElement, text: string) => {
    textarea.focus()
    if (document.queryCommandSupported && document.queryCommandSupported('insertText')) {
      document.execCommand('insertText', false, text)
    } else {
      const start = textarea.selectionStart
      const end = textarea.selectionEnd
      const value = textarea.value
      textarea.value = value.slice(0, start) + text + value.slice(end)
      textarea.setSelectionRange(start + text.length, start + text.length)
    }
  }

  const uploadFile = async (file: File): Promise<string> => {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('filename', file.name)
    formData.append('public', isPublic ? 'true' : 'false')
    if (doc) {
      formData.append('doc_id', String(doc.id))
    }
    setUploadingFile(true)
    try {
      const response = await axios.post('/api/uploads/', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      })
      const upload = response.data as Upload
      // Refresh the uploads list
      if (doc) {
        fetchDocUploads(doc.id)
      }
      return `/api/uploads/${upload.id}/download`
    } finally {
      setUploadingFile(false)
    }
  }

  const deleteUpload = async (uploadId: number) => {
    if (
      !window.confirm('Are you sure you want to delete this file? This action cannot be undone.')
    ) {
      return
    }
    try {
      await axios.delete(`/api/uploads/${uploadId}`)
      if (doc) {
        fetchDocUploads(doc.id)
      }
    } catch (error) {
      console.error('Error deleting upload:', error)
      alert('Failed to delete file: ' + getErrorMessage(error))
    }
  }

  const isHomePage = doc !== null && doc.parent_id === null

  const insertUploadLink = (upload: Upload) => {
    const textarea = document.querySelector(
      'textarea[name="content"]'
    ) as HTMLTextAreaElement | null
    if (!textarea) return
    const url = `/api/uploads/${upload.id}/download`
    const text = upload.content_type.startsWith('image/')
      ? `![${upload.filename}](${url})`
      : `[${upload.filename}](${url})`
    insertTextAtCursor(textarea, text)
  }

  const handleAttachmentUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files || files.length === 0) return

    for (const file of files) {
      try {
        await uploadFile(file)
      } catch (error) {
        console.error('Error uploading attachment:', error)
        alert('Failed to upload ' + file.name + ': ' + getErrorMessage(error))
      }
    }
    // Clear the input so the same file can be uploaded again if needed
    event.target.value = ''
  }

  return (
    <div className="flex h-full flex-col overflow-hidden p-4">
      <form className="flex min-h-0 flex-1 flex-col gap-4" onSubmit={saveDoc}>
        {/* Header and metadata */}
        <div className="bg-base-200 flex flex-col gap-3 rounded-lg p-3 shadow">
          {/* Row 1: Title and actions */}
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold">Edit document</h2>
            {loading && <span className="loading loading-spinner loading-md" role="status"></span>}
            {!loading && hasUnsavedChanges() && (
              <span className="badge badge-warning badge-sm">Unsaved</span>
            )}
            <div className="grow"></div>
            <button type="submit" className="btn btn-primary" disabled={loading || saving}>
              {saving ? <span className="loading loading-spinner loading-sm"></span> : 'Save'}
            </button>
            <Link to={doc?.urlpath || '/'} className="btn">
              Discard
            </Link>
            <Link
              to={`/_revisions/${doc?.id}`}
              className="btn btn-square text-primary"
              title="View document history"
            >
              <HistoryIcon className="h-5 w-5" />
            </Link>
            {!isHomePage && (
              <>
                <button
                  type="button"
                  className="btn btn-square text-secondary"
                  onClick={() => moveDoc('up')}
                  title="Move document up"
                >
                  <ChevronUpIcon className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  className="btn btn-square text-secondary"
                  onClick={() => moveDoc('down')}
                  title="Move document down"
                >
                  <ChevronDownIcon className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  className="btn btn-square text-error"
                  onClick={deleteDoc}
                  title="Delete document"
                >
                  {deleting ? (
                    <span className="loading loading-spinner loading-sm"></span>
                  ) : (
                    <TrashIcon className="h-5 w-5" />
                  )}
                </button>
              </>
            )}
          </div>
          {/* Row 2: Parent and URL slug (hidden for home page) */}
          {!isHomePage && (
            <div className="flex flex-wrap items-end gap-4">
              <div className="min-w-48 flex-1">
                <label className="label text-sm" htmlFor="doc-edit-parent">
                  Parent
                </label>
                <select
                  id="doc-edit-parent"
                  name="parentId"
                  className="select select-bordered w-full"
                  value={parentId}
                  onChange={(e) => setParentId(e.target.value)}
                  disabled={loading || saving || loadingDocs}
                  required
                >
                  <option value="" disabled>
                    Select a parent document
                  </option>
                  {(() => {
                    if (loadingDocs) {
                      return <option disabled>Loading documents...</option>
                    }
                    // Compute excluded IDs once: self + all descendants
                    const excludeIds = doc
                      ? new Set([doc.id, ...getDescendantIds(documents, doc.id)])
                      : new Set<number>()
                    return documents
                      .filter((d) => !excludeIds.has(d.id))
                      .map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.title}
                        </option>
                      ))
                  })()}
                </select>
              </div>
              <div className="min-w-48 flex-1">
                <label className="label text-sm" htmlFor="doc-edit-slug">
                  URL slug
                </label>
                <input
                  type="text"
                  id="doc-edit-slug"
                  name="slug"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  className="input input-bordered w-full"
                  disabled={loading || saving}
                  required
                />
              </div>
            </div>
          )}
          {/* Row 3: Title and Public */}
          <div className="flex flex-wrap items-end gap-4">
            <div className="min-w-48 flex-1">
              <label className="label text-sm" htmlFor="doc-edit-title">
                Title
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
            </div>
            <label
              htmlFor="doc-edit-public"
              className="flex cursor-pointer items-center gap-2 pb-2"
            >
              <input
                type="checkbox"
                name="public"
                id="doc-edit-public"
                className="toggle toggle-primary"
                checked={isPublic}
                onChange={(e) => setIsPublic(e.target.checked)}
                disabled={loading || saving}
              />
              <span className="text-sm">Public</span>
            </label>
          </div>
        </div>

        {error && (
          <div className="alert alert-error shadow-lg">
            <span>{error}</span>
          </div>
        )}

        {/* Editor and Preview - side by side */}
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 md:grid-cols-2">
          {/* Editor */}
          <div className="flex min-h-64 flex-col">
            <label className="label py-1 text-sm font-medium">Markdown</label>
            <textarea
              name="content"
              className="textarea textarea-bordered min-h-0 w-full flex-1 resize-none font-mono text-sm"
              placeholder="Write your document content here..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              disabled={loading || saving}
              onKeyDown={textAreaKeyDown}
              onPaste={textAreaPaste}
              onDrop={textAreaDrop}
            ></textarea>
            {uploadingFile && <progress className="progress progress-primary mt-2"></progress>}
          </div>

          {/* Preview */}
          <div className="flex min-h-64 flex-col">
            <label className="label py-1 text-sm font-medium">Preview</label>
            <div
              className="border-base-300 bg-base-100 gnotus-content min-h-0 flex-1 overflow-auto rounded-lg border p-4"
              dangerouslySetInnerHTML={{
                __html: DOMPurify.sanitize(md.render(content)),
              }}
            ></div>
          </div>
        </div>

        {/* Attachments Section */}
        <details className="bg-base-200 rounded-lg shadow">
          <summary className="cursor-pointer rounded-lg p-3 font-medium">
            Attachments ({docUploads.length})
          </summary>
          <div className="border-base-300 border-t p-3">
            {loadingUploads ? (
              <div className="flex justify-center p-4">
                <span className="loading loading-spinner loading-md"></span>
              </div>
            ) : docUploads.length === 0 ? (
              <p className="text-base-content/60 text-sm">
                No attachments yet. Drag files into the editor, paste, or use the button below.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {docUploads.map((upload) => (
                  <div
                    key={upload.id}
                    className="bg-base-100 flex items-center gap-1 rounded-lg px-2 py-1 text-sm"
                  >
                    <span className="max-w-32 truncate">{upload.filename}</span>
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs"
                      title="Insert link"
                      onClick={() => insertUploadLink(upload)}
                    >
                      <Link2Icon className="h-3 w-3" />
                    </button>
                    <a
                      href={`/api/uploads/${upload.id}/download/${upload.filename}?download=false`}
                      className="btn btn-ghost btn-xs"
                      target="_blank"
                      title="View"
                    >
                      <EyeIcon className="h-3 w-3" />
                    </a>
                    <a
                      href={`/api/uploads/${upload.id}/download/${upload.filename}`}
                      className="btn btn-ghost btn-xs"
                      title="Download"
                    >
                      <DownloadIcon className="h-3 w-3" />
                    </a>
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs text-error"
                      title="Delete"
                      onClick={() => deleteUpload(upload.id)}
                    >
                      <TrashIcon className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-3">
              <label className="btn btn-secondary btn-sm">
                <input
                  type="file"
                  className="absolute m-0 h-0 w-0 overflow-hidden p-0"
                  multiple
                  onChange={handleAttachmentUpload}
                  disabled={uploadingFile}
                />
                {uploadingFile ? (
                  <span className="loading loading-spinner loading-sm"></span>
                ) : (
                  'Add Attachment'
                )}
              </label>
            </div>
          </div>
        </details>
      </form>
    </div>
  )
}
