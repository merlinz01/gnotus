import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import SearchBox from './SearchBox'
import { vi } from 'vitest'
import useUser from '../stores/user'
import Role from '../types/role'
import axios from '../axios'

// Mock dependencies
vi.mock('../axios', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../axios')>()),
  default: {
    post: vi.fn(),
  },
}))
const navigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => (
    <a href={to}>{children}</a>
  ),
}))
vi.mock('dompurify', () => ({
  __esModule: true,
  default: { sanitize: (s: string) => s },
}))

const mockUser = {
  id: 1,
  username: 'testuser',
  role: Role.ADMIN,
  created_at: '2023-01-01T00:00:00Z',
  updated_at: '2023-01-01T00:00:00Z',
}

const mockSearchResults = [
  { title: 'Result 1', urlpath: 'test/result1', text: 'Description 1', public: true },
  { title: 'Result 2', urlpath: 'test/result2', text: 'Description 2', public: true },
  {
    title: 'Result 3 <em class="search-highlight">title highlighted</em>',
    urlpath: 'test/result3',
    text: 'Description 3 <em class="search-highlight">text highlighted</em>',
    public: true,
  },
]

describe('SearchBox', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    vi.clearAllMocks()
    useUser.setState({
      user: mockUser,
      loaded: true,
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

  it('renders search button', () => {
    render(<SearchBox />)
    expect(screen.getByRole('button', { name: /search/i })).toBeInTheDocument()
  })

  it('opens modal on button click', async () => {
    render(<SearchBox />)
    fireEvent.click(screen.getByRole('button', { name: /search/i }))
    await waitFor(() => {
      expect((document.getElementById('doc-search-modal') as HTMLDialogElement | null)?.open).toBe(
        true
      )
    })
  })

  it('shows loading spinner and fetches results', async () => {
    vi.mocked(axios.post).mockResolvedValueOnce({ data: { results: mockSearchResults } })
    render(<SearchBox />)
    fireEvent.click(screen.getByRole('button', { name: /search/i }))
    const input = screen.getByPlaceholderText(/search/i)
    fireEvent.change(input, { target: { value: 'abc' } })
    expect(await screen.findByRole('status')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByText('Result 1')).toBeInTheDocument()
    })
  })

  it('shows error message on fetch failure', async () => {
    vi.mocked(axios.post).mockRejectedValueOnce(new Error('fail'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<SearchBox />)
    fireEvent.click(screen.getByRole('button', { name: /search/i }))
    const input = screen.getByPlaceholderText(/search/i)
    fireEvent.change(input, { target: { value: 'abc' } })
    await waitFor(() => {
      expect(screen.getByText(/failed to retrieve search results/i)).toBeInTheDocument()
    })
  })

  it('shows "No results" when search returns empty', async () => {
    vi.mocked(axios.post).mockResolvedValueOnce({ data: { results: [] } })
    render(<SearchBox />)
    fireEvent.click(screen.getByRole('button', { name: /search/i }))
    const input = screen.getByPlaceholderText(/search/i)
    fireEvent.change(input, { target: { value: 'abc' } })
    await waitFor(() => {
      expect(screen.getByText(/no results/i)).toBeInTheDocument()
    })
  })

  it('clears input when clear button is clicked', async () => {
    render(<SearchBox />)
    fireEvent.click(screen.getByRole('button', { name: /search/i }))
    const input = screen.getByPlaceholderText(/search/i)
    fireEvent.change(input, { target: { value: 'abc' } })
    await waitFor(() => {
      expect(input).toHaveValue('abc')
    })
    const clearBtn = screen.getByTitle(/clear search/i)
    fireEvent.click(clearBtn)
    expect(input).toHaveValue('')
  })

  it('shows private badge for non-public results', async () => {
    vi.mocked(axios.post).mockResolvedValue({
      data: {
        results: [{ title: 'Test Doc', urlpath: 'test/doc', text: 'Secret info', public: false }],
      },
    })
    await axios.post('') // For some reason, this is needed to make it work when running from the terminal
    render(<SearchBox />)
    fireEvent.click(screen.getByRole('button', { name: /search/i }))
    const input = screen.getByPlaceholderText(/search/i)
    fireEvent.change(input, { target: { value: 'abc' } })
    await waitFor(() => {
      expect(vi.mocked(axios.post)).toHaveBeenCalledWith('/api/docs/search', {
        query: 'abc',
      })
    })
    await waitFor(() => {
      expect(screen.getByText(/secret/i)).toBeInTheDocument()
    })
    await waitFor(() => {
      expect(screen.getByText(/private/i)).toBeInTheDocument()
    })
  })

  it('closes modal when backdrop is clicked', async () => {
    render(<SearchBox />)
    fireEvent.click(screen.getByRole('button', { name: /search/i }))
    const closeBtn = screen.getByText(/close/i)
    fireEvent.click(closeBtn)
    await waitFor(() => {
      expect((document.getElementById('doc-search-modal') as HTMLDialogElement | null)?.open).toBe(
        false
      )
    })
  })
})
