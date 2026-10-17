import { useState, useEffect } from 'react'
import axios, { getErrorMessage } from '../axios'
import { CopyIcon, CheckIcon, TrashIcon, LoaderPinwheelIcon, LinkIcon } from 'lucide-react'
import './ShareDialog.css'

interface ShareLink {
  id: number
  token: string
  doc_id: number
  created_by_id: number | null
  expires_at: string | null
  last_accessed_at: string | null
  access_count: number
  created_at: string
  updated_at: string
}

interface ShareDialogProps {
  docId: number
  docTitle: string
}

type Expiration = '7days' | '30days' | 'never'

export default function ShareDialog({ docId, docTitle }: ShareDialogProps) {
  const [links, setLinks] = useState<ShareLink[]>([])
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expiration, setExpiration] = useState<Expiration>('7days')
  const [copiedId, setCopiedId] = useState<number | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  const fetchLinks = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await axios.get('/api/sharelinks/', {
        params: { doc_id: docId },
      })
      setLinks(response.data)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const dialog = document.getElementById('share_dialog') as HTMLDialogElement | null
    if (!dialog) return

    const handleOpen = () => {
      fetchLinks()
    }

    // MutationObserver to detect when dialog opens
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.attributeName === 'open' && dialog.open) {
          handleOpen()
        }
      }
    })

    observer.observe(dialog, { attributes: true })
    return () => observer.disconnect()
  }, [docId])

  const createLink = async () => {
    setCreating(true)
    setError(null)
    try {
      await axios.post('/api/sharelinks/', {
        doc_id: docId,
        expiration: expiration,
      })
      await fetchLinks()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setCreating(false)
    }
  }

  const deleteLink = async (linkId: number) => {
    setDeletingId(linkId)
    setError(null)
    try {
      await axios.delete(`/api/sharelinks/${linkId}`)
      setLinks(links.filter((l) => l.id !== linkId))
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setDeletingId(null)
    }
  }

  const copyLink = async (link: ShareLink) => {
    const url = `${window.location.origin}/_share/${link.token}`
    try {
      await navigator.clipboard.writeText(url)
      setCopiedId(link.id)
      setTimeout(() => setCopiedId(null), 2000)
    } catch (err) {
      console.error('Failed to copy link:', err)
    }
  }

  const formatExpiration = (expiresAt: string | null) => {
    if (!expiresAt) return 'Never'
    const date = new Date(expiresAt)
    const now = new Date()
    if (date < now) return 'Expired'
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  const isExpired = (expiresAt: string | null) => {
    if (!expiresAt) return false
    return new Date(expiresAt) < new Date()
  }

  const closeDialog = () => {
    const dialog = document.getElementById('share_dialog') as HTMLDialogElement | null
    if (dialog) dialog.close()
  }

  return (
    <dialog id="share_dialog" className="modal">
      <div className="modal-box share-dialog">
        <h3 className="modal-title">Share "{docTitle}"</h3>

        {error && <div className="alert alert-error share-dialog-error">{error}</div>}

        <div className="share-dialog-section">
          <h4 className="share-dialog-heading">Create New Link</h4>
          <div className="share-dialog-create">
            <select
              className="select select-sm share-dialog-expiration"
              value={expiration}
              onChange={(e) => setExpiration(e.target.value as Expiration)}
            >
              <option value="7days">Expires in 7 days</option>
              <option value="30days">Expires in 30 days</option>
              <option value="never">Never expires</option>
            </select>
            <button className="btn btn-primary btn-sm" onClick={createLink} disabled={creating}>
              {creating ? (
                <LoaderPinwheelIcon className="icon-spin" />
              ) : (
                <>
                  <LinkIcon />
                  Create
                </>
              )}
            </button>
          </div>
        </div>

        <div className="divider"></div>

        <div>
          <h4 className="share-dialog-heading">Existing Links</h4>
          {loading ? (
            <div className="share-dialog-loading">
              <LoaderPinwheelIcon className="page-spinner" />
            </div>
          ) : links.length === 0 ? (
            <p className="share-dialog-empty">No share links yet. Create one above.</p>
          ) : (
            <ul className="share-links">
              {links.map((link) => (
                <li
                  key={link.id}
                  className={`share-link ${isExpired(link.expires_at) ? 'share-link-expired' : ''}`}
                >
                  <div className="share-link-info">
                    <div className="share-link-token">{link.token.slice(0, 16)}...</div>
                    <div className="share-link-meta">
                      <span
                        className={isExpired(link.expires_at) ? 'share-link-expiry-expired' : ''}
                      >
                        {isExpired(link.expires_at)
                          ? 'Expired'
                          : `Expires: ${formatExpiration(link.expires_at)}`}
                      </span>
                      <span>&middot;</span>
                      <span>{link.access_count} views</span>
                    </div>
                  </div>
                  <div className="share-link-actions">
                    <button
                      className="btn btn-ghost btn-xs"
                      onClick={() => copyLink(link)}
                      disabled={isExpired(link.expires_at)}
                      title="Copy link"
                    >
                      {copiedId === link.id ? (
                        <CheckIcon className="share-link-copied" />
                      ) : (
                        <CopyIcon />
                      )}
                    </button>
                    <button
                      className="btn btn-ghost btn-xs share-link-delete"
                      onClick={() => deleteLink(link.id)}
                      disabled={deletingId === link.id}
                      title="Delete link"
                    >
                      {deletingId === link.id ? (
                        <LoaderPinwheelIcon className="icon-spin" />
                      ) : (
                        <TrashIcon />
                      )}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="modal-action">
          <button className="btn" onClick={closeDialog}>
            Close
          </button>
        </div>
      </div>
      <form method="dialog" className="modal-backdrop">
        <button>close</button>
      </form>
    </dialog>
  )
}
