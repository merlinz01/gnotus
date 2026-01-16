import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import axios from '../axios'
import { LoaderPinwheelIcon, PencilIcon, Share2Icon, CheckIcon, FilePlusIcon } from 'lucide-react'
import useUser from '../stores/user'
import type Doc from '../types/doc'
import '../assets/content.css'
import DomPurify from 'dompurify'
import useConfig from '../stores/config'
import Role from '../types/role'
import ShareDialog from '../components/ShareDialog'
import useContentLinkHandler from '../hooks/useContentLinkHandler'

export default function DocPage() {
  const [doc, setDoc] = useState<Doc | null>(null)
  const [loading, setLoading] = useState(false)
  const user = useUser((state) => state.user)
  const storagePrefix = useUser((state) => state.storagePrefix)
  const [error, setError] = useState<string | null>(null)
  const [linkCopied, setLinkCopied] = useState(false)
  const location = useLocation()
  const config = useConfig((state) => state.config)
  const storageKey = `${storagePrefix}doc:${location.pathname.slice(1)}`
  const handleLinkClicks = useContentLinkHandler()

  // Update document title based on the current document
  useEffect(() => {
    if (error) {
      document.title = `Error - ${config.site_name}`
    } else if (doc) {
      document.title = `${doc.title} - ${config.site_name}`
    } else {
      document.title = config.site_name
    }
  }, [doc, error, config])

  const fetchDocFromStorage = useCallback(() => {
    const storedDocText = localStorage.getItem(storageKey)
    if (storedDocText) {
      const storedDoc = JSON.parse(storedDocText)
      const now = Date.now()
      if (now - storedDoc.timestamp > 1000 * 60 * 60 * 24) {
        localStorage.removeItem(storageKey)
      } else {
        return storedDoc.data
      }
    }
    return null
  }, [storageKey])

  const fetchDocIfChanged = useCallback(
    async (doc: Doc) => {
      try {
        const response = await axios.get(`/api/docs/by_path`, {
          params: {
            path: location.pathname.slice(1),
            timestamp: doc.updated_at,
          },
          validateStatus(status) {
            return status === 200 || status == 304 || status === 404
          },
        })
        if (response.status === 404) {
          setDoc(null)
          setError(
            'The document you are looking for does not exist, or you do not have permission to view it.'
          )
          localStorage.removeItem(storageKey)
          return
        } else if (response.status === 200) {
          setDoc(response.data)
          localStorage.setItem(
            storageKey,
            JSON.stringify({ data: response.data, timestamp: Date.now() })
          )
        }
      } catch (error) {
        console.error('Error fetching document:', error)
        setError('Failed to load document. Please try again later.')
      }
    },
    [location.pathname, storageKey]
  )

  const fetchDoc = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await axios.get(`/api/docs/by_path`, {
        params: { path: location.pathname.slice(1) },
        validateStatus(status) {
          return status === 200 || status === 404
        },
      })
      if (response.status === 404) {
        setDoc(null)
        setError(
          'The document you are looking for does not exist, or you do not have permission to view it.'
        )
        localStorage.removeItem(storageKey)
        // Set meta robots to noindex to prevent search engines from indexing non-existent pages
        const metaRobots = document.createElement('meta')
        metaRobots.name = 'robots'
        metaRobots.content = 'noindex'
        document.head.appendChild(metaRobots)
        document.title = 'Not Found'
        return
      }
      const existingMetaRobots = document.querySelector('meta[name="robots"]')
      if (existingMetaRobots) {
        existingMetaRobots.remove()
      }
      setDoc(response.data)
      localStorage.setItem(
        storageKey,
        JSON.stringify({ data: response.data, timestamp: Date.now() })
      )
    } catch (error) {
      console.error('Error fetching document:', error)
      setDoc(null)
      setError('Failed to load document. Please try again later.')
    } finally {
      setLoading(false)
    }
  }, [location.pathname, storageKey])

  useEffect(() => {
    if (doc?.urlpath === location.pathname) {
      return
    }
    setError(null)
    const storedDoc = fetchDocFromStorage()
    if (storedDoc) {
      setDoc(storedDoc)
      fetchDocIfChanged(storedDoc)
      return
    } else {
      fetchDoc()
    }
  }, [doc?.urlpath, location.pathname, fetchDoc, fetchDocIfChanged, fetchDocFromStorage])

  // Scroll to the element with the ID from the URL hash
  useEffect(() => {
    const hash = location.hash
    if (hash && doc) {
      const element = document.getElementById(hash.slice(1))
      if (element) {
        const smooth = !(
          window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
        )
        element.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' })
      } else {
        console.warn(`Element with ID ${hash.slice(1)} not found.`)
      }
    }
  }, [location.hash, doc])

  const handleShare = async () => {
    // If user is logged in with edit permissions, show the share dialog
    if (user && user.role !== Role.VIEWER) {
      const dialog = document.getElementById('share_dialog') as HTMLDialogElement | null
      if (dialog) {
        dialog.showModal()
        return
      }
    }

    // For guests/viewers, just copy or share the current URL
    const shareUrl = window.location.href

    // Try Web Share API first (for mobile devices)
    if (navigator.share && doc) {
      try {
        await navigator.share({
          title: doc.title,
          text: `Check out this documentation: ${doc.title}`,
          url: shareUrl,
        })
        return
      } catch (err) {
        // User cancelled share or API not supported, fall through to clipboard
        if ((err as Error).name !== 'AbortError') {
          console.warn('Share API failed:', err)
        }
      }
    }

    // Fallback to clipboard
    try {
      await navigator.clipboard.writeText(shareUrl)
      setLinkCopied(true)
      setTimeout(() => setLinkCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy link:', err)
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <LoaderPinwheelIcon className="text-primary animate-spin" role="status" />
      </div>
    )
  }
  return (
    <>
      {error && <div className="alert alert-error mt-6 max-w-100 self-center">{error}</div>}
      {doc && (
        <div className="flex grow items-start overflow-hidden">
          <div
            className="flex h-full min-h-full grow flex-col overflow-y-auto"
            style={{ scrollbarGutter: 'stable' }}
          >
            <div className="mx-auto flex w-full max-w-200 flex-col px-4 pt-2 pb-8 sm:px-4 md:px-8 lg:px-12 print:px-4">
              <nav className="breadcrumbs shrink-0 text-sm" aria-label="Breadcrumbs">
                <ul className="flex-wrap">
                  {doc.parents
                    ?.map((parent) => (
                      <li key={parent.id}>
                        <Link to={parent.urlpath}>{parent.title}</Link>
                      </li>
                    ))
                    .reverse()}
                  <li>{doc.title}</li>
                </ul>
              </nav>
              <h1 className="text-primary my-2 flex flex-wrap items-center text-3xl font-bold">
                <div className="me-auto">{doc.title}</div>
                {user && (
                  <>
                    {doc.public ? (
                      <span className="badge-primary badge badge-lg text-sm">Public</span>
                    ) : (
                      <span className="badge-accent badge badge-lg text-sm">Private</span>
                    )}
                  </>
                )}
                {user && user.role !== Role.VIEWER && (
                  <>
                    <Link to={`/_new?parent=${doc.id}`} className="ml-2" title="Create child document">
                      <FilePlusIcon className="h-5 w-5" />
                    </Link>
                    <Link to={`/_edit/${doc.id}`} className="ml-2" title="Edit document">
                      <PencilIcon className="h-5 w-5" />
                    </Link>
                  </>
                )}
                <div
                  className={linkCopied ? 'tooltip tooltip-left tooltip-open' : ''}
                  data-tip={linkCopied ? 'Link copied!' : undefined}
                >
                  <button
                    onClick={handleShare}
                    className="ml-2 cursor-pointer"
                    title={!linkCopied ? 'Copy link to clipboard' : undefined}
                    aria-label={linkCopied ? 'Link copied!' : 'Copy link to clipboard'}
                  >
                    {linkCopied ? (
                      <CheckIcon className="text-success h-5 w-5" />
                    ) : (
                      <Share2Icon className="h-5 w-5" />
                    )}
                  </button>
                </div>
              </h1>
              {doc.children.length > 0 && (
                <nav className="mx-4" aria-label="Contents">
                  <h2 className="text-lg">Contents</h2>
                  <ul className="text-primary list-disc pl-6 font-semibold">
                    {doc.children.map((child) => (
                      <li key={child.id}>
                        <Link to={child.urlpath}>{child.title}</Link>
                      </li>
                    ))}
                  </ul>
                </nav>
              )}
              <div className="gnotus-content">
                <div
                  onClick={handleLinkClicks}
                  dangerouslySetInnerHTML={{
                    __html: DomPurify.sanitize(doc?.html || ''),
                  }}
                />
              </div>
              <div className="grow"></div>
              <ul className="mt-2 list-none text-sm text-gray-600">
                <li>
                  <span>
                    Last updated:{' '}
                    {new Date(doc.updated_at).toLocaleDateString(undefined, {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </span>
                </li>
                <li>
                  <span>
                    Created:{' '}
                    {new Date(doc.created_at).toLocaleDateString(undefined, {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </span>
                </li>
              </ul>
            </div>
          </div>
          <aside
            className="border-base-300 hidden max-h-full w-50 shrink-0 overflow-y-auto border-l py-4 ps-2 lg:block print:hidden"
            style={{ scrollbarGutter: 'stable' }}
          >
            <h2 className="text-md text-secondary mb-2 font-semibold">In this page</h2>
            <ul className="list-none pl-3 text-sm text-gray-500">
              {doc.metadata.subtitles.map((heading) => (
                <li key={heading.hash}>
                  <Link to={`#${heading.hash}`}>{heading.title}</Link>
                </li>
              ))}
            </ul>
          </aside>
        </div>
      )}
      {doc && user && user.role !== Role.VIEWER && (
        <ShareDialog docId={doc.id} docTitle={doc.title} />
      )}
    </>
  )
}
