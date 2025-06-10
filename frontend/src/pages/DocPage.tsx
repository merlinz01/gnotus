import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import axios from '../axios'
import { LoaderPinwheelIcon, PencilIcon } from 'lucide-react'
import useUser from '../stores/user'
import type Doc from '../types/doc'
import '../assets/content.css'
import DomPurify from 'dompurify'
import useConfig from '../stores/config'
import Role from '../types/role'

export default function DocPage() {
  const [doc, setDoc] = useState<Doc | null>(null)
  const [loading, setLoading] = useState(false)
  const user = useUser((state) => state.user)
  const storagePrefix = useUser((state) => state.storagePrefix)
  const [error, setError] = useState<string | null>(null)
  const location = useLocation()
  const config = useConfig((state) => state.config)
  const storageKey = `${storagePrefix}doc:${location.pathname.slice(1)}`

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
        return
      }
      setDoc(response.data)
      localStorage.setItem(
        storageKey,
        JSON.stringify({ data: response.data, timestamp: Date.now() })
      )
    } catch (error) {
      console.error('Error fetching document:', error)
      setError('Failed to load document. Please try again later.')
    } finally {
      setLoading(false)
    }
  }, [location.pathname, storageKey])

  useEffect(() => {
    if (doc?.urlpath === location.pathname.slice(1)) {
      return
    }
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
        element.scrollIntoView({ behavior: 'smooth' })
      } else {
        console.warn(`Element with ID ${hash.slice(1)} not found.`)
      }
    }
  }, [location.hash, doc])

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <LoaderPinwheelIcon className="text-primary animate-spin" role="status" />
      </div>
    )
  }
  return (
    <>
      {error && <div className="alert alert-error m-4">{error}</div>}
      {doc && (
        <div className="flex h-full items-start justify-center">
          <div className="mx-0 flex min-h-full max-w-200 grow flex-col p-4 sm:mx-2 md:mx-4 lg:mx-8">
            <nav className="breadcrumbs text-sm" aria-label="Breadcrumbs">
              <ul className="flex-wrap">
                <li>
                  <Link to="/">Home</Link>
                </li>
                {doc.parents
                  ?.map((parent) => (
                    <li key={parent.id}>
                      <Link to={`/${parent.urlpath}`}>{parent.title}</Link>
                    </li>
                  ))
                  .reverse()}
                <li>{doc.title}</li>
              </ul>
            </nav>
            <h1 className="text-primary my-2 flex flex-wrap items-center text-3xl font-bold">
              {doc.title}
              {user && (
                <>
                  {user.role !== Role.VIEWER && (
                    <Link to={`/_edit/${doc.id}`} className="ml-2" title="Edit document">
                      <PencilIcon className="h-5 w-5" />
                    </Link>
                  )}
                  {doc.public ? (
                    <span className="badge-primary badge badge-lg ml-auto text-sm">Public</span>
                  ) : (
                    <span className="badge-accent badge badge-lg ml-auto text-sm">Private</span>
                  )}
                </>
              )}
            </h1>
            {doc.children.length > 0 && (
              <nav className="mx-4" aria-label="Contents">
                <h3 className="text-lg">Contents</h3>
                <ul className="text-primary list-disc pl-6 font-semibold">
                  {doc.children.map((child) => (
                    <li key={child.id}>
                      <Link to={`/${child.urlpath}`}>{child.title}</Link>
                    </li>
                  ))}
                </ul>
              </nav>
            )}
            <div className="gnotus-content">
              <div
                dangerouslySetInnerHTML={{
                  __html: DomPurify.sanitize(doc?.html || ''),
                }}
              />
            </div>
            <div className="grow"></div>
            <ul className="list-none text-sm text-gray-600">
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
          <aside className="border-base-300 hidden w-50 shrink-0 border-l p-4 lg:block">
            <h2 className="text-md text-secondary mb-2 font-semibold">In this page</h2>
            <ul className="list-none pl-4 text-gray-500">
              {doc.metadata.subtitles.map((heading) => (
                <li key={heading.hash}>
                  <Link to={`#${heading.hash}`}>{heading.title}</Link>
                </li>
              ))}
            </ul>
          </aside>
        </div>
      )}
    </>
  )
}
