import { useEffect, useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import axios from '../axios'
import { LoaderPinwheelIcon } from 'lucide-react'
import type Doc from '../types/doc'
import '../assets/content.css'
import DomPurify from 'dompurify'
import useConfig from '../stores/config'

export default function SharedDocPage() {
  const { token } = useParams<{ token: string }>()
  const [doc, setDoc] = useState<Doc | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const config = useConfig((state) => state.config)
  const navigate = useNavigate()

  useEffect(() => {
    if (doc) {
      document.title = `${doc.title} - ${config.site_name}`
    } else if (error) {
      document.title = `Error - ${config.site_name}`
    } else {
      document.title = config.site_name
    }
  }, [doc, error, config])

  useEffect(() => {
    const fetchDoc = async () => {
      if (!token) {
        setError('Invalid share link')
        setLoading(false)
        return
      }

      try {
        const response = await axios.get(`/api/sharelinks/access/${token}`, {
          validateStatus(status) {
            return status === 200 || status === 404 || status === 410
          },
        })

        if (response.status === 404) {
          setError('This share link is invalid or has been revoked.')
        } else if (response.status === 410) {
          setError('This share link has expired.')
        } else {
          setDoc(response.data)
        }
      } catch (err) {
        console.error('Error fetching shared document:', err)
        setError('Failed to load document. Please try again later.')
      } finally {
        setLoading(false)
      }
    }

    fetchDoc()
  }, [token])

  function handleLinkClicks(event: React.MouseEvent<HTMLDivElement>) {
    const target = event.target as HTMLAnchorElement
    if (target.tagName === 'A' && target.href) {
      if (target.href.startsWith(window.location.origin)) {
        event.preventDefault()
        const path = target.pathname + target.search + target.hash
        navigate(path)
      }
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <LoaderPinwheelIcon className="text-primary animate-spin" role="status" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <div className="alert alert-error max-w-md">{error}</div>
        <Link to="/" className="btn btn-primary">
          Go to Home
        </Link>
      </div>
    )
  }

  if (!doc) {
    return null
  }

  return (
    <div className="flex grow items-start overflow-hidden">
      <div
        className="flex h-full min-h-full grow flex-col overflow-y-auto"
        style={{ scrollbarGutter: 'stable' }}
      >
        <div className="mx-auto flex w-full max-w-175 flex-col px-4 pt-2 pb-8 sm:px-4 md:px-8 lg:px-12 print:px-4">
          <div className="mb-2">
            <span className="badge badge-info badge-sm">Shared via link</span>
          </div>
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
          <h1 className="text-primary my-2 text-3xl font-bold">{doc.title}</h1>
          {doc.children && doc.children.length > 0 && (
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
          </ul>
        </div>
      </div>
      <aside
        className="border-base-300 hidden max-h-full w-50 shrink-0 overflow-y-auto border-l py-4 ps-2 lg:block print:hidden"
        style={{ scrollbarGutter: 'stable' }}
      >
        <h2 className="text-md text-secondary mb-2 font-semibold">In this page</h2>
        <ul className="list-none pl-3 text-sm text-gray-500">
          {doc.metadata?.subtitles?.map((heading) => (
            <li key={heading.hash}>
              <a href={`#${heading.hash}`}>{heading.title}</a>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  )
}
