import { Link, useParams } from 'react-router-dom'
import { useCallback, useEffect, useState } from 'react'
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
  const [uploadingFile, setUploadingFile] = useState(false)
  const [docUploads, setDocUploads] = useState<Upload[]>([])
  const [loadingUploads, setLoadingUploads] = useState(false)

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
        setUrlpath(response.data.urlpath)
        setIsPublic(response.data.public)
        setContent(response.data.markdown)
        // Fetch uploads for this document
        fetchDocUploads(response.data.id)
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
    if (!window.confirm('Are you sure you want to delete this file? This action cannot be undone.')) {
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

  const insertUploadLink = (upload: Upload) => {
    const textarea = document.querySelector('textarea[name="content"]') as HTMLTextAreaElement | null
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
    <div className="card bg-base-200 m-4 max-h-full overflow-y-auto shadow-lg">
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
              onPaste={textAreaPaste}
              onDrop={textAreaDrop}
              required
            ></textarea>
            {uploadingFile && <progress className="progress max-w-200"></progress>}
            <div
              className="border-accent bg-base-100 gnotus-content max-h-100 min-h-50 w-1/2 max-w-200 min-w-75 grow overflow-auto rounded-lg border p-2"
              dangerouslySetInnerHTML={{
                __html: DOMPurify.sanitize(md.render(content)),
              }}
            ></div>
          </div>
        </fieldset>

        {/* Attachments Section */}
        <div className="collapse collapse-arrow bg-base-100 rounded-lg">
          <input type="checkbox" defaultChecked />
          <div className="collapse-title font-medium">
            Attachments ({docUploads.length})
          </div>
          <div className="collapse-content">
            {loadingUploads ? (
              <div className="flex justify-center p-4">
                <span className="loading loading-spinner loading-md"></span>
              </div>
            ) : docUploads.length === 0 ? (
              <p className="text-base-content/60 text-sm">
                No attachments yet. Upload files by dragging them into the content area, pasting, or
                using the button below.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="table table-sm">
                  <thead>
                    <tr>
                      <th>Filename</th>
                      <th className="w-40 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {docUploads.map((upload) => (
                      <tr key={upload.id}>
                        <td className="overflow-hidden text-nowrap overflow-ellipsis">
                          {upload.filename}
                        </td>
                        <td className="text-center">
                          <button
                            type="button"
                            className="btn btn-ghost btn-xs"
                            title="Insert link"
                            onClick={() => insertUploadLink(upload)}
                          >
                            <Link2Icon className="h-4 w-4" />
                          </button>
                          <a
                            href={`/api/uploads/${upload.id}/download/${upload.filename}?download=false`}
                            className="btn btn-ghost btn-xs"
                            target="_blank"
                            title="View"
                          >
                            <EyeIcon className="h-4 w-4" />
                          </a>
                          <a
                            href={`/api/uploads/${upload.id}/download/${upload.filename}`}
                            className="btn btn-ghost btn-xs"
                            title="Download"
                          >
                            <DownloadIcon className="h-4 w-4" />
                          </a>
                          <button
                            type="button"
                            className="btn btn-ghost btn-xs text-error"
                            title="Delete"
                            onClick={() => deleteUpload(upload.id)}
                          >
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="mt-4">
              <label className="btn btn-secondary btn-sm">
                <input
                  type="file"
                  className="hidden"
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
        </div>

        <div className="card-actions">
          <button type="submit" className="btn btn-primary w-full" disabled={loading || saving}>
            {saving ? <span className="loading loading-spinner"></span> : 'Save Document'}
          </button>
        </div>
      </form>
    </div>
  )
}
