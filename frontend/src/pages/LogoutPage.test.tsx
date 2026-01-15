import { render, screen, waitFor } from '@testing-library/react'
import LogoutPage from './LogoutPage'
import { vi } from 'vitest'
import axios from '../axios'

// Mocks
vi.mock('../axios', () => ({
  default: {
    post: vi.fn(),
  },
}))
const mockNavigate = vi.fn()
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}))

describe('LogoutPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.title = ''
  })

  it('sets document title on mount', async () => {
    vi.mocked(axios.post).mockResolvedValue({ data: {} })
    render(<LogoutPage />)
    expect(document.title).toBe('Logging out - Gnotus')
    await waitFor(() => expect(axios.post).toHaveBeenCalled())
  })

  it('calls logout API and navigates on success', async () => {
    vi.mocked(axios.post).mockResolvedValue({ data: {} })
    render(<LogoutPage />)
    await waitFor(() => {
      expect(axios.post).toHaveBeenCalledWith('/api/auth/logout')
      expect(mockNavigate).toHaveBeenCalledWith('/')
    })
  })

  it('shows error message on API failure', async () => {
    vi.mocked(axios.post).mockRejectedValue(new Error('Logout failed'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<LogoutPage />)
    await waitFor(() => {
      expect(
        screen.getByText('An error occurred while trying to log out. Please try again later.')
      ).toBeInTheDocument()
    })
  })

  it('shows loading spinner while loading', async () => {
    let resolvePromise: () => void
    const promise = new Promise<void>((resolve) => {
      resolvePromise = resolve
    })
    vi.mocked(axios.post).mockReturnValue(promise)
    render(<LogoutPage />)
    expect(screen.getByRole('status', { hidden: true })).toBeInTheDocument()
    resolvePromise!()
  })
})
