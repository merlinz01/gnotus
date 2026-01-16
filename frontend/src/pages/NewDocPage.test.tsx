import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi } from 'vitest'
import NewDocPage from './NewDocPage'
import useUser from '../stores/user'
import useConfig from '../stores/config'
import { MemoryRouter } from 'react-router-dom'
import axios from '../axios'
import Role from '../types/role'

vi.mock('../axios', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}))
const navigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return {
    ...actual,
    useNavigate: () => navigate,
  }
})

const mockParentDocs = [
  {
    id: 1,
    title: 'Parent Doc',
    urlpath: '/parent-doc',
    public: true,
    created_at: '',
    updated_at: '',
  },
  {
    id: 2,
    title: 'Another Parent',
    urlpath: '/another-parent',
    public: true,
    created_at: '',
    updated_at: '',
  },
]

describe('NewDocPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useUser.setState({
      user: {
        id: 1,
        username: 'testuser',
        role: Role.ADMIN,
        created_at: '',
        updated_at: '',
        is_active: true,
      },
      storagePrefix: 'test:',
      loaded: true,
    })
    useConfig.setState({
      config: { site_name: 'Test Site' },
      loaded: true,
    })
  })

  function renderPage(initialEntries = ['/_new']) {
    return render(
      <MemoryRouter initialEntries={initialEntries}>
        <NewDocPage />
      </MemoryRouter>
    )
  }

  test('renders form fields and loads parent documents', async () => {
    vi.mocked(axios.get).mockResolvedValueOnce({
      data: { items: mockParentDocs },
    })
    renderPage()
    expect(screen.getByText('Create New Document')).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getByLabelText('Parent document').querySelectorAll('option')).toHaveLength(3)
    )
    expect(screen.getByLabelText('Document title')).toHaveAttribute(
      'placeholder',
      'How to make a widget'
    )
    expect(screen.getByLabelText('URL slug')).toHaveAttribute(
      'placeholder',
      'how-to-make-a-widget'
    )
  })

  test('updates slug when title changes', async () => {
    vi.mocked(axios.get).mockResolvedValueOnce({
      data: { items: mockParentDocs },
    })
    renderPage()
    // Wait for docs to load
    await waitFor(() => expect(axios.get).toHaveBeenCalled())
    const titleInput = screen.getByLabelText('Document title')
    const slugInput = screen.getByLabelText('URL slug')
    fireEvent.change(titleInput, { target: { value: 'New Widget Guide' } })
    expect(slugInput).toHaveValue('new-widget-guide')
  })

  test('shows error if document creation fails', async () => {
    vi.mocked(axios.get).mockResolvedValueOnce({
      data: { items: mockParentDocs },
    })
    vi.mocked(axios.post).mockRejectedValueOnce(new Error('Creation failed'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    renderPage()
    fireEvent.change(screen.getByLabelText('Document title'), {
      target: { value: 'Test Doc' },
    })
    fireEvent.submit(screen.getByRole('form'))
    await waitFor(() =>
      expect(
        screen.getByText('Failed to create new document. Please try again later.')
      ).toBeInTheDocument()
    )
  })

  test('navigates to edit page after successful creation', async () => {
    vi.mocked(axios.get).mockResolvedValueOnce({
      data: { items: mockParentDocs },
    })
    vi.mocked(axios.post).mockResolvedValueOnce({
      data: {
        id: 123,
        urlpath: '/test-doc',
        parents: [],
      },
    })
    renderPage()
    fireEvent.change(screen.getByLabelText('Parent document'), {
      target: { value: '1' },
    })
    fireEvent.change(screen.getByLabelText('Document title'), {
      target: { value: 'Test Doc' },
    })
    fireEvent.submit(screen.getByRole('form'))
    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith('/_edit/123')
    })
  })

  test('redirects to login if user is not loaded', () => {
    useUser.setState({ loaded: false })
    renderPage()
    waitFor(() => {
      expect(navigate).toHaveBeenCalledWith('/login')
    })
  })

  test('pre-fills parent document from query parameter', async () => {
    vi.mocked(axios.get).mockResolvedValueOnce({
      data: { items: mockParentDocs },
    })
    renderPage(['/_new?parent=2'])
    await waitFor(() =>
      expect(screen.getByLabelText('Parent document')).toHaveValue('2')
    )
  })
})
