import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import Sidebar from './Sidebar'
import Role from '../types/role'
import useUser from '../stores/user'
import * as axiosModule from '../axios'
import { MemoryRouter } from 'react-router-dom'

// Mock useUser store
const mockUser = {
  id: 1,
  username: 'testuser',
  role: Role.USER,
  created_at: '2023-01-01T00:00:00Z',
  updated_at: '2023-01-02T00:00:00Z',
  is_active: true,
}
const mockAdmin = {
  id: 2,
  username: 'adminuser',
  role: Role.ADMIN,
  created_at: '2023-01-03T00:00:00Z',
  updated_at: '2023-01-04T00:00:00Z',
  is_active: true,
}
const mockViewer = {
  id: 3,
  username: 'vieweruser',
  role: Role.VIEWER,
  created_at: '2023-01-05T00:00:00Z',
  updated_at: '2023-01-06T00:00:00Z',
  is_active: true,
}

const mockOutline = {
  id: 1,
  title: 'Root',
  urlpath: '',
  public: true,
  children: [
    {
      id: 2,
      title: 'Child 1',
      urlpath: 'child-1',
      public: true,
      children: [],
    },
    {
      id: 3,
      title: 'Child 2',
      urlpath: 'child-2',
      public: true,
      children: [
        {
          id: 4,
          title: 'Grandchild',
          urlpath: 'child-2/grandchild',
          public: true,
          children: [],
        },
      ],
    },
  ],
}

vi.mock('../axios', () => ({
  default: {
    get: vi.fn(),
  },
}))

describe('Sidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('renders Home link always', async () => {
    useUser.setState({ user: null, storagePrefix: '', loaded: true })
    vi.mocked(axiosModule.default.get).mockResolvedValue({ data: mockOutline })
    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>
    )
    expect(await screen.findByText('Home')).toBeInTheDocument()
  })

  it('renders outline nodes from API', async () => {
    useUser.setState({ user: mockUser, storagePrefix: '', loaded: true })
    vi.mocked(axiosModule.default.get).mockResolvedValue({ data: mockOutline })
    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>
    )
    expect(await screen.findByText('Child 1')).toBeInTheDocument()
    expect(await screen.findByText('Child 2')).toBeInTheDocument()
    expect(vi.mocked(axiosModule.default.get)).toHaveBeenCalledWith('/api/docs/outline')
  })

  it("renders 'Create new document' but not 'Manage users' for USER", async () => {
    useUser.setState({ user: mockUser, storagePrefix: '', loaded: true })
    vi.mocked(axiosModule.default.get).mockResolvedValue({ data: mockOutline })
    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>
    )
    expect(await screen.findByText('Create new document')).toBeInTheDocument()
    expect(screen.queryByText('Manage users')).not.toBeInTheDocument()
  })

  it("renders 'Create new document' and 'Manage users' for ADMIN", async () => {
    useUser.setState({ user: mockAdmin, storagePrefix: '' })
    vi.mocked(axiosModule.default.get).mockResolvedValue({ data: mockOutline })
    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>
    )
    expect(await screen.findByText('Create new document')).toBeInTheDocument()
    expect(await screen.findByText('Manage users')).toBeInTheDocument()
  })

  it("does not render 'Create new document' or 'Manage users' for VIEWER", async () => {
    useUser.setState({ user: mockViewer, storagePrefix: '' })
    vi.mocked(axiosModule.default.get).mockResolvedValue({ data: mockOutline })
    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>
    )
    expect(screen.queryByText('Create new document')).not.toBeInTheDocument()
    expect(screen.queryByText('Manage users')).not.toBeInTheDocument()
  })

  it('shows login link when not logged in', async () => {
    useUser.setState({ user: null, storagePrefix: '' })
    vi.mocked(axiosModule.default.get).mockResolvedValue({ data: mockOutline })
    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>
    )
    expect(await screen.findByText('Log in')).toBeInTheDocument()
  })

  it('shows logout link and username when logged in', async () => {
    useUser.setState({ user: mockUser, storagePrefix: '' })
    vi.mocked(axiosModule.default.get).mockResolvedValue({ data: mockOutline })
    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>
    )
    expect(await screen.findByText(/Logged in as/i)).toBeInTheDocument()
    expect(await screen.findByText('Log out')).toBeInTheDocument()
    expect(await screen.findByText(mockUser.username)).toBeInTheDocument()
  })

  it('toggles child nodes when clicking chevron', async () => {
    useUser.setState({ user: mockUser, storagePrefix: '' })
    vi.mocked(axiosModule.default.get).mockResolvedValue({ data: mockOutline })
    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>
    )
    // Wait for outline to render
    const chevron = await screen.findAllByRole('button', {
      name: /toggle children/i,
    })
    expect(screen.queryByText('Grandchild')).not.toBeVisible()
    fireEvent.click(chevron[0])
    await waitFor(() => {
      expect(screen.getByText('Grandchild')).toBeVisible()
    })
  })

  it('uses cached outline if not expired', async () => {
    useUser.setState({ user: mockUser, storagePrefix: 'test-' })
    localStorage.setItem(
      'test-outline',
      JSON.stringify({ data: mockOutline, timestamp: Date.now() })
    )
    vi.mocked(axiosModule.default.get).mockResolvedValue({ data: mockOutline })
    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>
    )
    expect(await screen.findByText('Child 1')).toBeInTheDocument()
    expect(screen.queryByText('id: 999')).not.toBeInTheDocument()
    expect(vi.mocked(axiosModule.default.get)).not.toHaveBeenCalled()
  })

  it('fetches outline if cache is expired', async () => {
    useUser.setState({ user: mockUser, storagePrefix: 'test-' })
    localStorage.setItem(
      'test-outline',
      JSON.stringify({
        data: {
          id: 999,
          title: 'Old',
          urlpath: '',
          public: true,
          children: [],
        },
        timestamp: Date.now() - 1000 * 60 * 60 * 25,
      })
    )
    vi.mocked(axiosModule.default.get).mockResolvedValue({ data: mockOutline })
    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>
    )
    expect(vi.mocked(axiosModule.default.get)).toHaveBeenCalledWith('/api/docs/outline')
    expect(await screen.findByText('Child 1')).toBeInTheDocument()
  })

  it('highlights active route', async () => {
    useUser.setState({ user: mockUser, storagePrefix: '' })
    vi.mocked(axiosModule.default.get).mockResolvedValue({ data: mockOutline })
    render(
      <MemoryRouter initialEntries={['/child-1']}>
        <Sidebar />
      </MemoryRouter>
    )
    expect((await screen.findByText('Child 1')).parentElement).toHaveClass('active')
    expect(screen.queryByText('Child 2')?.parentElement).not.toHaveClass('active')
    expect(screen.queryByText('Grandchild')?.parentElement).not.toHaveClass('active')
  })
})
