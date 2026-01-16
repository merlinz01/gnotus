import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import AdminPage from './AdminPage'
import useUser from '../stores/user'
import useConfig from '../stores/config'
import Role from '../types/role'

const navigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return {
    ...actual,
    useNavigate: () => navigate,
  }
})

const mockAdmin = {
  id: 1,
  username: 'adminuser',
  role: Role.ADMIN,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  is_active: true,
}

const mockUser = {
  id: 2,
  username: 'regularuser',
  role: Role.USER,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  is_active: true,
}

describe('AdminPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useConfig.setState({
      config: { site_name: 'Test Site' },
      loaded: true,
    })
  })

  it('renders admin page for admin user', () => {
    useUser.setState({ user: mockAdmin, loaded: true })
    render(
      <MemoryRouter>
        <AdminPage />
      </MemoryRouter>
    )
    expect(screen.getByText('Administration')).toBeInTheDocument()
    expect(screen.getByText('Users')).toBeInTheDocument()
    expect(screen.getByText('Uploads')).toBeInTheDocument()
  })

  it('has links to users and uploads pages', () => {
    useUser.setState({ user: mockAdmin, loaded: true })
    render(
      <MemoryRouter>
        <AdminPage />
      </MemoryRouter>
    )
    expect(screen.getByRole('link', { name: /users/i })).toHaveAttribute('href', '/_users')
    expect(screen.getByRole('link', { name: /uploads/i })).toHaveAttribute('href', '/_uploads')
  })

  it('redirects non-admin users to home', () => {
    useUser.setState({ user: mockUser, loaded: true })
    render(
      <MemoryRouter>
        <AdminPage />
      </MemoryRouter>
    )
    expect(navigate).toHaveBeenCalledWith('/')
  })

  it('redirects unauthenticated users to home', () => {
    useUser.setState({ user: null, loaded: true })
    render(
      <MemoryRouter>
        <AdminPage />
      </MemoryRouter>
    )
    expect(navigate).toHaveBeenCalledWith('/')
  })
})
