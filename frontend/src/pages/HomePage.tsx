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
import '../assets/content.css'

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
      <div className="flex h-full items-center justify-center">
        <LoaderPinwheelIcon className="text-primary animate-spin" role="status" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center">
        <span className="text-error text-center">{error}</span>
      </div>
    )
  }

  return (
    <div className="flex h-full grow flex-col items-center justify-center overflow-y-auto p-4">
      {doc?.html ? (
        <div className="gnotus-content gnotus-home-content max-w-200 text-center">
          <div
            onClick={handleLinkClicks}
            dangerouslySetInnerHTML={{
              __html: DomPurify.sanitize(doc.html),
            }}
          />
        </div>
      ) : (
        <h1 className="text-center text-4xl font-bold">{config.site_name}</h1>
      )}
      {outline && outline.length > 0 && (
        <div className="mt-4 flex w-full justify-center">
          <ul className="text-primary flex max-w-120 grow flex-col font-semibold">
            {outline.map((item) => (
              <li
                key={item.id}
                className="border-base-300 bg-base-200 hover:bg-base-300 m-1 rounded-lg border"
              >
                <Link
                  to={item.urlpath}
                  className="flex items-center overflow-hidden px-4 py-2 text-wrap"
                >
                  {item.title}
                  <ChevronRightIcon className="ml-auto" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      {user && user.role !== Role.VIEWER && doc && (
        <Link to={`/_edit/${doc.id}`} className="btn btn-ghost mt-4" title="Edit home page">
          <PencilIcon className="h-4 w-4" />
          Edit
        </Link>
      )}
    </div>
  )
}
