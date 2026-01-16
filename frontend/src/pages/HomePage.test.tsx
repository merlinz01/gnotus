import { render, screen, waitFor } from '@testing-library/react'
import HomePage from './HomePage'
import { vi } from 'vitest'
import useConfig from '../stores/config'
import axios from '../axios'
import Role from '../types/role'
import useUser from '../stores/user'

const mockOutline = [
  { id: '1', title: 'Doc 1', urlpath: '/doc-1' },
  { id: '2', title: 'Doc 2', urlpath: '/doc-2' },
]
const mockDoc = {
  id: 1,
  title: 'Home',
  urlpath: '/',
  html: '<p>Welcome content</p>',
  markdown: 'Welcome content',
  public: true,
  metadata: { subtitles: [] },
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  children: [],
}
const mockConfig = {
  site_name: 'TestSite',
}
const mockUser = {
  id: 1,
  username: 'testuser',
  role: Role.ADMIN,
  created_at: '',
  updated_at: '',
  is_active: true,
}
vi.mock('../axios', () => ({
  default: { get: vi.fn() },
}))
vi.mock('react-router-dom', async (importOriginal) => {
  const original = await importOriginal<typeof import('react-router-dom')>()
  return {
    ...original,
    useNavigate: () => vi.fn(),
    useLocation: () => ({ pathname: '/', search: '', hash: '' }),
    Link: ({ children, to, ...props }: { children: React.ReactNode; to: string }) => (
      <a href={to} {...props}>{children}</a>
    ),
  }
})
vi.mock('dompurify', () => ({
  __esModule: true,
  default: { sanitize: (html: string) => html },
}))

function mockApiCalls(options: { doc?: object | null; docStatus?: number; outline?: object[] }) {
  const { doc = null, docStatus = doc ? 200 : 404, outline = [] } = options
  vi.mocked(axios.get).mockImplementation((url: string) => {
    if (url === '/api/docs/by_path') {
      return Promise.resolve({ data: doc, status: docStatus })
    }
    if (url === '/api/docs/outline?depth=1') {
      return Promise.resolve({ data: { children: outline } })
    }
    return Promise.reject(new Error(`Unexpected URL: ${url}`))
  })
}

describe('HomePage', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.resetAllMocks()
    document.title = ''
    useConfig.setState({ config: mockConfig, loaded: true })
    useUser.setState({ user: mockUser, loaded: true, storagePrefix: 'test-' })
  })

  it('shows loading spinner while fetching', async () => {
    vi.mocked(axios.get).mockReturnValue(new Promise(() => {}))
    render(<HomePage />)
    expect(screen.getByRole('status', { hidden: true })).toBeInTheDocument()
  })

  it('renders site name when doc has no content', async () => {
    mockApiCalls({ doc: { ...mockDoc, html: '' }, outline: mockOutline })
    render(<HomePage />)
    await waitFor(() => {
      expect(screen.getByText('TestSite')).toBeInTheDocument()
    })
  })

  it('renders outline when doc has no content', async () => {
    mockApiCalls({ doc: { ...mockDoc, html: '' }, outline: mockOutline })
    render(<HomePage />)
    await waitFor(() => {
      expect(screen.getByText('Doc 1')).toBeInTheDocument()
      expect(screen.getByText('Doc 2')).toBeInTheDocument()
    })
  })

  it('renders doc content when doc has html', async () => {
    mockApiCalls({ doc: mockDoc, outline: mockOutline })
    render(<HomePage />)
    await waitFor(() => {
      expect(screen.getByText('Welcome content')).toBeInTheDocument()
    })
    expect(screen.queryByRole('heading', { name: 'TestSite' })).not.toBeInTheDocument()
  })

  it('sets document title to site name when doc has no title', async () => {
    mockApiCalls({ doc: null, outline: [] })
    render(<HomePage />)
    await waitFor(() => {
      expect(document.title).toBe('TestSite')
    })
  })

  it('sets document title with doc title when available', async () => {
    mockApiCalls({ doc: mockDoc, outline: [] })
    render(<HomePage />)
    await waitFor(() => {
      expect(document.title).toBe('Home - TestSite')
    })
  })

  it('shows edit button for admin user when doc exists', async () => {
    mockApiCalls({ doc: mockDoc, outline: [] })
    render(<HomePage />)
    await waitFor(() => {
      expect(screen.getByTitle('Edit home page')).toBeInTheDocument()
    })
  })

  it('does not show edit button for viewer', async () => {
    useUser.setState({ user: { ...mockUser, role: Role.VIEWER }, loaded: true, storagePrefix: 'test-' })
    mockApiCalls({ doc: mockDoc, outline: [] })
    render(<HomePage />)
    await waitFor(() => {
      expect(screen.getByText('Welcome content')).toBeInTheDocument()
    })
    expect(screen.queryByTitle('Edit home page')).not.toBeInTheDocument()
  })

  it('stores outline to localStorage after fetch', async () => {
    mockApiCalls({ doc: null, outline: mockOutline })
    render(<HomePage />)
    await waitFor(() => {
      expect(screen.getByText('Doc 1')).toBeInTheDocument()
    })
    const stored = localStorage.getItem('test-outline-toplevel')
    expect(stored).toBeTruthy()
    const parsed = JSON.parse(stored!)
    expect(parsed.data).toEqual(mockOutline)
  })

  it('uses cached outline from localStorage', async () => {
    localStorage.setItem(
      'test-outline-toplevel',
      JSON.stringify({ data: mockOutline, timestamp: Date.now() })
    )
    // Only mock the doc call since outline should come from cache
    vi.mocked(axios.get).mockImplementation((url: string) => {
      if (url === '/api/docs/by_path') {
        return Promise.resolve({ data: null, status: 404 })
      }
      return Promise.reject(new Error(`Unexpected URL: ${url}`))
    })
    render(<HomePage />)
    await waitFor(() => {
      expect(screen.getByText('Doc 1')).toBeInTheDocument()
    })
    // Should only call by_path, not outline
    expect(axios.get).toHaveBeenCalledTimes(1)
    expect(axios.get).toHaveBeenCalledWith('/api/docs/by_path', expect.any(Object))
  })

  it('shows error message on fetch failure', async () => {
    vi.mocked(axios.get).mockRejectedValue(new Error('Fetch failed'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<HomePage />)
    await waitFor(() => {
      expect(screen.getByText('An error occurred while loading the home page.')).toBeInTheDocument()
    })
  })
})
