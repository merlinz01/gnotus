import { Link, useNavigate, useParams } from 'react-router-dom'
import axios from '../axios'
import { useEffect, useState } from 'react'
import type Doc from '../types/doc'
import useConfig from '../stores/config'
import { XIcon } from 'lucide-react'
import useUser from '../stores/user'
import { diffWordsWithSpace } from 'diff'
import DOMPurify from 'dompurify'
import { DEFAULT_PAGE_SIZE, type PaginationParams } from '../types/pagination'
import Pagination from '../components/Pagination'
import TableSkeleton from '../components/TableSkeleton'

interface Revision {
  id: string
  doc_id: number
  created_at: string
  created_by_id: number | null
  created_by_username: string | null
  markdown: string
  html: string
}

export default function RevisionsPage() {
  const { docId } = useParams()
  const [doc, setDoc] = useState<Doc | null>(null)
  const [revisions, setRevisions] = useState<Revision[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const config = useConfig((state) => state.config)
  const [openRevision, setOpenRevision] = useState<Revision | null>(null)
  const [prevRevision, setPrevRevision] = useState<Revision | null>(null)
  const navigate = useNavigate()
  const userLoaded = useUser((state) => state.loaded)
  const user = useUser((state) => state.user)
  const [pagination, setPagination] = useState<PaginationParams>({
    page: 1,
    size: DEFAULT_PAGE_SIZE,
  })
  let paginatedRevisions = revisions
  if (pagination.size > 0) {
    const start = (pagination.page - 1) * pagination.size
    const end = start + pagination.size
    paginatedRevisions = revisions.slice(start, end)
  }
  useEffect(() => {
    document.title = `Revisions - ${doc?.title + ' - ' || ''}${config.site_name}`
  }, [doc, config])
  useEffect(() => {
    if (!userLoaded) {
      return
    }
    if (!user) {
      navigate('/login')
      return
    }
    const fetchDocAndRevisions = async () => {
      setLoading(true)
      setError(null)
      try {
        const response = await axios.get(`/api/docs/${docId}`)
        setDoc(response.data)
      } catch (error) {
        console.error('Error fetching document:', error)
        setError('Failed to load document. Please try again later.')
        setLoading(false)
        return
      }
      try {
        const response = await axios.get(`/api/docs/${docId}/revisions`)
        setRevisions(response.data.items)
      } catch (error) {
        console.error('Error fetching revisions:', error)
        setError('Failed to load revisions. Please try again later.')
      } finally {
        setLoading(false)
      }
    }
    fetchDocAndRevisions()
  }, [docId, user, userLoaded, navigate])

  return (
    <div className="card bg-base-200 m-4 shadow-lg">
      <div className="card-body">
        <h1 className="card-title text-2xl">Document Revisions</h1>
        {error && (
          <div className="alert alert-error shadow-lg">
            <span>{error}</span>
          </div>
        )}{' '}
        {doc && (
          <p>
            For
            <Link to={doc.urlpath} className="link link-primary ml-1">
              <strong>{doc.title}</strong>
            </Link>
            .
          </p>
        )}
        <table className="mt-4 table w-full">
          <thead>
            <tr>
              <th>Created At</th>
              <th>Created By</th>
              <th className="w-35 text-center">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableSkeleton width={3} height={Math.max(0, pagination.size)} />
            ) : (
              paginatedRevisions.map((revision, index) => (
                <tr key={revision.id}>
                  <td>{new Date(revision.created_at).toLocaleString()}</td>
                  <td>{revision.created_by_username || 'Unknown User'}</td>
                  <td>
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => {
                        setOpenRevision(revision)
                        setPrevRevision(revisions[index + 1] || null)
                        const modal = document.getElementById(
                          'revision-modal'
                        ) as HTMLDialogElement | null
                        if (modal) {
                          modal.showModal()
                        }
                      }}
                    >
                      View Revision
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <Pagination params={pagination} setParams={setPagination} total={revisions.length} />
      </div>
      {doc && <RevisionDialog revision={openRevision} doc={doc} prevRevision={prevRevision} />}
    </div>
  )
}

function DiffViewer({
  oldText,
  newText,
  className = '',
}: {
  oldText: string
  newText: string
  className?: string
}) {
  return (
    <div className={`whitespace-pre-wrap ${className}`}>
      {diffWordsWithSpace(oldText, newText).map((part, index) => {
        const className = part.added ? 'bg-green-500' : part.removed ? 'bg-red-500' : ''
        return (
          <span key={index} className={className}>
            {part.value}
          </span>
        )
      })}
    </div>
  )
}

function RevisionDialog({
  doc,
  revision,
  prevRevision,
}: {
  doc: Doc | null
  revision: Revision | null
  prevRevision?: Revision | null
}) {
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const restoreRevision = async () => {
    if (!doc || !revision) {
      return
    }
    if (!window.confirm('Are you sure you want to restore this revision?')) {
      return
    }
    setLoading(true)
    setError(null)
    try {
      await axios.post(`/api/docs/${doc.id}/restore_revision`, undefined, {
        params: { revision_id: revision.id },
      })
      navigate(doc.urlpath)
    } catch (error) {
      console.error('Error restoring revision:', error)
      setError('Failed to restore revision. Please try again later.')
    } finally {
      setLoading(false)
    }
  }
  return (
    <dialog id="revision-modal" className="modal">
      <form method="dialog" className="modal-box max-w-3xl">
        <h3 className="text-lg font-bold">Revision Details</h3>
        <button
          className="btn btn-sm btn-circle btn-ghost absolute top-2 right-2"
          onClick={() => {
            const modal = document.getElementById('revision-modal') as HTMLDialogElement | null
            if (modal) {
              modal.close()
            }
          }}
        >
          <XIcon />
        </button>
        {doc && revision && (
          <>
            <p className="mt-2">
              Created{' '}
              {revision.created_by_username && (
                <>
                  by <strong>{revision.created_by_username}</strong>{' '}
                </>
              )}
              on <strong>{new Date(revision.created_at).toLocaleString()}</strong>
            </p>
            <div className="tabs tabs-border mt-2">
              <input
                type="radio"
                name="revision-tab"
                className="tab"
                aria-label="Content"
                defaultChecked
              />
              <div className="border-accent bg-base-100 tab-content h-[70vh]! w-[90vw] overflow-auto rounded-lg border p-4">
                <div
                  className="gnotus-content"
                  dangerouslySetInnerHTML={{
                    __html: DOMPurify.sanitize(revision.html),
                  }}
                ></div>
              </div>
              <input type="radio" name="revision-tab" className="tab" aria-label="Markdown Diff" />
              {prevRevision ? (
                <DiffViewer
                  newText={revision.markdown}
                  oldText={prevRevision.markdown || ''}
                  className="tab-content border-accent bg-base-200 h-[70vh]! w-[90vw] overflow-auto rounded-lg border p-4 text-xs"
                />
              ) : (
                <div className="tab-content h-[70vh]! w-[90vw] p-4">
                  This is the first revision.
                </div>
              )}
            </div>
            {error && (
              <div className="alert alert-error mt-4 shadow-lg">
                <span>{error}</span>
              </div>
            )}
          </>
        )}
        <div className="modal-action">
          <button className="btn btn-secondary" onClick={restoreRevision}>
            {loading ? <span className="loading loading-spinner loading-sm"></span> : 'Restore'}
          </button>
          <button className="btn">Close</button>
        </div>
      </form>
    </dialog>
  )
}
