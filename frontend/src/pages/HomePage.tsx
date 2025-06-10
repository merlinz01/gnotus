import { useCallback, useEffect, useState } from 'react'
import useConfig from '../stores/config'
import useUser from '../stores/user'

import axios from '../axios'
import { Link } from 'react-router-dom'
import { ChevronRightIcon, LoaderPinwheelIcon } from 'lucide-react'

interface ToplevelDocRef {
  id: string
  title: string
  urlpath: string
}

export default function HomePage() {
  const config = useConfig((state) => state.config)
  const user = useUser((state) => state.user)
  const storagePrefix = useUser((state) => state.storagePrefix)
  const [outline, setOutline] = useState<ToplevelDocRef[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    document.title = `Home - ${config.site_name}`
  }, [config])
  const fetchOutline = useCallback(async () => {
    setError(null)
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
      setError('An error occurred while fetching the outline.')
      setOutline(null)
    }
  }, [storagePrefix])
  useEffect(() => {
    const storedOutlineText = localStorage.getItem(`${storagePrefix}outline-toplevel`)
    if (storedOutlineText) {
      const storedOutline = JSON.parse(storedOutlineText)
      const now = Date.now()
      if (now - storedOutline.timestamp < 1000 * 60 * 60 * 24) {
        setOutline(storedOutline.data)
        return
      } else {
        localStorage.removeItem(`${storagePrefix}outline-toplevel`)
      }
    }
    fetchOutline()
  }, [user, storagePrefix, fetchOutline])

  return (
    <div className="flex h-full flex-col items-center justify-center">
      <h1 className="text-center text-4xl font-bold">Welcome to {config.site_name}</h1>
      <p className="my-4 text-center text-lg">{config.site_description}</p>
      {error ? (
        <span className="text-error text-center">{error}</span>
      ) : outline ? (
        <div className="flex w-full justify-center">
          <ul className="text-primary flex max-w-120 grow flex-col font-semibold">
            {outline.map((doc) => (
              <li
                key={doc.id}
                className="border-base-300 bg-base-200 hover:bg-base-300 m-1 rounded-lg border"
              >
                <Link
                  to={`/${doc.urlpath}`}
                  className="flex items-center overflow-hidden px-4 py-2 text-wrap"
                >
                  {doc.title}
                  <ChevronRightIcon className="ml-auto" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <LoaderPinwheelIcon className="text-primary animate-spin" role="status" />
      )}
    </div>
  )
}
