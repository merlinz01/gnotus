import { useState, useEffect } from 'react'
import axios, { getErrorMessage } from '../axios'
import { CopyIcon, CheckIcon, TrashIcon, LoaderPinwheelIcon, LinkIcon } from 'lucide-react'

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
      <div className="modal-box max-w-lg">
        <h3 className="mb-4 text-lg font-bold">Share "{docTitle}"</h3>

        {error && <div className="alert alert-error mb-4 text-sm">{error}</div>}

        <div className="mb-4">
          <h4 className="mb-2 font-semibold">Create New Link</h4>
          <div className="flex items-center gap-2">
            <select
              className="select select-bordered select-sm flex-1"
              value={expiration}
              onChange={(e) => setExpiration(e.target.value as Expiration)}
            >
              <option value="7days">Expires in 7 days</option>
              <option value="30days">Expires in 30 days</option>
              <option value="never">Never expires</option>
            </select>
            <button
              className="btn btn-primary btn-sm"
              onClick={createLink}
              disabled={creating}
            >
              {creating ? (
                <LoaderPinwheelIcon className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <LinkIcon className="h-4 w-4" />
                  Create
                </>
              )}
            </button>
          </div>
        </div>

        <div className="divider"></div>

        <div>
          <h4 className="mb-2 font-semibold">Existing Links</h4>
          {loading ? (
            <div className="flex justify-center py-4">
              <LoaderPinwheelIcon className="text-primary h-6 w-6 animate-spin" />
            </div>
          ) : links.length === 0 ? (
            <p className="py-4 text-center text-sm text-gray-500">
              No share links yet. Create one above.
            </p>
          ) : (
            <ul className="space-y-2">
              {links.map((link) => (
                <li
                  key={link.id}
                  className={`bg-base-200 flex items-center justify-between rounded-lg p-2 ${
                    isExpired(link.expires_at) ? 'opacity-50' : ''
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-mono text-xs">
                      {link.token.slice(0, 16)}...
                    </div>
                    <div className="mt-1 flex gap-2 text-xs text-gray-500">
                      <span
                        className={isExpired(link.expires_at) ? 'text-error' : ''}
                      >
                        {isExpired(link.expires_at) ? 'Expired' : `Expires: ${formatExpiration(link.expires_at)}`}
                      </span>
                      <span>&middot;</span>
                      <span>{link.access_count} views</span>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button
                      className="btn btn-ghost btn-xs"
                      onClick={() => copyLink(link)}
                      disabled={isExpired(link.expires_at)}
                      title="Copy link"
                    >
                      {copiedId === link.id ? (
                        <CheckIcon className="text-success h-4 w-4" />
                      ) : (
                        <CopyIcon className="h-4 w-4" />
                      )}
                    </button>
                    <button
                      className="btn btn-ghost btn-xs text-error"
                      onClick={() => deleteLink(link.id)}
                      disabled={deletingId === link.id}
                      title="Delete link"
                    >
                      {deletingId === link.id ? (
                        <LoaderPinwheelIcon className="h-4 w-4 animate-spin" />
                      ) : (
                        <TrashIcon className="h-4 w-4" />
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
