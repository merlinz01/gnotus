export interface PaginationParams {
  page: number
  size: number
}

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  size: number
}

export const EmptyPaginatedResponse = {
  items: [],
  total: 0,
  page: 1,
  size: 10,
}

export const DEFAULT_PAGE_SIZE = 10
