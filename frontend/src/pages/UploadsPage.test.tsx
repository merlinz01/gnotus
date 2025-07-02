import { vi } from 'vitest'
import UploadsPage from './UploadsPage'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { DEFAULT_PAGE_SIZE } from '../types/pagination'
import useUser from '../stores/user'
import axios from '../axios'
import Role from '../types/role'
import useConfig from '../stores/config'

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
const mockUploads = [
  {
    id: 1,
    filename: 'testfile.txt',
    size: 1234,
    created_at: '2023-01-01T00:00:00Z',
    updated_at: '2023-01-01T00:00:00Z',
    public: true,
  },
  {
    id: 2,
    filename: 'anotherfile.txt',
    size: 5678,
    created_at: '2023-01-02T00:00:00Z',
    updated_at: '2023-01-02T00:00:00Z',
    public: false,
  },
]

describe('UploadsPage', () => {
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
        is_active: true,
      },
      loaded: true,
    })
    useConfig.setState({
      config: {
        site_name: 'Test Site',
        site_description: 'A test site for uploads',
      },
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

  it('fetches and displays uploads', async () => {
    vi.mocked(axios.get).mockResolvedValueOnce({
      data: { items: mockUploads, total: mockUploads.length, page: 1, size: DEFAULT_PAGE_SIZE },
    })
    render(<UploadsPage />)
    expect(screen.getByText('Uploads')).toBeInTheDocument()
    expect(await screen.findByText('testfile.txt')).toBeInTheDocument()
    expect(screen.getByText('anotherfile.txt')).toBeInTheDocument()
    expect(axios.get).toHaveBeenCalledWith('/api/uploads/', {
      params: { size: DEFAULT_PAGE_SIZE, page: 1 },
    })
  })

  it('handles loading state', () => {
    let resolvePromise: (value?: unknown) => void
    const promise = new Promise((resolve) => {
      resolvePromise = resolve
    })
    vi.mocked(axios.get).mockImplementationOnce(() => promise)
    render(<UploadsPage />)
    expect(screen.getByRole('status')).toHaveClass('loading-spinner')
    expect(screen.getByText('Loading uploads...')).toBeInTheDocument()
    resolvePromise!({ data: { items: [], total: 0, page: 1, size: DEFAULT_PAGE_SIZE } })
    waitFor(() => {
      expect(screen.queryByRole('status')).not.toBeInTheDocument()
      expect(screen.queryByText('Loading uploads...')).not.toBeInTheDocument()
    })
  })

  it('handles fetch errors', async () => {
    vi.mocked(axios.get).mockRejectedValueOnce(new Error('Network Error'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<UploadsPage />)
    expect(
      await screen.findByText('Failed to fetch uploads: Error: Network Error')
    ).toBeInTheDocument()
    expect(screen.queryByText('testfile.txt')).not.toBeInTheDocument()
  })

  it('handles empty uploads', async () => {
    vi.mocked(axios.get).mockResolvedValueOnce({
      data: { items: [], total: 0, page: 1, size: DEFAULT_PAGE_SIZE },
    })
    render(<UploadsPage />)
    expect(await screen.findByText('No uploads found.')).toBeInTheDocument()
  })

  it('updates document title', async () => {
    render(<UploadsPage />)
    expect(document.title).toBe('Uploads - Test Site')
    await waitFor(() => expect(document.title).toBe('Uploads - Test Site'))
  })

  it('handles pagination', async () => {
    vi.mocked(axios.get).mockResolvedValueOnce({
      data: { items: mockUploads, total: mockUploads.length, page: 1, size: DEFAULT_PAGE_SIZE },
    })
    render(<UploadsPage />)
    expect(await screen.findByText('Page 1 of 1 (2 items)')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled()
  })

  it('renders download and view links', async () => {
    vi.mocked(axios.get).mockResolvedValueOnce({
      data: {
        items: [mockUploads[0]],
        total: 1,
        page: 1,
        size: DEFAULT_PAGE_SIZE,
      },
    })
    render(<UploadsPage />)
    expect(await screen.findByTitle('Download')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'View' })).toHaveAttribute(
      'href',
      '/api/uploads/1/download/testfile.txt?download=false'
    )
    expect(screen.getByRole('link', { name: 'Download' })).toHaveAttribute(
      'href',
      '/api/uploads/1/download/testfile.txt'
    )
  })

  it('renders public/private status', async () => {
    vi.mocked(axios.get).mockResolvedValueOnce({
      data: { items: mockUploads, total: mockUploads.length, page: 1, size: DEFAULT_PAGE_SIZE },
    })
    render(<UploadsPage />)
    expect((await screen.findAllByText('Public'))[1]).toBeInTheDocument()
    expect(screen.getByText('Private')).toBeInTheDocument()
  })

  it('deletes an upload', async () => {
    const deleteMock = vi.fn().mockResolvedValueOnce({ status: 204 })
    vi.mocked(axios.delete).mockImplementation(deleteMock)
    vi.mocked(axios.get).mockResolvedValueOnce({
      data: { items: [mockUploads[0]], total: 1, page: 1, size: DEFAULT_PAGE_SIZE },
    })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<UploadsPage />)
    const deleteButton = await screen.findByRole('button', { name: 'Delete' })
    deleteButton.click()
    await waitFor(() => expect(deleteMock).toHaveBeenCalled())
    expect(screen.queryByText('testfile.txt')).not.toBeInTheDocument()
    expect(window.confirm).toHaveBeenCalledWith(
      'Are you sure you want to delete this upload? This action cannot be undone.'
    )
  })

  it('edits an upload', async () => {
    const editMock = vi.fn().mockResolvedValueOnce({
      data: { ...mockUploads[0], filename: 'updatedfile.txt' },
    })
    vi.mocked(axios.put).mockImplementation(editMock)
    vi.mocked(axios.get).mockResolvedValueOnce({
      data: { items: [mockUploads[0]], total: 1, page: 1, size: DEFAULT_PAGE_SIZE },
    })
    render(<UploadsPage />)
    const editButton = await screen.findByRole('button', { name: 'Edit' })
    editButton.click()
    await waitFor(() => expect((screen.getByRole('dialog') as HTMLDialogElement).open))
    expect(await screen.findByText('Edit Upload')).toBeInTheDocument()
    const input = screen.getAllByLabelText('Filename', { selector: '#edit-upload-filename' })[0]
    expect(input).toBeInTheDocument()
    expect(input).toHaveValue('testfile.txt')
    fireEvent.change(input, { target: { value: 'updatedfile.txt' } })
    const publicCheckbox = screen.getAllByLabelText('Public', {
      selector: '#edit-upload-public',
    })[0]
    expect(publicCheckbox).toBeInTheDocument()
    expect(publicCheckbox).toBeChecked()
    vi.mocked(axios.get).mockResolvedValueOnce({
      data: {
        items: [
          {
            ...mockUploads[0],
            filename: 'updatedfile.txt',
            public: false,
          },
        ],
        total: 0,
        page: 1,
        size: DEFAULT_PAGE_SIZE,
      },
    })
    fireEvent.click(publicCheckbox)
    const saveButton = screen.getByRole('button', { name: 'Save' })
    saveButton.click()
    await waitFor(() => expect(editMock).toHaveBeenCalled())
    expect(editMock).toHaveBeenCalledWith('/api/uploads/1', {
      filename: 'updatedfile.txt',
      public: false,
    })
    expect(screen.queryByText('testfile.txt')).not.toBeInTheDocument()
  })

  it('uploads a new file', async () => {
    vi.mocked(axios.get).mockResolvedValueOnce({
      data: { items: mockUploads, total: mockUploads.length, page: 1, size: DEFAULT_PAGE_SIZE },
    })
    vi.mocked(axios.get).mockResolvedValueOnce({
      data: { items: [], total: 0, page: 1, size: DEFAULT_PAGE_SIZE },
    })
    vi.mocked(axios.post).mockResolvedValueOnce({
      data: { ...mockUploads[0], id: 3, filename: 'newfile.txt' },
    })
    render(<UploadsPage />)
    const fileInput = screen.getByLabelText('File')
    const file = new File(['test content'], 'newfile.txt', { type: 'text/plain' })
    fireEvent.change(fileInput, { target: { files: [file] } })
    const form = screen.getByTestId('new-upload-form') as HTMLFormElement
    fireEvent.submit(form)
    await waitFor(() => expect(axios.post).toHaveBeenCalled())
    expect(axios.post).toHaveBeenCalledWith('/api/uploads/', expect.any(FormData), {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  })
})
