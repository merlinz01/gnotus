import Pagination from './Pagination'
import { type PaginationParams } from '../types/pagination'
import { render, fireEvent, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

describe('Pagination', () => {
  const defaultParams: PaginationParams = { page: 1, size: 10 }

  it('renders current page, total pages, and total items', () => {
    render(<Pagination params={defaultParams} setParams={vi.fn()} total={42} />)
    expect(screen.getByText(/Page 1 of 5 \(42 items\)/)).toBeInTheDocument()
  })

  it('calls setParams with new page when Next is clicked', () => {
    const setParams = vi.fn()
    const { getByText } = render(
      <Pagination params={defaultParams} setParams={setParams} total={42} />
    )
    fireEvent.click(getByText('Next'))
    expect(setParams).toHaveBeenCalledWith({ ...defaultParams, page: 2 })
  })

  it('calls setParams with new page when Previous is clicked', () => {
    const setParams = vi.fn()
    const params = { page: 2, size: 10 }
    const { getByText } = render(<Pagination params={params} setParams={setParams} total={42} />)
    fireEvent.click(getByText('Previous'))
    expect(setParams).toHaveBeenCalledWith({ ...params, page: 1 })
  })

  it('disables Previous button on first page', () => {
    const { getByText } = render(
      <Pagination params={defaultParams} setParams={vi.fn()} total={42} />
    )
    expect(getByText('Previous')).toBeDisabled()
  })

  it('disables Next button on last page', () => {
    const params = { page: 5, size: 10 }
    const { getByText } = render(<Pagination params={params} setParams={vi.fn()} total={42} />)
    expect(getByText('Next')).toBeDisabled()
  })

  it('calls setParams with new size and resets page to 1 when size changes', () => {
    const setParams = vi.fn()
    const { getByDisplayValue } = render(
      <Pagination params={defaultParams} setParams={setParams} total={42} />
    )
    fireEvent.change(getByDisplayValue('10'), { target: { value: '20' } })
    expect(setParams).toHaveBeenCalledWith({
      ...defaultParams,
      size: 20,
      page: 1,
    })
  })

  it("renders 'All' option and handles selecting it", () => {
    const setParams = vi.fn()
    const { getByDisplayValue, getByText } = render(
      <Pagination params={defaultParams} setParams={setParams} total={42} />
    )
    expect(getByText('All')).toBeInTheDocument()
    fireEvent.change(getByDisplayValue('10'), { target: { value: '-1' } })
    expect(setParams).toHaveBeenCalledWith({
      ...defaultParams,
      size: -1,
      page: 1,
    })
  })

  it('shows only one page if size is -1', () => {
    const params = { page: 1, size: -1 }
    const { getByText } = render(<Pagination params={params} setParams={vi.fn()} total={42} />)
    expect(getByText(/Page 1 of 1 \(42 items\)/)).toBeInTheDocument()
  })

  it('shows no pages if total is 0 and size is -1', () => {
    const params = { page: 1, size: -1 }
    const { getByText } = render(<Pagination params={params} setParams={vi.fn()} total={0} />)
    expect(getByText(/Page 1 of 0 \(0 items\)/)).toBeInTheDocument()
  })

  it('renders custom pageSizeOptions', () => {
    const pageSizeOptions = [5, 15, 25]
    const { getByText } = render(
      <Pagination
        params={defaultParams}
        setParams={vi.fn()}
        total={42}
        pageSizeOptions={pageSizeOptions}
      />
    )
    pageSizeOptions.forEach((size) => {
      expect(getByText(size.toString())).toBeInTheDocument()
    })
  })
})
