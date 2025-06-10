import type { PaginationParams } from '../types/pagination'
export default function Pagination({
  params,
  setParams,
  total,
  pageSizeOptions = [1, 2, 5, 10, 20, 50, 100],
}: {
  params: PaginationParams
  setParams: (params: PaginationParams) => void
  total: number
  pageSizeOptions?: number[]
}) {
  let totalPages = Math.ceil(total / params.size)
  if (params.size === -1) {
    totalPages = 1
    if (total === 0) {
      totalPages = 0
    }
  }
  const handlePageChange = (newPage: number) => {
    setParams({ ...params, page: newPage })
  }
  const handleSizeChange = (newSize: number) => {
    setParams({ ...params, size: newSize, page: 1 })
  }

  return (
    <div className="flex items-center justify-between p-4">
      <div>
        <span>
          Page {params.page} of {totalPages} ({total} items)
        </span>
      </div>
      <div className="flex items-center space-x-2">
        <select
          value={params.size}
          onChange={(e) => handleSizeChange(Number(e.target.value))}
          className="select select-sm w-20 outline-none!"
        >
          <option value="-1">All</option>
          {pageSizeOptions.map((size) => (
            <option key={size}>{size}</option>
          ))}
        </select>
        <span className="text-sm">items per page</span>
        <button
          disabled={params.page <= 1}
          onClick={() => handlePageChange(params.page - 1)}
          className="btn btn-sm"
        >
          Previous
        </button>
        <button
          disabled={params.page >= totalPages}
          onClick={() => handlePageChange(params.page + 1)}
          className="btn btn-sm"
        >
          Next
        </button>
      </div>
    </div>
  )
}
