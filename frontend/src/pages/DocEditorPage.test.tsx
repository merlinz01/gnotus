import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import DocEditorPage from './DocEditorPage'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
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

function renderWithRouter() {
  const router = createMemoryRouter(
    [
      { path: '/_edit/:docId', element: <DocEditorPage /> },
      { path: '/*', element: <div>Other page</div> },
    ],
    { initialEntries: ['/_edit/123'] }
  )
  // Spy on router.navigate
  const originalNavigate = router.navigate.bind(router)
  router.navigate = vi.fn((to) => {
    navigate(to)
    return originalNavigate(to)
  }) as typeof router.navigate
  render(<RouterProvider router={router} />)
  return router
}

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
  slug: 'test-doc',
  urlpath: '/test-doc',
  public: true,
  markdown: '# Hello',
  parents: [{ id: 1, title: 'Home', urlpath: '/' }],
  parent_id: 1,
}
const mockDocsList = {
  items: [
    { id: 1, title: 'Parent Doc', urlpath: '/parent-doc', public: true, parent_id: null },
    { id: 2, title: 'Another Doc', urlpath: '/another-doc', public: false, parent_id: null },
  ],
}
const mockConfig = {
  site_name: 'Test site',
}

// Helper to mock axios.get based on URL
function mockAxiosGet(options: {
  doc?: object
  docError?: Error
  docs?: object
  uploads?: object[]
}) {
  vi.mocked(axios.get).mockImplementation((url: string) => {
    if (url.includes('/api/docs/') && url.includes('include_source')) {
      if (options.docError) {
        return Promise.reject(options.docError)
      }
      return Promise.resolve({ data: options.doc || mockDoc })
    }
    if (url === '/api/docs/') {
      return Promise.resolve({ data: options.docs || mockDocsList })
    }
    if (url.includes('/api/uploads/by-doc/')) {
      return Promise.resolve({ data: options.uploads || [] })
    }
    return Promise.reject(new Error(`Unexpected URL: ${url}`))
  })
}

describe('DocEditorPage', () => {
  beforeEach(() => {
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
    vi.mocked(axios.get).mockImplementation((url: string) => {
      if (url.includes('/api/docs/') && url.includes('include_source')) {
        return new Promise((res) => {
          resolvePromise = res
        })
      }
      if (url === '/api/docs/') {
        return Promise.resolve({ data: mockDocsList })
      }
      if (url.includes('/api/uploads/by-doc/')) {
        return Promise.resolve({ data: [] })
      }
      return Promise.reject(new Error(`Unexpected URL: ${url}`))
    })
    renderWithRouter()
    expect(screen.getByText(/Edit document/i)).toBeInTheDocument()
    expect(screen.getByRole('status')).toBeInTheDocument()
    resolvePromise!({ data: mockDoc })
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument())
  })

  it('renders document fields after loading', async () => {
    mockAxiosGet({})
    renderWithRouter()
    expect(await screen.findByDisplayValue('Test Doc')).toBeInTheDocument()
    expect(screen.getByLabelText('Title')).toHaveValue('Test Doc')
    expect(screen.getByLabelText('URL slug')).toHaveValue('test-doc')
    expect(screen.getByLabelText('Public')).toBeChecked()
    expect(screen.getByPlaceholderText(/Write your document content here/i)).toHaveValue('# Hello')
    // Verify parent select is rendered
    expect(screen.getByLabelText('Parent')).toBeInTheDocument()
  })

  it('shows error if document fetch fails', async () => {
    mockAxiosGet({ docError: new Error('fail') })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    renderWithRouter()
    expect(await screen.findByText(/Failed to load document/i)).toBeInTheDocument()
  })

  it('redirects to login if user is not present', async () => {
    useUser.setState({ user: null })
    renderWithRouter()
    expect(navigate).toHaveBeenCalledWith('/login')
  })

  it('saves document on submit', async () => {
    mockAxiosGet({})
    vi.mocked(axios.put).mockResolvedValueOnce({
      data: {
        id: 123,
        title: 'Changed Title',
        markdown: '# Changed',
        slug: 'changed-doc',
        urlpath: '/changed-doc',
        public: true,
        parents: [],
      },
    })
    renderWithRouter()
    const titleInput = await screen.findByDisplayValue('Test Doc')
    fireEvent.change(titleInput, { target: { value: 'Changed Title' } })
    fireEvent.change(screen.getByPlaceholderText(/Write your document content here/i), {
      target: { value: '# Changed' },
    })
    fireEvent.change(screen.getByLabelText('URL slug'), {
      target: { value: 'changed-doc' },
    })
    fireEvent.click(screen.getByLabelText('Public'))
    fireEvent.click(screen.getByText('Save'))
    await waitFor(() =>
      expect(axios.put).toHaveBeenCalledWith('/api/docs/123', {
        title: 'Changed Title',
        markdown: '# Changed',
        slug: 'changed-doc',
        parent_id: 1,
        public: false,
      })
    )
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/changed-doc'))
  })

  it('saves document with parent', async () => {
    mockAxiosGet({})
    vi.mocked(axios.put).mockResolvedValueOnce({
      data: {
        id: 123,
        title: 'Test Doc',
        markdown: '# Hello',
        slug: 'test-doc',
        urlpath: '/parent-doc/test-doc',
        public: true,
        parents: [{ id: 1, title: 'Parent Doc', urlpath: '/parent-doc' }],
      },
    })
    renderWithRouter()
    await screen.findByDisplayValue('Test Doc')
    // Select a parent
    fireEvent.change(screen.getByLabelText('Parent'), { target: { value: '1' } })
    fireEvent.click(screen.getByText('Save'))
    await waitFor(() =>
      expect(axios.put).toHaveBeenCalledWith('/api/docs/123', {
        title: 'Test Doc',
        markdown: '# Hello',
        slug: 'test-doc',
        parent_id: 1,
        public: true,
      })
    )
  })

  it('shows error if save fails', async () => {
    mockAxiosGet({})
    vi.mocked(axios.put).mockRejectedValueOnce(new Error('fail'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    renderWithRouter()
    // Wait for document to load before clicking Save
    await screen.findByDisplayValue('Test Doc')
    fireEvent.click(screen.getByText('Save'))
    expect(await screen.findByText(/Failed to update document/i)).toBeInTheDocument()
  })

  it('moves document up and down', async () => {
    mockAxiosGet({})
    vi.mocked(axios.post).mockResolvedValueOnce({ data: {} })
    vi.mocked(axios.post).mockResolvedValueOnce({ data: {} })
    renderWithRouter()
    // Wait for document to load before clicking move buttons
    await screen.findByDisplayValue('Test Doc')
    fireEvent.click(screen.getByTitle('Move document up'))
    await waitFor(() => expect(axios.post).toHaveBeenCalledWith('/api/docs/123/move?direction=up'))
    fireEvent.click(screen.getByTitle('Move document down'))
    await waitFor(() =>
      expect(axios.post).toHaveBeenCalledWith('/api/docs/123/move?direction=down')
    )
  })

  it('shows error if move fails', async () => {
    mockAxiosGet({})
    vi.mocked(axios.post).mockRejectedValueOnce(new Error('fail'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    renderWithRouter()
    // Wait for document to load before clicking move button
    await screen.findByDisplayValue('Test Doc')
    fireEvent.click(screen.getByTitle('Move document up'))
    expect(await screen.findByText(/Failed to move document up/i)).toBeInTheDocument()
  })

  it('deletes document after confirmation', async () => {
    mockAxiosGet({})
    vi.mocked(axios.delete).mockResolvedValueOnce({})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const confirm = vi.spyOn(window, 'confirm')
    confirm.mockReturnValueOnce(true)
    renderWithRouter()
    fireEvent.click(await screen.findByTitle('Delete document'))
    await waitFor(() =>
      expect(confirm).toHaveBeenCalledWith(
        'Are you sure you want to delete this document? This action cannot be undone.'
      )
    )
    await waitFor(() => expect(axios.delete).toHaveBeenCalledWith('/api/docs/123'))
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/'))
  })

  it('does not delete document if confirmation is cancelled', async () => {
    mockAxiosGet({})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const confirm = vi.spyOn(window, 'confirm')
    confirm.mockReturnValueOnce(false)
    renderWithRouter()
    fireEvent.click(await screen.findByTitle('Delete document'))
    await waitFor(() =>
      expect(confirm).toHaveBeenCalledWith(
        'Are you sure you want to delete this document? This action cannot be undone.'
      )
    )
    expect(axios.delete).not.toHaveBeenCalled()
    expect(navigate).not.toHaveBeenCalled()
    expect(screen.queryByText(/Failed to delete document/i)).not.toBeInTheDocument()
  })

  it('shows error if delete fails', async () => {
    mockAxiosGet({})
    vi.mocked(axios.delete).mockRejectedValueOnce(new Error('fail'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const confirm = vi.spyOn(window, 'confirm')
    confirm.mockReturnValueOnce(true)
    renderWithRouter()
    fireEvent.click(await screen.findByTitle('Delete document'))
    expect(await screen.findByText(/Failed to delete document/i)).toBeInTheDocument()
  })

  it('updates preview when textarea changes', async () => {
    mockAxiosGet({})
    renderWithRouter()
    const textarea = await screen.findByPlaceholderText(/Write your document content/i)
    fireEvent.change(textarea, { target: { value: '# Changed' } })
    expect(screen.getByText('Changed')).toHaveRole('heading')
  })

  it('renders document history link', async () => {
    mockAxiosGet({})
    renderWithRouter()
    expect(await screen.findByTitle('View document history')).toHaveAttribute(
      'href',
      '/_revisions/123'
    )
  })

  it('shows parent in select when document has a parent', async () => {
    mockAxiosGet({
      doc: {
        ...mockDoc,
        parents: [{ id: 1, title: 'Parent Doc', urlpath: '/parent-doc' }],
      },
    })
    renderWithRouter()
    await screen.findByDisplayValue('Test Doc')
    expect(screen.getByLabelText('Parent')).toHaveValue('1')
  })

  it('excludes current document from parent options', async () => {
    mockAxiosGet({
      docs: {
        items: [
          { id: 123, title: 'Test Doc', urlpath: '/test-doc', public: true, parent_id: null },
          { id: 1, title: 'Parent Doc', urlpath: '/parent-doc', public: true, parent_id: null },
        ],
      },
    })
    renderWithRouter()
    await screen.findByDisplayValue('Test Doc')
    const parentSelect = screen.getByLabelText('Parent')
    // Should have "(Top-level document)" and "Parent Doc" but not "Test Doc" (current doc)
    expect(parentSelect.querySelectorAll('option')).toHaveLength(2)
    expect(screen.queryByRole('option', { name: 'Test Doc' })).not.toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Parent Doc' })).toBeInTheDocument()
  })

  it('excludes descendants from parent options', async () => {
    mockAxiosGet({
      docs: {
        items: [
          { id: 123, title: 'Test Doc', urlpath: '/test-doc', public: true, parent_id: null },
          { id: 1, title: 'Parent Doc', urlpath: '/parent-doc', public: true, parent_id: null },
          { id: 200, title: 'Child Doc', urlpath: '/test-doc/child', public: true, parent_id: 123 },
          { id: 201, title: 'Grandchild Doc', urlpath: '/test-doc/child/grandchild', public: true, parent_id: 200 },
        ],
      },
    })
    renderWithRouter()
    await screen.findByDisplayValue('Test Doc')
    const parentSelect = screen.getByLabelText('Parent')
    // Should have "(Top-level document)" and "Parent Doc" only
    // Should NOT have "Test Doc" (self), "Child Doc" (child), or "Grandchild Doc" (grandchild)
    expect(parentSelect.querySelectorAll('option')).toHaveLength(2)
    expect(screen.queryByRole('option', { name: 'Test Doc' })).not.toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Child Doc' })).not.toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Grandchild Doc' })).not.toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Parent Doc' })).toBeInTheDocument()
  })
})
