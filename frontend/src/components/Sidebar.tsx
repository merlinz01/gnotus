import { Link } from 'react-router-dom'
import useUser from '../stores/user'
import axios from '../axios'
import { useCallback, useEffect, useState } from 'react'
import Role from '../types/role'
import { useLocation } from 'react-router-dom'
import { ChevronRightIcon } from 'lucide-react'
import './Sidebar.css'

interface DocTreeNode {
  id: number
  title: string
  urlpath: string
  public: boolean
  children: DocTreeNode[]
}

export default function Sidebar() {
  const user = useUser((state) => state.user)
  const storagePrefix = useUser((state) => state.storagePrefix)
  const [outline, setOutline] = useState<DocTreeNode | null>(null)
  const fetchOutline = useCallback(async () => {
    try {
      const response = await axios.get('/api/docs/outline')
      setOutline(response.data)
      localStorage.setItem(
        `${storagePrefix}outline`,
        JSON.stringify({ data: response.data, timestamp: Date.now() })
      )
    } catch (error) {
      console.error('Failed to fetch outline:', error)
    }
  }, [storagePrefix])
  useEffect(() => {
    const storedOutlineText = localStorage.getItem(`${storagePrefix}outline`)
    if (storedOutlineText) {
      const storedOutline = JSON.parse(storedOutlineText)
      const now = Date.now()
      if (now - storedOutline.timestamp < 1000 * 60 * 60 * 24) {
        setOutline(storedOutline.data)
        return
      } else {
        localStorage.removeItem(`${storagePrefix}outline`)
      }
    }
    fetchOutline()
  }, [user, storagePrefix, fetchOutline])
  useEffect(() => {
    document.addEventListener('outline-changed', fetchOutline)
    return () => {
      document.removeEventListener('outline-changed', fetchOutline)
    }
  })
  return (
    <div className="sidebar">
      <ul className="menu sidebar-menu">
        {outline && (
          <>
            <OutlineNode node={outline} showChildren={false} />
            {outline.children.map((node) => (
              <OutlineNode key={node.id} node={node} />
            ))}
          </>
        )}
        {user && (user.role === Role.ADMIN || user.role === Role.USER) && (
          <li>
            <HighlightedLink to="/_new" className="sidebar-action">
              <span>Create new document</span>
            </HighlightedLink>
          </li>
        )}
        {user && (user.role === Role.ADMIN || user.role === Role.USER) && (
          <li>
            <HighlightedLink to="/_admin" className="sidebar-action">
              <span>Administration</span>
            </HighlightedLink>
          </li>
        )}
      </ul>
      <div className="sidebar-spacer"></div>
      <div className="sidebar-footer">
        {user ? (
          <span>
            Logged in as <i>{user.username}</i>
            <br />
            <Link to="/logout" onClick={closeDrawer}>
              Log out
            </Link>
          </span>
        ) : (
          <Link to="/login" onClick={closeDrawer}>
            Log in
          </Link>
        )}
      </div>
      <div className="sidebar-footer">
        Powered by{' '}
        <a href="https://github.com/merlinz01/gnotus" target="_blank" rel="noopener noreferrer">
          Gnotus
        </a>
      </div>
    </div>
  )
}

function OutlineNode({ node, showChildren = true }: { node: DocTreeNode; showChildren?: boolean }) {
  const [open, setOpen] = useState(false)
  const hasVisibleChildren = showChildren && node.children.length > 0

  return (
    <li>
      <div className="sidebar-item">
        {hasVisibleChildren && (
          <button
            className="sidebar-toggle"
            onClick={(event) => {
              event.preventDefault()
              setOpen(!open)
            }}
          >
            <ChevronRightIcon className={`sidebar-toggle-icon ${open ? 'open' : ''}`} />
            <span className="visually-hidden">Toggle children</span>
          </button>
        )}
        <HighlightedLink
          to={node.urlpath}
          className={`sidebar-link ${hasVisibleChildren ? '' : 'sidebar-link-leaf'}`}
        >
          <span>{node.title}</span>
        </HighlightedLink>
      </div>
      {hasVisibleChildren && (
        <ul className="menu sidebar-children" hidden={!open}>
          {node.children.map((child) => (
            <OutlineNode key={child.id} node={child} />
          ))}
        </ul>
      )}
    </li>
  )
}

function HighlightedLink({
  to,
  children,
  className = '',
}: {
  to: string
  children: React.ReactNode
  className?: string
}) {
  const location = useLocation()
  return (
    <Link
      to={to}
      className={`${className} ${location.pathname === to ? 'active' : ''}`}
      onClick={closeDrawer}
    >
      {children}
    </Link>
  )
}

function closeDrawer() {
  const drawerToggle = document.getElementById('drawer-toggle') as HTMLInputElement
  if (drawerToggle) {
    drawerToggle.checked = false
  }
}
