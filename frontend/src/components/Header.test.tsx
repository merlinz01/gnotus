import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, screen } from '@testing-library/react'
import Header from './Header'
import { MemoryRouter } from 'react-router-dom'
import useConfig from '../stores/config'

vi.mock('./SearchBox', () => ({
  default: () => <div>Search Box Mock</div>,
}))

const mockConfig = { site_name: 'Test Site', site_description: 'A test site' }

function renderHeader() {
  return render(
    <MemoryRouter>
      <input type="checkbox" className="drawer-toggle" name="drawer-toggle" id="drawer-toggle" />
      <Header />
    </MemoryRouter>
  )
}

describe('Header', () => {
  beforeEach(() => {
    useConfig.setState({ config: mockConfig, loaded: true })
  })

  afterEach(() => {
    useConfig.setState({ config: mockConfig, loaded: false })
  })

  it('renders the site name', () => {
    renderHeader()
    expect(screen.getByText(mockConfig.site_name)).toBeInTheDocument()
  })

  it('renders the site logo', () => {
    renderHeader()
    expect(screen.getByAltText('Site logo')).toBeInTheDocument()
  })

  it('toggles the menu on button click', () => {
    renderHeader()
    const menuButton = screen.getByTitle('Toggle drawer')
    fireEvent.click(menuButton)
    expect(screen.getByRole('checkbox')).toBeChecked()
  })
})
