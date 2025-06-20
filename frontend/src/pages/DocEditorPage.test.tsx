import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import DocEditorPage from './DocEditorPage'
import { useParams } from 'react-router-dom'
import useUser from '../stores/user'
import useConfig from '../stores/config'
import axios from '../axios'
import Role from '../types/role'

vi.mock('../axios', () => ({
  default: {
    get: vi.fn(),
    put: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
}))
const navigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return {
    ...actual,
    useParams: vi.fn(),
    useNavigate: () => navigate,
    Link: ({ to, children, title }: { to: string; children: React.ReactNode; title?: string }) => (
      <a href={to} title={title}>
        {children}
      </a>
    ),
  }
})

const mockUser = {
  id: 1,
  username: 'testuser',
  role: Role.ADMIN,
  created_at: '',
  updated_at: '',
  is_active: true,
}
const mockDoc = {
  id: 123,
  title: 'Test Doc',
  urlpath: 'test-doc',
  public: true,
  markdown: '# Hello',
  parents: [],
}
const mockConfig = {
  site_name: 'Test site',
  site_description: 'Test description',
}

describe('DocEditorPage', () => {
  beforeEach(() => {
    vi.mocked(useParams).mockReturnValue({ docId: '123' })
    useUser.setState({
      user: mockUser,
      storagePrefix: 'test-',
      loaded: true,
    })
    useConfig.setState({
      config: mockConfig,
      loaded: true,
    })
    document.title = ''
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('renders loading spinner while loading', async () => {
    let resolvePromise: (r: unknown) => void
    vi.mocked(axios.get).mockImplementationOnce(() => {
      return new Promise((res) => {
        resolvePromise = res
      })
    })
    render(<DocEditorPage />)
    expect(screen.getByText(/Edit document/i)).toBeInTheDocument()
    expect(screen.getByRole('status')).toBeInTheDocument()
    resolvePromise!({ data: mockDoc })
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument())
  })

  it('renders document fields after loading', async () => {
    vi.mocked(axios.get).mockResolvedValueOnce({ data: mockDoc })
    render(<DocEditorPage />)
    expect(await screen.findByDisplayValue('Test Doc')).toBeInTheDocument()
    expect(screen.getByLabelText('Document title')).toHaveValue('Test Doc')
    expect(screen.getByLabelText('Document URL path')).toHaveValue('test-doc')
    expect(screen.getByLabelText('Public document')).toBeChecked()
    expect(screen.getByPlaceholderText(/Write your document content here/i)).toHaveValue('# Hello')
  })

  it('shows error if document fetch fails', async () => {
    vi.mocked(axios.get).mockRejectedValueOnce(new Error('fail'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<DocEditorPage />)
    expect(await screen.findByText(/Failed to load document/i)).toBeInTheDocument()
  })

  it('redirects to login if user is not present', async () => {
    useUser.setState({ user: null })
    render(<DocEditorPage />)
    expect(navigate).toHaveBeenCalledWith('/login')
  })

  it('saves document on submit', async () => {
    vi.mocked(axios.get).mockResolvedValueOnce({ data: mockDoc })
    vi.mocked(axios.put).mockResolvedValueOnce({
      data: {
        id: 123,
        title: 'Changed Title',
        markdown: '# Changed',
        urlpath: 'changed-doc',
        public: true,
        parents: [],
      },
    })
    render(<DocEditorPage />)
    const titleInput = await screen.findByDisplayValue('Test Doc')
    fireEvent.change(titleInput, { target: { value: 'Changed Title' } })
    fireEvent.change(screen.getByPlaceholderText(/Write your document content here/i), {
      target: { value: '# Changed' },
    })
    fireEvent.change(screen.getByLabelText('Document URL path'), {
      target: { value: 'changed-doc' },
    })
    fireEvent.click(screen.getByLabelText('Public document'))
    fireEvent.click(screen.getByText('Save Document'))
    waitFor(() =>
      expect(axios.put).toHaveBeenCalledWith('/api/docs/123', {
        title: 'Changed Title',
        markdown: '# Changed',
        urlpath: 'changed-doc',
        public: true,
      })
    )
    waitFor(() => expect(navigate).toHaveBeenCalledWith('/changed-doc'))
  })

  it('shows error if save fails', async () => {
    vi.mocked(axios.get).mockResolvedValueOnce({ data: mockDoc })
    vi.mocked(axios.put).mockRejectedValueOnce(new Error('fail'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<DocEditorPage />)
    fireEvent.click(await screen.findByText('Save Document'))
    expect(await screen.findByText(/Failed to update document/i)).toBeInTheDocument()
  })

  it('moves document up and down', async () => {
    vi.mocked(axios.get).mockResolvedValueOnce({ data: mockDoc })
    vi.mocked(axios.post).mockResolvedValueOnce({ data: {} })
    vi.mocked(axios.post).mockResolvedValueOnce({ data: {} })
    render(<DocEditorPage />)
    fireEvent.click(await screen.findByTitle('Move document up'))
    await waitFor(() => expect(axios.post).toHaveBeenCalledWith('/api/docs/123/move?direction=up'))
    fireEvent.click(screen.getByTitle('Move document down'))
    await waitFor(() =>
      expect(axios.post).toHaveBeenCalledWith('/api/docs/123/move?direction=down')
    )
  })

  it('shows error if move fails', async () => {
    vi.mocked(axios.get).mockResolvedValueOnce({ data: mockDoc })
    vi.mocked(axios.post).mockRejectedValueOnce(new Error('fail'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<DocEditorPage />)
    fireEvent.click(await screen.findByTitle('Move document up'))
    expect(await screen.findByText(/Failed to move document up/i)).toBeInTheDocument()
  })

  it('deletes document after confirmation', async () => {
    vi.mocked(axios.get).mockResolvedValueOnce({ data: mockDoc })
    vi.mocked(axios.delete).mockResolvedValueOnce({})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const confirm = vi.spyOn(window, 'confirm')
    confirm.mockReturnValueOnce(true)
    render(<DocEditorPage />)
    fireEvent.click(await screen.findByTitle('Delete document'))
    waitFor(() =>
      expect(confirm).toHaveBeenCalledWith('Are you sure you want to delete this document?')
    )
    waitFor(() => expect(axios.delete).toHaveBeenCalledWith('/api/docs/123'))
    waitFor(() => expect(navigate).toHaveBeenCalledWith('/'))
  })

  it('does not delete document if confirmation is cancelled', async () => {
    vi.mocked(axios.get).mockResolvedValueOnce({ data: mockDoc })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const confirm = vi.spyOn(window, 'confirm')
    confirm.mockReturnValueOnce(false)
    render(<DocEditorPage />)
    fireEvent.click(await screen.findByTitle('Delete document'))
    waitFor(() =>
      expect(confirm).toHaveBeenCalledWith(
        'Are you sure you want to delete this document? This action cannot be undone.'
      )
    )
    expect(axios.delete).not.toHaveBeenCalled()
    expect(navigate).not.toHaveBeenCalled()
    expect(screen.queryByText(/Failed to delete document/i)).not.toBeInTheDocument()
  })

  it('shows error if delete fails', async () => {
    vi.mocked(axios.get).mockResolvedValueOnce({ data: mockDoc })
    vi.mocked(axios.delete).mockRejectedValueOnce(new Error('fail'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const confirm = vi.spyOn(window, 'confirm')
    confirm.mockReturnValueOnce(true)
    render(<DocEditorPage />)
    fireEvent.click(await screen.findByTitle('Delete document'))
    expect(await screen.findByText(/Failed to delete document/i)).toBeInTheDocument()
  })

  it('updates preview when textarea changes', async () => {
    vi.mocked(axios.get).mockResolvedValueOnce({ data: mockDoc })
    render(<DocEditorPage />)
    const textarea = await screen.findByPlaceholderText(/Write your document content/i)
    fireEvent.change(textarea, { target: { value: '# Changed' } })
    expect(screen.getByText('Changed')).toHaveRole('heading')
  })

  it('renders document history link', async () => {
    vi.mocked(axios.get).mockResolvedValueOnce({ data: mockDoc })
    render(<DocEditorPage />)
    expect(await screen.findByTitle('View document history')).toHaveAttribute(
      'href',
      '/_revisions/123'
    )
  })
})
