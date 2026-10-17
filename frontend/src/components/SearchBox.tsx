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
        <SearchIcon className="search-trigger-icon" />
      </button>
      <dialog className="modal search-modal" id="doc-search-modal" onClose={() => setShow(false)}>
        <div className="modal-box search-box">
          <div className="search-field">
            {loading ? (
              <span className="loading search-spinner" role="status" />
            ) : (
              <SearchIcon className="search-field-icon" />
            )}
            <input
              id="doc-search-input"
              type="text"
              placeholder="Search..."
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="input search-input"
            />
            {value && (
              <button
                className="search-clear"
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
                <XIcon />
              </button>
            )}
          </div>
          <ul className="search-results">
            {error && <li className="search-message search-error">{error}</li>}
            {results.length > 0 ? (
              results.map((result, index) => (
                <li key={index} className="search-result">
                  <Link to={result.urlpath} onClick={() => setShow(false)}>
                    <div className="search-result-header">
                      <strong
                        dangerouslySetInnerHTML={{
                          __html: DOMPurify.sanitize(result.title),
                        }}
                      ></strong>
                      {!result.public && user && (
                        <span className="badge badge-sm badge-secondary search-result-badge">
                          Private
                        </span>
                      )}
                    </div>
                    <p
                      className="search-result-text"
                      dangerouslySetInnerHTML={{
                        __html: DOMPurify.sanitize(result.text),
                      }}
                    ></p>
                  </Link>
                </li>
              ))
            ) : (
              <li className="search-message">No results</li>
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
