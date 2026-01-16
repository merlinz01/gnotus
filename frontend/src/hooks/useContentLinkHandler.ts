import { useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

export default function useContentLinkHandler() {
  const navigate = useNavigate()
  const location = useLocation()

  return useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const target = event.target as HTMLAnchorElement
      if (target.tagName === 'A' && target.href) {
        if (target.href.startsWith(window.location.origin)) {
          event.preventDefault()
          const path = target.pathname + target.search + target.hash
          if (path !== location.pathname + location.search + location.hash) {
            navigate(path)
          }
        }
      }
    },
    [navigate, location]
  )
}
