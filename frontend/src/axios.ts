import axiosModule from 'axios'

const axios = axiosModule.create({
  baseURL: window.location.origin,
  xsrfCookieName: 'csrftoken',
  xsrfHeaderName: 'x-csrftoken',
})

export default axios

export function getErrorMessage(error: unknown): string {
  if (axiosModule.isAxiosError(error)) {
    if (error.response) {
      const detail = error.response.data?.detail
      if (typeof detail === 'string') {
        return detail
      }
      if (Array.isArray(detail) && detail.length > 0) {
        return detail[0]?.msg || String(detail[0])
      }
    }
  }
  return String(error)
}
