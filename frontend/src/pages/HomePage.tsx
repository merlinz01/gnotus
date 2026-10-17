import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import useConfig from '../stores/config'
import useUser from '../stores/user'

import axios from '../axios'
import { ChevronRightIcon, LoaderPinwheelIcon, PencilIcon } from 'lucide-react'
import type Doc from '../types/doc'
import DomPurify from 'dompurify'
import Role from '../types/role'
import useContentLinkHandler from '../hooks/useContentLinkHandler'
import './HomePage.css'

interface ToplevelDocRef {
  id: string
  title: string
  urlpath: string
}

export default function HomePage() {
  const config = useConfig((state) => state.config)
  const user = useUser((state) => state.user)
  const storagePrefix = useUser((state) => state.storagePrefix)
  const [doc, setDoc] = useState<Doc | null>(null)
  const [outline, setOutline] = useState<ToplevelDocRef[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const handleLinkClicks = useContentLinkHandler()

  useEffect(() => {
    document.title = doc?.title ? `${doc.title} - ${config.site_name}` : config.site_name
  }, [config, doc])

  const fetchOutline = useCallback(async () => {
    try {
      const response = await axios.get('/api/docs/outline?depth=1')
      setOutline(response.data.children)
      localStorage.setItem(
        `${storagePrefix}outline-toplevel`,
        JSON.stringify({
          data: response.data.children,
          timestamp: Date.now(),
        })
      )
    } catch (error) {
      console.error('Failed to fetch outline:', error)
      throw error
    }
  }, [storagePrefix])

  const fetchData = useCallback(async () => {
    setError(null)
    setLoading(true)
    try {
      // Check localStorage for cached outline
      const storedOutlineText = localStorage.getItem(`${storagePrefix}outline-toplevel`)
      let needsOutlineFetch = true
      if (storedOutlineText) {
        const storedOutline = JSON.parse(storedOutlineText)
        const now = Date.now()
        if (now - storedOutline.timestamp < 1000 * 60 * 60 * 24) {
          setOutline(storedOutline.data)
          needsOutlineFetch = false
        } else {
          localStorage.removeItem(`${storagePrefix}outline-toplevel`)
        }
      }

      // Fetch home page doc (always) and outline (if needed)
      const docPromise = axios.get('/api/docs/by_path', {
        params: { path: '' },
        validateStatus: (status) => status === 200 || status === 404,
      })

      if (needsOutlineFetch) {
        const [docResponse] = await Promise.all([docPromise, fetchOutline()])
        if (docResponse.status === 200) {
          setDoc(docResponse.data)
        }
      } else {
        const docResponse = await docPromise
        if (docResponse.status === 200) {
          setDoc(docResponse.data)
        }
      }
    } catch (error) {
      console.error('Failed to fetch home page:', error)
      setError('An error occurred while loading the home page.')
    } finally {
      setLoading(false)
    }
  }, [storagePrefix, fetchOutline])

  useEffect(() => {
    fetchData()
  }, [user, fetchData])

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
        <span className="page-error">{error}</span>
      </div>
    )
  }

  return (
    <div className="home-page">
      {doc?.html ? (
        <div className="gnotus-content gnotus-home-content home-intro">
          <div
            onClick={handleLinkClicks}
            dangerouslySetInnerHTML={{
              __html: DomPurify.sanitize(doc.html),
            }}
          />
        </div>
      ) : (
        <h1 className="home-title">{config.site_name}</h1>
      )}
      {outline && outline.length > 0 && (
        <div className="home-sections">
          <ul className="home-section-list">
            {outline.map((item) => (
              <li key={item.id} className="home-section">
                <Link to={item.urlpath} className="home-section-link">
                  {item.title}
                  <ChevronRightIcon className="home-section-chevron" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      {user && user.role !== Role.VIEWER && doc && (
        <Link to={`/_edit/${doc.id}`} className="btn btn-ghost home-edit" title="Edit home page">
          <PencilIcon />
          Edit
        </Link>
      )}
    </div>
  )
}
