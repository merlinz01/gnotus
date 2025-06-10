import { render, screen } from '@testing-library/react'
import TableSkeleton from './TableSkeleton'

describe('TableSkeleton', () => {
  it('renders the correct number of rows', () => {
    render(
      <table>
        <tbody>
          <TableSkeleton width={3} height={5} />
        </tbody>
      </table>
    )
    const rows = screen.getAllByRole('row')
    expect(rows).toHaveLength(5)
  })

  it('renders each row with a single cell spanning the correct number of columns', () => {
    render(
      <table>
        <tbody>
          <TableSkeleton width={4} height={2} />
        </tbody>
      </table>
    )
    const cells = screen.getAllByRole('cell')
    expect(cells).toHaveLength(2)
    cells.forEach((cell) => {
      expect(cell).toHaveAttribute('colspan', '4')
    })
  })

  it('renders skeleton divs with correct class and height', () => {
    render(
      <table>
        <tbody>
          <TableSkeleton width={2} height={1} />
        </tbody>
      </table>
    )
    const skeletonDiv = screen.getByRole('cell').querySelector('.skeleton')
    expect(skeletonDiv).toHaveClass('h-6')
    expect(skeletonDiv).toHaveClass('w-full')
  })

  it('renders nothing if height is 0', () => {
    render(
      <table>
        <tbody>
          <TableSkeleton width={2} height={0} />
        </tbody>
      </table>
    )
    expect(screen.queryAllByRole('row')).toHaveLength(0)
  })
})
