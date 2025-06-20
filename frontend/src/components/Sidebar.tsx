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
    <div className="flex h-full w-64 flex-col overflow-y-auto p-2">
      <ul className="menu w-full">
        <li>
          <HighlightedLink to="/">Home</HighlightedLink>
        </li>
        {outline && outline.children.map((node) => <OutlineNode key={node.id} node={node} />)}
        {user && (user.role === Role.ADMIN || user.role === Role.USER) && (
          <li>
            <HighlightedLink to="/_new" className="opacity-75">
              <span>Create new document</span>
            </HighlightedLink>
          </li>
        )}
        {user && user.role === Role.ADMIN && (
          <li>
            <HighlightedLink to="/_users" className="opacity-75">
              <span>Manage users</span>
            </HighlightedLink>
          </li>
        )}
      </ul>
      <div className="grow"></div>
      <div className="text-sm text-gray-500">
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
    </div>
  )
}

function OutlineNode({ node }: { node: DocTreeNode }) {
  const [open, setOpen] = useState(false)

  return (
    <li className="flex flex-col">
      <div className="has-[a.active]:bg-base-100 flex items-center gap-0 p-0">
        {node.children.length > 0 && (
          <button
            className="hover:text-secondary cursor-pointer px-1 py-2"
            onClick={(event) => {
              event.preventDefault()
              setOpen(!open)
            }}
          >
            <ChevronRightIcon
              className="h-4 w-4 transform transition-transform"
              style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }}
            />
            <span className="sr-only">Toggle children</span>
          </button>
        )}
        <HighlightedLink
          to={'/' + node.urlpath}
          className={`flex h-8 grow items-center ${node.children.length > 0 ? '' : 'pl-6'}`}
          activeClassName="text-primary active"
        >
          <span>{node.title}</span>
        </HighlightedLink>
      </div>
      {node.children.length > 0 && (
        <ul
          className="menu border-base-300 ml-3 w-auto overflow-y-hidden border-l p-0 pl-2 before:hidden"
          style={{ display: open ? 'block' : 'none' }}
        >
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
  activeClassName = 'not-hover:bg-base-100 text-primary',
}: {
  to: string
  children: React.ReactNode
  className?: string
  activeClassName?: string
}) {
  const location = useLocation()
  return (
    <Link
      to={to}
      className={`${className} ${location.pathname === to ? activeClassName : ''}`}
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
