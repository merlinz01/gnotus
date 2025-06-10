import { render, screen, waitFor } from '@testing-library/react'
import App from './App'
import useConfig, { DEFAULT_CONFIG } from './stores/config'
import axios from './axios'
import { MemoryRouter } from 'react-router-dom'
import useUser from './stores/user'

vi.mock('./components/Sidebar', () => ({
  __esModule: true,
  default: () => <div data-testid="sidebar" />,
}))
vi.mock('./components/Header', () => ({
  __esModule: true,
  default: () => <header role="banner">Header</header>,
}))
vi.mock('./Routes', () => ({
  __esModule: true,
  default: () => <main>Main</main>,
}))
vi.mock('./axios', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./axios')>()),
  default: {
    get: vi.fn(),
  },
}))

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useConfig.setState({
      config: DEFAULT_CONFIG,
      loaded: true,
    })
    useUser.setState({
      user: null,
      loaded: true,
    })
    vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
      media: '',
      onchange: null,
    } as MediaQueryList)
  })

  function renderApp() {
    return render(
      <MemoryRouter>
        <App />
      </MemoryRouter>
    )
  }

  it('renders the sidebar', () => {
    renderApp()
    waitFor(() => {
      expect(screen.getByTestId('sidebar')).toBeInTheDocument()
    })
  })
  it('renders the header', () => {
    renderApp()
    waitFor(() => {
      expect(screen.getByRole('banner')).toBeInTheDocument()
    })
  })
  it('fetches config on mount', async () => {
    vi.mocked(axios.get).mockResolvedValueOnce({
      data: DEFAULT_CONFIG,
      status: 200,
    })
    useConfig.setState({
      config: DEFAULT_CONFIG,
      loaded: false,
    })
    renderApp()
    await waitFor(() => {
      expect(axios.get).toHaveBeenCalledWith('/api/config.json')
    })
  })
  it('renders loading spinner while fetching config', () => {
    useConfig.setState({
      config: DEFAULT_CONFIG,
      loaded: false,
    })
    vi.mocked(axios.get).mockReturnValue(new Promise(() => {}))
    renderApp()
    expect(screen.getByRole('status')).toBeInTheDocument()
  })
  it('renders error message on config fetch failure', async () => {
    useConfig.setState({
      config: DEFAULT_CONFIG,
      loaded: false,
    })
    vi.mocked(axios.get).mockRejectedValue(new Error('Config fetch failed'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    renderApp()
    await waitFor(() => {
      expect(screen.getByText(/failed to load site configuration/i)).toBeInTheDocument()
    })
  })
})
