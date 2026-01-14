import type Upload from '../types/upload'
import { type DocInfo } from '../types/doc'
import { useEffect, useState } from 'react'
import axios, { getErrorMessage } from '../axios'
import useConfig from '../stores/config'
import {
  DEFAULT_PAGE_SIZE,
  EmptyPaginatedResponse,
  type PaginatedResponse,
  type PaginationParams,
} from '../types/pagination'
import useUser from '../stores/user'
import Role from '../types/role'
import { useNavigate } from 'react-router-dom'
import Pagination from '../components/Pagination'
import { DownloadIcon, EditIcon, EyeIcon, FileTextIcon, TrashIcon } from 'lucide-react'
import { Link } from 'react-router-dom'

function friendlySize(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(2)} KB`
  if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(2)} MB`
  return `${(size / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

export default function UploadsPage() {
  const config = useConfig((state) => state.config)
  const userLoaded = useUser((state) => state.loaded)
  const user = useUser((state) => state.user)
  const navigate = useNavigate()
  const [uploads, setUploads] = useState<PaginatedResponse<Upload>>(EmptyPaginatedResponse)
  const [loading, setLoading] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [pagination, setPagination] = useState<PaginationParams>({
    page: 1,
    size: DEFAULT_PAGE_SIZE,
  })
  const [newFilename, setNewFilename] = useState('')
  const [newPublic, setNewPublic] = useState(false)
  const [newDocId, setNewDocId] = useState<string>('')
  const [saving, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [editingUpload, setEditingUpload] = useState<Upload | null>(null)
  const [documents, setDocuments] = useState<DocInfo[]>([])
  useEffect(() => {
    document.title = `Uploads - ${config.site_name}`
  }, [config])
  useEffect(() => {
    const fetchDocuments = async () => {
      try {
        const response = await axios.get('/api/docs/')
        setDocuments(response.data.items || [])
      } catch (error) {
        console.error('Error fetching documents:', error)
      }
    }
    if (user) {
      fetchDocuments()
    }
  }, [user])
  const fetchUploads = async (pagination: PaginationParams) => {
    setLoading(true)
    setFetchError(null)
    try {
      const response = await axios.get('/api/uploads/', {
        params: {
          page: pagination.page,
          size: pagination.size,
        },
      })
      setUploads(response.data)
    } catch (error) {
      console.error('Error fetching uploads:', error)
      setFetchError('Failed to fetch uploads: ' + getErrorMessage(error))
      setUploads(EmptyPaginatedResponse)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    if (!userLoaded) {
      return
    }
    if (!user || (user.role !== Role.ADMIN && user.role !== Role.USER)) {
      navigate('/')
      return
    }
    fetchUploads(pagination)
  }, [user, userLoaded, navigate, pagination])
  const uploadFile = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setUploadError(null)
    const formData = new FormData(e.currentTarget)
    formData.append('filename', newFilename)
    formData.append('public', String(newPublic))
    try {
      setUploading(true)
      await axios.post('/api/uploads/', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      })
      setNewFilename('')
      setNewPublic(false)
      const dialog = document.getElementById('new-upload-dialog') as HTMLDialogElement | null
      if (dialog) {
        dialog.close()
      }
      fetchUploads(pagination)
    } catch (error) {
      console.error('Error uploading file:', error)
      setUploadError('Failed to upload file: ' + getErrorMessage(error))
    } finally {
      setUploading(false)
    }
  }
  const saveUpload = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!editingUpload) {
      return
    }
    setUploadError(null)
    try {
      setUploading(true)
      const docIdValue = newDocId.trim() === '' ? null : parseInt(newDocId, 10)
      const response = await axios.put(`/api/uploads/${editingUpload.id}`, {
        filename: newFilename,
        public: newPublic,
        doc_id: docIdValue === null ? 0 : docIdValue, // 0 means remove association
      })
      setNewFilename('')
      setNewPublic(false)
      setNewDocId('')
      setEditingUpload(null)
      const dialog = document.getElementById('edit-upload-dialog') as HTMLDialogElement | null
      if (dialog) {
        dialog.close()
      }
      setUploads((prev) => ({
        ...prev,
        items: prev.items.map((upload) =>
          upload.id === editingUpload.id ? { ...upload, ...response.data } : upload
        ),
      }))
    } catch (error) {
      console.error('Error updating upload:', error)
      setUploadError('Failed to update upload: ' + getErrorMessage(error))
    } finally {
      setUploading(false)
    }
  }
  return (
    <div className="card border-base-300 bg-base-200 m-4 max-h-full overflow-y-auto shadow-lg">
      <div className="card-body">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="card-title">Uploads</h1>
          <button
            className="btn btn-primary mb-4"
            onClick={() => {
              setNewFilename('')
              setNewPublic(false)
              setUploadError(null)
              const dialog = document.getElementById(
                'new-upload-dialog'
              ) as HTMLDialogElement | null
              if (dialog) {
                dialog.showModal()
              }
            }}
            disabled={!user || (user.role !== Role.ADMIN && user.role !== Role.USER)}
          >
            New Upload
          </button>
        </div>
        <div className="max-h-200 overflow-x-auto">
          <table className="table w-full table-fixed">
            <thead>
              <tr>
                <th>Filename</th>
                <th className="w-30">Document</th>
                <th className="w-25">Public</th>
                <th className="w-25 text-center">Size</th>
                <th className="w-50 text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="text-center">
                    <span className="loading loading-spinner loading-lg" role="status"></span>
                    <span className="sr-only">Loading uploads...</span>
                  </td>
                </tr>
              ) : fetchError ? (
                <tr>
                  <td colSpan={5} className="text-center text-red-500">
                    {fetchError}
                  </td>
                </tr>
              ) : uploads.total === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center text-gray-500">
                    No uploads found.
                  </td>
                </tr>
              ) : (
                uploads.items.map((upload) => (
                  <tr key={upload.id}>
                    <td className="overflow-hidden text-nowrap overflow-ellipsis">
                      {upload.filename}
                    </td>
                    <td>
                      {upload.doc_id ? (
                        <Link
                          to={`/_edit/${upload.doc_id}`}
                          className="btn btn-ghost btn-xs gap-1"
                          title={`Edit document`}
                        >
                          <FileTextIcon className="h-3 w-3" />
                          <span className="max-w-20 truncate">
                            {documents.find((d) => d.id === upload.doc_id)?.title ||
                              `#${upload.doc_id}`}
                          </span>
                        </Link>
                      ) : (
                        <span className="text-base-content/50 text-xs">None</span>
                      )}
                    </td>
                    <td>
                      {upload.public ? (
                        <span className="badge badge-primary">Public</span>
                      ) : (
                        <span className="badge badge-secondary">Private</span>
                      )}
                    </td>
                    <td className="text-right">{friendlySize(upload.size)}</td>
                    <td className="text-center">
                      <a
                        href={`/api/uploads/${upload.id}/download/${upload.filename}?download=false`}
                        className="btn btn-primary btn-square btn-sm"
                        target="_blank"
                        title="View"
                      >
                        <EyeIcon />
                      </a>
                      <a
                        href={`/api/uploads/${upload.id}/download/${upload.filename}`}
                        className="btn btn-primary btn-square btn-sm ml-2"
                        title="Download"
                      >
                        <DownloadIcon />
                      </a>
                      <button
                        className="btn btn-secondary btn-sm btn-square ml-2"
                        title="Edit"
                        onClick={() => {
                          setEditingUpload(upload)
                          setNewFilename(upload.filename)
                          setNewPublic(upload.public)
                          setNewDocId(upload.doc_id ? String(upload.doc_id) : '')
                          const dialog = document.getElementById(
                            'edit-upload-dialog'
                          ) as HTMLDialogElement | null
                          if (dialog) {
                            dialog.showModal()
                          }
                        }}
                      >
                        <EditIcon />
                      </button>
                      <button
                        className="btn btn-error btn-square btn-sm ml-2"
                        title="Delete"
                        onClick={async () => {
                          if (
                            !window.confirm(
                              'Are you sure you want to delete this upload? This action cannot be undone.'
                            )
                          ) {
                            return
                          }
                          try {
                            await axios.delete(`/api/uploads/${upload.id}`)
                            fetchUploads(pagination)
                          } catch (error) {
                            console.error('Error deleting upload:', error)
                          }
                        }}
                      >
                        <TrashIcon />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <Pagination params={pagination} setParams={setPagination} total={uploads.total} />
      </div>
      <dialog id="new-upload-dialog" className="modal">
        <form className="modal-box" onSubmit={uploadFile} data-testid="new-upload-form">
          <h3 className="mb-4 text-lg font-bold">Upload a file</h3>
          <fieldset className="fieldset w-full">
            <label htmlFor="upload-file-file" className="label">
              File
            </label>
            <input
              id="upload-file-file"
              name="file"
              type="file"
              className="file-input file-input-secondary w-full"
              accept="*"
              required
              onChange={(e) => {
                const fileInput = e.target as HTMLInputElement
                if (fileInput.files && fileInput.files.length > 0) {
                  setNewFilename(fileInput.files[0].name)
                }
              }}
            />
            <label htmlFor="upload-file-filename" className="label">
              Filename
            </label>
            <input
              id="upload-file-filename"
              type="text"
              className="input w-full"
              placeholder="Enter filename"
              required
              value={newFilename}
              onChange={(e) => setNewFilename(e.target.value)}
            />
            <label htmlFor="upload-file-public" className="label">
              <input
                id="upload-file-public"
                type="checkbox"
                className="toggle toggle-primary"
                checked={newPublic}
                onChange={(e) => setNewPublic(e.target.checked)}
              />
              Public
            </label>
          </fieldset>
          {uploadError && (
            <div className="alert alert-error mt-4">
              <span>{uploadError}</span>
            </div>
          )}
          <div className="modal-action">
            <button className="btn btn-primary w-20" type="submit" disabled={saving}>
              {saving ? <span className="loading loading-spinner loading-sm"></span> : 'Upload'}
            </button>
            <button
              className="btn"
              type="reset"
              onClick={() => {
                const dialog = document.getElementById(
                  'new-upload-dialog'
                ) as HTMLDialogElement | null
                if (dialog) {
                  dialog.close()
                }
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      </dialog>
      <dialog id="edit-upload-dialog" className="modal">
        <form className="modal-box" onSubmit={saveUpload}>
          <h3 className="mb-4 text-lg font-bold">Edit Upload</h3>
          <fieldset className="fieldset w-full">
            <label htmlFor="edit-upload-filename" className="label">
              Filename
            </label>
            <input
              id="edit-upload-filename"
              type="text"
              className="input w-full"
              placeholder="Enter new filename"
              value={newFilename}
              onChange={(e) => setNewFilename(e.target.value)}
            />
            <label htmlFor="edit-upload-doc-id" className="label">
              Document
            </label>
            <select
              id="edit-upload-doc-id"
              className="select w-full"
              value={newDocId}
              onChange={(e) => {
                const docId = e.target.value
                setNewDocId(docId)
                if (docId) {
                  const selectedDoc = documents.find((d) => String(d.id) === docId)
                  if (selectedDoc?.public !== undefined) {
                    setNewPublic(selectedDoc.public)
                  }
                }
              }}
            >
              <option value="">None (not attached to any document)</option>
              {documents.map((doc) => (
                <option key={doc.id} value={String(doc.id)}>
                  {doc.title}
                </option>
              ))}
            </select>
            <label htmlFor="edit-upload-public" className="label">
              <input
                id="edit-upload-public"
                type="checkbox"
                className="toggle toggle-primary"
                checked={newPublic}
                onChange={(e) => setNewPublic(e.target.checked)}
                disabled={newDocId !== ''}
              />
              Public
              {newDocId !== '' && (
                <span className="text-base-content/60 ml-2 text-xs">
                  (inherited from document)
                </span>
              )}
            </label>
          </fieldset>
          {uploadError && (
            <div className="alert alert-error mt-4">
              <span>{uploadError}</span>
            </div>
          )}
          <div className="modal-action">
            <button className="btn btn-primary w-20" type="submit" disabled={saving}>
              {saving ? <span className="loading loading-spinner loading-sm"></span> : 'Save'}
            </button>
            <button
              className="btn"
              type="reset"
              onClick={() => {
                const dialog = document.getElementById(
                  'edit-upload-dialog'
                ) as HTMLDialogElement | null
                if (dialog) {
                  dialog.close()
                }
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      </dialog>
    </div>
  )
}
