import { render, screen, waitFor } from '@testing-library/react'
import HomePage from './HomePage'
import { vi } from 'vitest'
import useConfig from '../stores/config'
import axios from '../axios'
import Role from '../types/role'
import useUser from '../stores/user'

const mockOutline = [
  { id: '1', title: 'Doc 1', urlpath: 'doc-1' },
  { id: '2', title: 'Doc 2', urlpath: 'doc-2' },
]
const mockConfig = {
  site_name: 'TestSite',
  site_description: 'Test description',
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
    Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
      <a href={to}>{children}</a>
    ),
  }
})

describe('HomePage', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.resetAllMocks()
    document.title = ''
  })

  it('renders site name and description', () => {
    useConfig.setState({ config: mockConfig, loaded: true })
    useUser.setState({ user: mockUser, loaded: true, storagePrefix: 'test-' })
    vi.mocked(axios.get).mockResolvedValue({ data: { children: [] } })
    render(<HomePage />)
    expect(screen.getByText(/Welcome to TestSite/)).toBeInTheDocument()
    expect(screen.getByText(/Test description/)).toBeInTheDocument()
  })

  it('sets document title on mount', () => {
    useConfig.setState({ config: mockConfig, loaded: true })
    useUser.setState({ user: mockUser, loaded: true, storagePrefix: 'test-' })
    vi.mocked(axios.get).mockResolvedValue({ data: { children: [] } })
    document.title = ''
    render(<HomePage />)
    expect(document.title).toBe('Home - TestSite')
  })

  it('fetches outline if not in localStorage and displays it', async () => {
    useConfig.setState({ config: mockConfig, loaded: true })
    useUser.setState({ user: mockUser, loaded: true, storagePrefix: 'test-' })
    vi.mocked(axios.get).mockResolvedValueOnce({
      data: { children: mockOutline },
    })
    localStorage.removeItem('test-outline-toplevel')
    render(<HomePage />)
    await waitFor(() => {
      expect(screen.getByText('Doc 1')).toBeInTheDocument()
      expect(screen.getByText('Doc 2')).toBeInTheDocument()
    })
    expect(axios.get).toHaveBeenCalledWith('/api/docs/outline?depth=1')
    const stored = localStorage.getItem('test-outline-toplevel')
    expect(stored).toBeTruthy()
    const parsed = JSON.parse(stored!)
    expect(parsed.data).toEqual(mockOutline)
  })

  it('loads outline from localStorage if not expired', async () => {
    const now = Date.now()
    useConfig.setState({ config: mockConfig, loaded: true })
    useUser.setState({ user: mockUser, loaded: true, storagePrefix: 'test-' })
    localStorage.setItem(
      'test-outline-toplevel',
      JSON.stringify({ data: mockOutline, timestamp: now })
    )
    render(<HomePage />)
    await waitFor(() => {
      expect(screen.getByText('Doc 1')).toBeInTheDocument()
      expect(screen.getByText('Doc 2')).toBeInTheDocument()
    })
    expect(axios.get).not.toHaveBeenCalled()
  })
  it('fetches outline if localStorage is expired', async () => {
    const now = Date.now()
    useConfig.setState({ config: mockConfig, loaded: true })
    useUser.setState({ user: mockUser, loaded: true, storagePrefix: 'test-' })
    localStorage.setItem(
      'test-outline-toplevel',
      JSON.stringify({
        data: mockOutline,
        timestamp: now - 1000 * 60 * 60 * 25,
      })
    )
    vi.mocked(axios.get).mockResolvedValueOnce({
      data: { children: mockOutline },
    })
    render(<HomePage />)
    await waitFor(() => {
      expect(screen.getByText('Doc 1')).toBeInTheDocument()
      expect(screen.getByText('Doc 2')).toBeInTheDocument()
    })
    expect(axios.get).toHaveBeenCalledWith('/api/docs/outline?depth=1')
  })
  it('shows loading spinner while fetching outline', async () => {
    useConfig.setState({ config: mockConfig, loaded: true })
    useUser.setState({ user: mockUser, loaded: true, storagePrefix: 'test-' })
    const promise = new Promise(() => {})
    vi.mocked(axios.get).mockReturnValue(promise)
    render(<HomePage />)
    expect(screen.getByRole('status', { hidden: true })).toBeInTheDocument()
  })
  it('shows error message on outline fetch failure', async () => {
    useConfig.setState({ config: mockConfig, loaded: true })
    useUser.setState({ user: mockUser, loaded: true, storagePrefix: 'test-' })
    vi.mocked(axios.get).mockRejectedValue(new Error('Fetch failed'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<HomePage />)
    await waitFor(() => {
      expect(screen.getByText('An error occurred while fetching the outline.')).toBeInTheDocument()
    })
  })
})
