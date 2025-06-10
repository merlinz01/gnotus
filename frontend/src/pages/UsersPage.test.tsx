import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import UsersPage from './UsersPage'
import { vi } from 'vitest'
import Role from '../types/role'
import axios from '../axios'
import useUser from '../stores/user'
import { DEFAULT_PAGE_SIZE } from '../types/pagination'

vi.mock('../axios', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../axios')>()),
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}))
const navigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  return {
    ...(await importOriginal<typeof import('react-router-dom')>()),
    useNavigate: () => navigate,
    Link: ({ to, children }: { to: string; children: React.ReactNode }) => (
      <a href={to}>{children}</a>
    ),
  }
})

const mockUsers = [
  {
    id: 1,
    username: 'admin',
    role: Role.ADMIN,
    created_at: '2023-01-01T00:00:00Z',
    updated_at: '2023-01-01T00:00:00Z',
  },
  {
    id: 2,
    username: 'testuser',
    role: Role.USER,
    created_at: '2023-01-02T00:00:00Z',
    updated_at: '2023-01-02T00:00:00Z',
  },
]

describe('UsersPage', () => {
  beforeEach(() => {
    document.title = ''
    vi.clearAllMocks()
    useUser.setState({
      user: {
        id: 1,
        username: 'testuser',
        role: Role.ADMIN,
        created_at: '2023-01-01T00:00:00Z',
        updated_at: '2023-01-01T00:00:00Z',
      },
      loaded: true,
    })
    vi.mocked(axios.get).mockResolvedValueOnce({
      data: { items: mockUsers },
    })
    // Until https://github.com/jsdom/jsdom/pull/3403
    HTMLDialogElement.prototype.show = function () {
      this.open = true
    }
    HTMLDialogElement.prototype.showModal = function () {
      this.open = true
    }
    HTMLDialogElement.prototype.close = function () {
      this.open = false
    }
  })

  it('renders users table and Add User button', async () => {
    render(<UsersPage />)
    expect(screen.getByText('Users')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add User' })).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByText('admin')).toBeInTheDocument()
      expect(screen.getByText('testuser')).toBeInTheDocument()
    })
  })

  it('opens Add User dialog and submits new user', async () => {
    vi.mocked(axios.get).mockResolvedValueOnce({ data: { items: mockUsers } })
    vi.mocked(axios.post).mockResolvedValueOnce({ data: {} })
    render(<UsersPage />)
    fireEvent.click(screen.getByRole('button', { name: /add user/i }))
    const dialog = document.getElementById('user_edit_dialog') as HTMLDialogElement
    waitFor(() => {
      expect(dialog?.open).toBe(true)
    })

    fireEvent.change(screen.getByPlaceholderText('Username'), {
      target: { value: 'newuser' },
    })
    fireEvent.change(screen.getByLabelText('Role'), {
      target: { value: Role.USER },
    })
    fireEvent.change(screen.getByPlaceholderText('Password'), {
      target: { value: 'password123' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => {
      expect(dialog.open).toBe(false)
    })
    expect(axios.post).toHaveBeenCalledWith('/api/users/', {
      username: 'newuser',
      role: Role.USER,
      password: 'password123',
    })
  })

  it('opens Edit User dialog and submits changes', async () => {
    vi.mocked(axios.get).mockResolvedValueOnce({ data: { items: mockUsers } })
    vi.mocked(axios.put).mockResolvedValueOnce({ data: {} })
    render(<UsersPage />)
    await waitFor(() => screen.getByText('admin'))
    fireEvent.click(screen.getAllByRole('button', { name: /edit/i })[0])
    const dialog = document.getElementById('user_edit_dialog') as HTMLDialogElement
    expect(dialog?.open).toBe(true)

    fireEvent.change(screen.getByPlaceholderText('Username'), {
      target: { value: 'admin2' },
    })
    fireEvent.change(screen.getByLabelText('Role'), {
      target: { value: Role.ADMIN },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => {
      expect(dialog.open).toBe(false)
    })
    expect(axios.put).toHaveBeenCalledWith('/api/users/1', {
      username: 'admin2',
      role: Role.ADMIN,
    })
  })

  it('opens Change Password dialog and handles password mismatch', async () => {
    render(<UsersPage />)
    await waitFor(() => screen.getByText('admin'))
    fireEvent.click(screen.getAllByRole('button', { name: /password/i })[0])
    const dialog = document.getElementById('change_password_dialog') as HTMLDialogElement
    expect(dialog?.open).toBe(true)

    fireEvent.change(screen.getByPlaceholderText('Enter new password'), {
      target: { value: 'newpass' },
    })
    fireEvent.change(screen.getByPlaceholderText('Confirm new password'), {
      target: { value: 'different' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Change Password' }))
    await waitFor(() => {
      expect(screen.getByText('Passwords do not match.')).toBeInTheDocument()
    })
  })

  it('deletes a user after confirmation', async () => {
    vi.mocked(axios.get).mockResolvedValueOnce({ data: { items: mockUsers } })
    vi.spyOn(window, 'confirm').mockImplementation(() => true)
    vi.mocked(axios.delete).mockResolvedValue({ data: {} })
    render(<UsersPage />)
    await waitFor(() => screen.getByText('testuser'))
    fireEvent.click(screen.getAllByRole('button', { name: /delete/i })[0])
    await waitFor(() => {
      expect(window.confirm).toHaveBeenCalled()
    })
    expect(axios.delete).toHaveBeenCalledWith('/api/users/1')
  })

  it('does not delete user if confirmation is cancelled', async () => {
    vi.spyOn(window, 'confirm').mockImplementation(() => false)
    vi.mocked(axios.delete).mockResolvedValueOnce({ data: {} })
    render(<UsersPage />)
    await waitFor(() => screen.getByText('testuser'))
    fireEvent.click(screen.getAllByRole('button', { name: /delete/i })[0])
    await waitFor(() => {
      expect(window.confirm).toHaveBeenCalled()
    })
    expect(axios.delete).not.toHaveBeenCalled()
  })

  it('shows loading skeleton when loading', () => {
    let resolvePromise: (d: unknown) => void
    const promise = new Promise<unknown>((resolve) => {
      resolvePromise = resolve
    })
    vi.mocked(axios.get).mockReturnValue(promise)
    render(<UsersPage />)
    expect(screen.getAllByRole('row')).toHaveLength(DEFAULT_PAGE_SIZE + 1)
    resolvePromise!({ data: { items: mockUsers } })
    waitFor(() => {
      expect(screen.getByText('admin')).toBeInTheDocument()
      expect(screen.getByText('testuser')).toBeInTheDocument()
    })
  })

  it('sets document title', async () => {
    render(<UsersPage />)
    await waitFor(() => {
      expect(document.title).toBe('Users - Gnotus')
    })
  })
})
