import { SearchIcon, XIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import axios from '../axios'
import { Link } from 'react-router-dom'
import DOMPurify from 'dompurify'
import './SearchBox.css'
import useUser from '../stores/user'

export interface SearchResult {
  title: string
  urlpath: string
  text: string
  public: boolean
}

export default function SearchBox() {
  const [value, setValue] = useState('')
  const [loading, setLoading] = useState(false)
  const [show, setShow] = useState(false)
  const [results, setResults] = useState<SearchResult[]>([])
  const [error, setError] = useState<string | null>(null)
  const user = useUser((state) => state.user)

  useEffect(() => {
    setError(null)
    const query = value.trim()
    if (query.length < 3) {
      setResults([])
      setLoading(false)
      return
    }
    setLoading(true)
    const fetchResults = async () => {
      try {
        const response = await axios.post('/api/docs/search', {
          query,
        })
        setResults(response.data.results)
      } catch (error) {
        console.error('Error fetching search results:', error)
        setError('Failed to retrieve search results. Please try again later.')
        setResults([])
      } finally {
        setLoading(false)
      }
    }
    const timeoutId = setTimeout(fetchResults, 300)
    return () => clearTimeout(timeoutId)
  }, [value])
  useEffect(() => {
    const dialog = document.getElementById('doc-search-modal') as HTMLDialogElement
    if (dialog) {
      if (show) {
        dialog.showModal()
        setTimeout(() => {
          const input = document.getElementById('doc-search-input') as HTMLInputElement | null
          if (input) {
            input.focus()
            input.select()
          }
        }, 100)
      } else {
        dialog.close()
      }
    }
  }, [show])
  useEffect(() => {
    const openSearch = (event: KeyboardEvent) => {
      // @ts-expect-error event.target?.tagName is not defined in TypeScript
      if (['INPUT', 'TEXTAREA'].includes(event.target?.tagName)) {
        return
      }
      if (event.key === 's' && (event.metaKey || event.ctrlKey)) {
        setShow(true)
        event.preventDefault()
      }
    }
    window.addEventListener('keydown', openSearch)
    return () => {
      window.removeEventListener('keydown', openSearch)
    }
  })
  useEffect(() => {
    // Reset search state when user logs in or out
    setValue('')
    setResults([])
    setError(null)
    setLoading(false)
    setShow(false)
  }, [user])
  return (
    <>
      <button
        className="btn btn-ghost btn-square"
        title={`Search (${navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'} + S)`}
        onClick={() => setShow(!show)}
        id="doc-search-toggle"
      >
        <SearchIcon className="h-5 w-5 text-gray-500" />
      </button>
      <dialog className="modal items-start" id="doc-search-modal" onClose={() => setShow(false)}>
        <div className="modal-box bg-base-100 m-4 rounded-lg p-0">
          <div className="relative m-4 mb-0 shadow-lg">
            {loading ? (
              <span
                className="loading loading-spinner text-secondary absolute top-2 left-2 z-10"
                role="status"
              />
            ) : (
              <SearchIcon className="pointer-events-none absolute top-3 left-3 z-10 h-4 w-4 text-gray-500" />
            )}
            <input
              id="doc-search-input"
              type="text"
              placeholder="Search..."
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="input w-full px-10 outline-none!"
            />
            {value && (
              <button
                className="absolute top-3 right-3 z-10 cursor-pointer text-gray-500 hover:text-gray-700"
                onClick={() => {
                  setValue('')
                  const input = document.getElementById(
                    'doc-search-input'
                  ) as HTMLInputElement | null
                  if (input) {
                    input.focus()
                  }
                }}
                title="Clear search"
              >
                <XIcon className="h-4 w-4" />
              </button>
            )}
          </div>
          <ul
            className="bg-base-100 search-results max-h-100 overflow-y-auto py-2 pr-1 pl-4"
            style={{ scrollbarGutter: 'stable' }}
          >
            {error && <li className="text-error text-center text-sm">{error}</li>}
            {results.length > 0 ? (
              results.map((result, index) => (
                <li
                  key={index}
                  className="hover:bg-base-200 border-base-300 my-1 rounded-lg border p-2"
                >
                  <Link to={result.urlpath} onClick={() => setShow(false)}>
                    <div className="flex">
                      <strong
                        dangerouslySetInnerHTML={{
                          __html: DOMPurify.sanitize(result.title),
                        }}
                      ></strong>
                      {!result.public && user && (
                        <span className="badge badge-sm badge-secondary text-base-content ml-auto">
                          Private
                        </span>
                      )}
                    </div>
                    <p
                      className="text-sm text-gray-600"
                      dangerouslySetInnerHTML={{
                        __html: DOMPurify.sanitize(result.text),
                      }}
                    ></p>
                  </Link>
                </li>
              ))
            ) : (
              <li className="text-center text-sm text-gray-500">No results</li>
            )}
          </ul>
        </div>
        <button className="modal-backdrop" onClick={() => setShow(false)}>
          close
        </button>
      </dialog>
    </>
  )
}
