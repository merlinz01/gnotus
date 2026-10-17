import { useEffect, useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import axios from '../axios'
import { LoaderPinwheelIcon } from 'lucide-react'
import type Doc from '../types/doc'
import DomPurify from 'dompurify'
import useConfig from '../stores/config'
import './DocLayout.css'

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
      <div className="page-status">
        <LoaderPinwheelIcon className="page-spinner" role="status" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="page-status">
        <div className="alert alert-error shared-doc-error">{error}</div>
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
    <div className="doc-layout">
      <div className="doc-scroll">
        <article className="doc-article doc-article-shared">
          <div className="doc-shared-notice">
            <span className="badge badge-info badge-sm">Shared via link</span>
          </div>
          <nav className="breadcrumbs doc-breadcrumbs" aria-label="Breadcrumbs">
            <ul>
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
          <h1 className="doc-title">{doc.title}</h1>
          {doc.children && doc.children.length > 0 && (
            <nav className="doc-contents" aria-label="Contents">
              <h2 className="doc-contents-heading">Contents</h2>
              <ul className="doc-contents-list">
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
          <div className="doc-spacer"></div>
          <ul className="doc-dates">
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
        </article>
      </div>
      <aside className="doc-toc">
        <h2 className="doc-toc-heading">In this page</h2>
        <ul className="doc-toc-list">
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
