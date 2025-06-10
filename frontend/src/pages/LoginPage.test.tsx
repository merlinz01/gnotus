import { render, fireEvent, waitFor, screen } from '@testing-library/react'
import LoginPage from './LoginPage'
import { vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import axios from '../axios'
import { type AxiosResponse } from 'axios'
import Role from '../types/role'
import useUser from '../stores/user'

// Mock dependencies
vi.mock('../axios', async (importOriginal) => {
  const original = await importOriginal<typeof import('../axios')>()
  return {
    ...original,
    default: {
      post: vi.fn(),
    },
  }
})
const navigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const original = await importOriginal<typeof import('react-router-dom')>()
  return {
    ...original,
    useNavigate: () => navigate,
  }
})

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the login form', () => {
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    )
    expect(screen.getByRole('heading', { name: /Log in/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/Username/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Password/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Log in/i })).toBeInTheDocument()
  })

  it('submits the form with valid credentials', async () => {
    const mockPost = vi.mocked(axios.post)
    mockPost.mockResolvedValue({ data: {} })

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    )

    fireEvent.change(screen.getByLabelText(/Username/i), {
      target: { value: 'testuser' },
    })
    fireEvent.change(screen.getByLabelText(/Password/i), {
      target: { value: 'password123' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Log in/i }))

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith(
        '/api/auth/login',
        {
          username: 'testuser',
          password: 'password123',
        },
        expect.anything()
      )
    })
  })

  it('shows an error message on failed login', async () => {
    const mockPost = vi.mocked(axios.post)
    mockPost.mockResolvedValue({
      status: 401,
      data: { detail: 'Invalid credentials' },
    } as AxiosResponse)
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    )

    fireEvent.change(screen.getByLabelText(/Username/i), {
      target: { value: 'testuser' },
    })
    fireEvent.change(screen.getByLabelText(/Password/i), {
      target: { value: 'wrongpassword' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Log in/i }))

    expect(await screen.findByText(/Login failed: Invalid credentials/i)).toBeInTheDocument()
  })
  it('shows a generic error message on unexpected errors', async () => {
    const mockPost = vi.mocked(axios.post)
    mockPost.mockRejectedValue(new Error('Network error'))
    vi.spyOn(console, 'error').mockImplementation(() => {})

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    )

    fireEvent.change(screen.getByLabelText(/Username/i), {
      target: { value: 'testuser' },
    })
    fireEvent.change(screen.getByLabelText(/Password/i), {
      target: { value: 'password123' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Log in/i }))

    expect(await screen.findByText(/An error occurred while trying to log in/i)).toBeInTheDocument()
  })
  it('clears the password field after submission', async () => {
    const mockPost = vi.mocked(axios.post)
    mockPost.mockResolvedValue({ data: {} })
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    )
    fireEvent.change(screen.getByLabelText(/Username/i), {
      target: { value: 'testuser' },
    })
    fireEvent.change(screen.getByLabelText(/Password/i), {
      target: { value: 'password123' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Log in/i }))
    await waitFor(() => {
      expect(screen.getByLabelText(/Password/i)).toHaveValue('')
    })
  })
  it('updates the document title', () => {
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    )
    expect(document.title).toBe('Log in - Gnotus')
  })
  it('navigates to home on successful login', async () => {
    const mockPost = vi.mocked(axios.post)
    mockPost.mockResolvedValue({
      status: 200,
      data: { user: { username: 'testuser' } },
    })
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    )
    fireEvent.change(screen.getByLabelText(/Username/i), {
      target: { value: 'testuser' },
    })
    fireEvent.change(screen.getByLabelText(/Password/i), {
      target: { value: 'password123' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Log in/i }))
    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith('/')
    })
  })
  it('sets user state on successful login', async () => {
    const mockPost = vi.mocked(axios.post)
    mockPost.mockResolvedValue({
      status: 200,
      data: { user: { username: 'testuser', role: Role.ADMIN, id: 3 } },
    })
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    )
    fireEvent.change(screen.getByLabelText(/Username/i), {
      target: { value: 'testuser' },
    })
    fireEvent.change(screen.getByLabelText(/Password/i), {
      target: { value: 'password123' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Log in/i }))
    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith('/')
      const user = useUser.getState().user
      expect(user).toEqual({
        username: 'testuser',
        role: Role.ADMIN,
        id: 3,
      })
      expect(useUser.getState().loaded).toBe(true)
    })
  })
  it('sets user state to null on failed login', async () => {
    const mockPost = vi.mocked(axios.post)
    mockPost.mockResolvedValue({
      status: 401,
      data: { detail: 'Invalid credentials' },
    } as AxiosResponse)
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    )
    fireEvent.change(screen.getByLabelText(/Username/i), {
      target: { value: 'testuser' },
    })
    fireEvent.change(screen.getByLabelText(/Password/i), {
      target: { value: 'wrongpassword' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Log in/i }))
    await waitFor(() => {
      expect(navigate).not.toHaveBeenCalled()
      expect(useUser.getState().user).toBeNull()
      expect(useUser.getState().loaded).toBe(true)
    })
  })
})
