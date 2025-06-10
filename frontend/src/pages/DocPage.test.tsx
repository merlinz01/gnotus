import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import DocPage from './DocPage'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import useUser from '../stores/user'
import useConfig from '../stores/config'
import axios from '../axios'
import Role from '../types/role'

vi.mock('../axios', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../axios')>()),
  default: {
    get: vi.fn(),
  },
}))
vi.mock('dompurify', () => ({
  __esModule: true,
  default: { sanitize: (html: string) => html },
}))

const mockUser = {
  id: 1,
  username: 'testuser',
  role: Role.USER,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
}
const mockDoc = {
  id: 1,
  title: 'Test Document',
  urlpath: 'docs/test',
  html: '<h2 id="section1">Section 1</h2><p>Content</p><h2 id="section2">Section 2</h2>',
  updated_at: new Date().toISOString(),
  created_at: new Date().toISOString(),
  parents: [{ id: 2, title: 'Parent Doc', urlpath: 'docs/parent' }],
  children: [{ id: 3, title: 'Child Doc', urlpath: 'docs/child' }],
  metadata: {
    subtitles: [
      { hash: 'section1', title: 'Section 1' },
      { hash: 'section2', title: 'Section 2' },
    ],
  },
  public: true,
}

function renderDocPage(path = '/docs/test') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/*" element={<DocPage />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('DocPage', () => {
  beforeEach(() => {
    localStorage.clear()
    useConfig.setState({
      config: {
        site_name: 'Test Site',
        site_description: 'Test Description',
      },
      loaded: true,
    })
    useUser.setState({ user: mockUser, loaded: true, storagePrefix: 'test:' })
  })

  afterEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('renders loading spinner initially', async () => {
    vi.mocked(axios.get).mockReturnValue(new Promise(() => {}))
    renderDocPage()
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('renders document title and content', async () => {
    vi.mocked(axios.get).mockResolvedValue({ data: mockDoc, status: 200 })
    renderDocPage()
    await waitFor(() => {
      expect(screen.getAllByRole('heading', { level: 1 })[0]).toHaveTextContent('Test Document')
      expect(screen.getByText('Content')).toBeInTheDocument()
    })
  })

  it('renders breadcrumbs', async () => {
    vi.mocked(axios.get).mockResolvedValue({ data: mockDoc, status: 200 })
    renderDocPage()
    await waitFor(() => {
      expect(
        screen.getByRole('navigation', { name: 'Breadcrumbs' }).querySelectorAll('a')[0]
      ).toHaveTextContent('Home')
      expect(
        screen.getByRole('navigation', { name: 'Breadcrumbs' }).querySelectorAll('a')[1]
      ).toHaveTextContent('Parent Doc')
      expect(
        screen.getByRole('navigation', { name: 'Breadcrumbs' }).querySelectorAll('li')[2]
      ).toHaveTextContent('Test Document')
    })
  })

  it('renders child links', async () => {
    vi.mocked(axios.get).mockResolvedValue({ data: mockDoc, status: 200 })
    renderDocPage()
    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'Child Doc' })).toHaveAttribute('href', '/docs/child')
    })
  })

  it('renders document sections', async () => {
    vi.mocked(axios.get).mockResolvedValue({ data: mockDoc, status: 200 })
    renderDocPage()
    await waitFor(() => {
      expect(screen.getByRole('navigation', { name: 'Contents' })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Section 1' })).toHaveAttribute(
        'href',
        '/docs/test#section1'
      )
      expect(screen.getByRole('link', { name: 'Section 2' })).toHaveAttribute(
        'href',
        '/docs/test#section2'
      )
    })
  })

  it('shows edit button and public badge for logged in user', async () => {
    vi.mocked(axios.get).mockResolvedValue({ data: mockDoc, status: 200 })
    renderDocPage()
    await waitFor(() => {
      expect(screen.getByTitle('Edit document')).toBeInTheDocument()
      expect(screen.getByText('Public')).toBeInTheDocument()
    })
  })

  it('does not show edit button for non-logged in user', async () => {
    useUser.setState({ user: null })
    vi.mocked(axios.get).mockResolvedValue({ data: mockDoc, status: 200 })
    renderDocPage()
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Test Document')
    })
    expect(screen.queryByTitle('Edit document')).not.toBeInTheDocument()
  })

  it('does not show edit button for view-only user', async () => {
    useUser.setState({ user: { ...mockUser, role: Role.VIEWER } })
    vi.mocked(axios.get).mockResolvedValue({ data: mockDoc, status: 200 })
    renderDocPage()
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Test Document')
    })
    expect(screen.queryByTitle('Edit document')).not.toBeInTheDocument()
  })

  it('shows private badge if doc is not public', async () => {
    vi.mocked(axios.get).mockResolvedValue({ data: { ...mockDoc, public: false }, status: 200 })
    renderDocPage()
    await waitFor(() => {
      expect(screen.getByText('Private')).toBeInTheDocument()
    })
  })

  it('shows error alert if document not found', async () => {
    vi.mocked(axios.get).mockResolvedValue({ status: 404 })
    renderDocPage()
    await waitFor(() => {
      expect(screen.getByText(/does not exist/)).toBeInTheDocument()
    })
  })

  it('updates document title', async () => {
    vi.mocked(axios.get).mockResolvedValue({ data: mockDoc, status: 200 })
    renderDocPage()
    await waitFor(() => {
      expect(document.title).toBe('Test Document - Test Site')
    })
  })

  it('scrolls to hash element if present', async () => {
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    vi.mocked(axios.get).mockResolvedValue({ data: mockDoc, status: 200 })
    renderDocPage('/docs/test#section1')
    await waitFor(() => {
      expect(scrollIntoView).toHaveBeenCalled()
    })
  })

  it('removes stale localStorage doc', async () => {
    // Set a stale doc in localStorage
    localStorage.setItem(
      'test:doc:docs/test',
      JSON.stringify({
        data: { ...mockDoc, title: 'Stale Document' },
        timestamp: Date.now() - 1000 * 60 * 60 * 25, // 25 hours ago
      })
    )
    vi.mocked(axios.get).mockResolvedValue({ data: mockDoc, status: 200 })
    renderDocPage()
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Test Document')
    })
    expect(screen.queryByText('Stale Document')).not.toBeInTheDocument()
    expect(localStorage.getItem('test:doc:docs/test')).not.toBeNull()
    expect(JSON.parse(localStorage.getItem('test:doc:docs/test') || '{}').data.title).toBe(
      'Test Document'
    )
    expect(vi.mocked(axios.get)).toHaveBeenCalledWith('/api/docs/by_path', {
      params: { path: 'docs/test' },
      validateStatus: expect.any(Function),
    })
  })

  it('uses doc from localStorage if fresh', async () => {
    localStorage.setItem(
      'test:doc:docs/test',
      JSON.stringify({
        data: mockDoc,
        timestamp: Date.now(),
      })
    )
    vi.mocked(axios.get).mockResolvedValue({ status: 304 })
    renderDocPage()
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Test Document')
    })
    expect(vi.mocked(axios.get)).toHaveBeenCalledWith('/api/docs/by_path', {
      params: { path: 'docs/test', timestamp: mockDoc.updated_at },
      validateStatus: expect.any(Function),
    })
    expect(localStorage.getItem('test:doc:docs/test')).not.toBeNull()
    expect(JSON.parse(localStorage.getItem('test:doc:docs/test') || '{}').data.title).toBe(
      'Test Document'
    )
  })
})
