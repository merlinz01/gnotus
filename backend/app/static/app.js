/*
 * Client-side behavior for the server-rendered pages.
 *
 * Navigation between pages fetches a partial rendering of the target page
 * (?_partial=1) and swaps its metadata and main content into the current page.
 * Partials are cached in localStorage and shown instantly on later visits,
 * then revalidated with their ETag in the background.
 */

const CACHE_MAX_AGE = 24 * 60 * 60 * 1000
const CACHE_PRUNE_FRACTION = 0.5
const PROGRESS_DELAY = 150
const SEARCH_DELAY = 300
const SEARCH_MIN_LENGTH = 3
const COPIED_DURATION = 2000

const PREVIEW_DELAY = 400

const mobileQuery = window.matchMedia('(max-width: 750px)')
const main = document.getElementById('main')
const userId = document.body.dataset.userId
const storagePrefix = userId ? `user:${userId}:` : ''

let currentPath = location.pathname + location.search
let navigation = null

/* Utilities */

function getCookie(name) {
  const prefix = name + '='
  const cookie = document.cookie.split('; ').find((c) => c.startsWith(prefix))
  return cookie ? decodeURIComponent(cookie.slice(prefix.length)) : null
}

function setCookie(name, value) {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=31536000; samesite=lax`
}

const CSRF_ERROR = 'CSRF token is missing or invalid'

/**
 * Send a request that changes something, with the CSRF token.
 * If the token is rejected, for example because the server's secret key
 * changed, the server clears it; then get a new one and try again.
 */
async function fetchWithCsrf(url, options) {
  const send = () =>
    fetch(url, {
      ...options,
      headers: { ...options.headers, 'x-csrftoken': getCookie('csrftoken') || '' },
      credentials: 'same-origin',
    })
  const response = await send()
  if (response.status !== 403) return response
  try {
    const data = await response.clone().json()
    if (data.detail !== CSRF_ERROR) return response
  } catch {
    return response
  }
  // Any response sets a new token cookie when the request has none
  await fetch('/api/auth/user', { credentials: 'same-origin' })
  return send()
}

async function api(url, { method = 'GET', body } = {}) {
  const headers = {}
  const isForm = body instanceof FormData
  if (body !== undefined && !isForm) {
    headers['Content-Type'] = 'application/json'
  }
  const options = {
    method,
    headers,
    body: body === undefined || isForm ? body : JSON.stringify(body),
  }
  const response =
    method === 'GET'
      ? await fetch(url, { ...options, credentials: 'same-origin' })
      : await fetchWithCsrf(url, options)
  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`
    try {
      const data = await response.json()
      if (typeof data.detail === 'string') message = data.detail
      else if (Array.isArray(data.detail) && data.detail[0]?.msg) message = data.detail[0].msg
    } catch {
      // Not a JSON error response
    }
    throw new Error(message)
  }
  return response.status === 204 ? null : response.json()
}

/** Show dates in the user's locale; data-localize="datetime" includes the time. */
function localizeDates(root) {
  for (const time of root.querySelectorAll('time[data-localize]')) {
    const date = new Date(time.dateTime)
    if (isNaN(date)) continue
    time.textContent =
      time.dataset.localize === 'datetime'
        ? date.toLocaleString()
        : date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
  }
}

/** Show a button as busy while an operation runs. */
async function whileBusy(button, operation) {
  button.disabled = true
  button.classList.add('is-busy')
  try {
    return await operation()
  } finally {
    button.disabled = false
    button.classList.remove('is-busy')
  }
}

/** Show an error in the first error alert of a container, or hide it. */
function showError(container, error) {
  const alert = container.querySelector('.alert-error')
  alert.textContent = error ? error.message : ''
  alert.hidden = !error
}

/* Page cache */

function cacheKey(path) {
  return `${storagePrefix}page:${path}`
}

function readCache(path) {
  try {
    const entry = JSON.parse(localStorage.getItem(cacheKey(path)))
    if (entry && Date.now() - entry.timestamp < CACHE_MAX_AGE) {
      return entry
    }
    localStorage.removeItem(cacheKey(path))
  } catch {
    // Storage is unavailable or the entry is corrupt
  }
  return null
}

function writeCache(path, html, etag) {
  // Pages with forms that are edited for a while, like the editor, aren't cached,
  // so edits can't be lost when a cached page is replaced after revalidating
  if (!etag || html.includes('<meta name="gnotus-cache" content="no"')) return
  const value = JSON.stringify({ html, etag, timestamp: Date.now() })
  try {
    localStorage.setItem(cacheKey(path), value)
  } catch {
    // Most likely the storage quota is exceeded
    pruneCache()
    try {
      localStorage.setItem(cacheKey(path), value)
    } catch {
      // Give up; the page just won't be cached
    }
  }
}

function touchCache(path, entry) {
  writeCache(path, entry.html, entry.etag)
}

function evictCache(path) {
  try {
    localStorage.removeItem(cacheKey(path))
  } catch {
    // Storage is unavailable
  }
}

/** Remove the oldest cached pages. */
function pruneCache() {
  const entries = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key.includes('page:')) {
      try {
        entries.push([key, JSON.parse(localStorage.getItem(key)).timestamp || 0])
      } catch {
        entries.push([key, 0])
      }
    }
  }
  entries.sort((a, b) => a[1] - b[1])
  const count = Math.ceil(entries.length * CACHE_PRUNE_FRACTION)
  for (const [key] of entries.slice(0, count)) {
    localStorage.removeItem(key)
  }
}

// Data stored by the old React frontend
const LEGACY_KEY = /^(app_config|sidebar_open|(user:\d+:)?(doc:|outline))/

/** Remove cached data belonging to anyone other than the current user. */
function purgeOtherUsers() {
  try {
    const keys = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      const otherUser = key.startsWith('user:') && (!userId || !key.startsWith(storagePrefix))
      if (otherUser || LEGACY_KEY.test(key)) {
        keys.push(key)
      }
    }
    keys.forEach((key) => localStorage.removeItem(key))
  } catch {
    // Storage is unavailable
  }
}

/** Serialize the current page in the same format as a partial response. */
function serializeCurrentPage() {
  const parts = [`<title>${escapeHTML(document.title)}</title>`]
  parts.push(`<meta name="gnotus-user" content="${escapeHTML(userId)}">`)
  for (const element of document.head.querySelectorAll('[data-page-meta]')) {
    parts.push(element.outerHTML)
  }
  parts.push(`<main id="main">${main.innerHTML}</main>`)
  return parts.join('')
}

function escapeHTML(text) {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML.replaceAll('"', '&quot;')
}

/* Navigation */

function shouldIntercept(link) {
  if (!(link instanceof HTMLAnchorElement)) return false
  if (link.target && link.target !== '_self') return false
  if (link.hasAttribute('download')) return false
  const url = new URL(link.href)
  if (url.origin !== location.origin) return false
  return !url.pathname.startsWith('/api/') && !url.pathname.endsWith('.md')
}

function scrollContainer() {
  return main.querySelector('[data-scroll]')
}

function saveScroll() {
  const container = scrollContainer()
  history.replaceState({ ...history.state, scroll: container ? container.scrollTop : 0 }, '')
}

function restoreScroll(hash, scroll) {
  if (hash) {
    let id
    try {
      id = decodeURIComponent(hash.slice(1))
    } catch {
      id = hash.slice(1)
    }
    const element = document.getElementById(id)
    if (element) {
      element.scrollIntoView({ behavior: 'instant' })
      return
    }
  }
  const container = scrollContainer()
  if (container) {
    container.scrollTo({ top: scroll || 0, behavior: 'instant' })
  }
}

function parsePage(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  return {
    title: doc.title,
    meta: [...doc.head.querySelectorAll('[data-page-meta]')],
    userId: doc.querySelector('meta[name="gnotus-user"]')?.content ?? '',
    outlineVersion: doc.querySelector('meta[name="gnotus-outline-version"]')?.content,
    main: doc.getElementById('main'),
  }
}

/** Swap a parsed page into the document. */
function applyPage(page) {
  unsavedChanges = null
  pageEdited = false
  document.title = page.title
  document.head.querySelectorAll('[data-page-meta]').forEach((element) => element.remove())
  document.head.append(...page.meta)
  main.replaceChildren(...page.main.childNodes)
  localizeDates(main)
  initPage(main)
  revealInSidebar(location.pathname)
  markActiveLinks()
}

async function fetchPartial(url, etag, signal) {
  const partialURL = new URL(url)
  partialURL.hash = ''
  partialURL.searchParams.set('_partial', '1')
  const response = await fetch(partialURL, {
    headers: etag ? { 'If-None-Match': etag } : {},
    credentials: 'same-origin',
    signal,
  })
  if (response.status === 304) {
    return { notModified: true }
  }
  if (response.headers.get('X-Gnotus-Partial') !== '1') {
    throw new Error(`Unexpected response for ${url.pathname}: ${response.status}`)
  }
  const finalURL = new URL(response.url)
  finalURL.searchParams.delete('_partial')
  finalURL.hash = url.hash
  return {
    status: response.status,
    html: await response.text(),
    etag: response.headers.get('ETag'),
    url: finalURL,
  }
}

/** Get a URL if it belongs to this site, or the home page otherwise. */
function localPath(href) {
  try {
    const url = new URL(href || '/', location.origin)
    if (url.origin === location.origin) return url.href
  } catch {
    // Not a valid URL
  }
  return '/'
}

/** Load a page without client-side navigation. */
function loadPage(url, push) {
  if (push) location.assign(url.href)
  else location.replace(url.href)
}

/**
 * Show a page. Returns false if the page can't be shown in place, in which
 * case a full page load has been started instead.
 */
function showPage(html, url, { push, scroll }) {
  const page = parsePage(html)
  if (page.userId !== userId || !page.main) {
    // The session changed, so the whole page needs to be rendered again
    loadPage(url, push)
    return false
  }
  if (push) {
    history.pushState({ scroll: 0 }, '', url.href)
  } else if (url.href !== location.href) {
    history.replaceState(history.state, '', url.href)
  }
  currentPath = url.pathname + url.search
  applyPage(page)
  restoreScroll(url.hash, scroll)
  if (push) {
    ;(main.querySelector('[autofocus]') || main).focus({ preventScroll: true })
  }
  document.getElementById('page-announcer').textContent = page.title
  return page
}

async function navigate(href, { push = true, scroll = 0 } = {}) {
  const url = new URL(href, location.href)
  const path = url.pathname + url.search
  if (path !== currentPath && !confirmLeave()) return
  navigation?.abort()
  const controller = new AbortController()
  navigation = controller
  if (push) saveScroll()
  closeOverlays()

  const cached = readCache(path)
  if (cached) {
    const page = showPage(cached.html, url, { push, scroll })
    if (page) {
      // The sidebar may be older than the cached page, such as when the page
      // was cached in another tab, and it isn't updated if the page is unchanged
      updateSidebar(page.outlineVersion)
      revalidate(url, cached, controller.signal)
    }
    return
  }

  const progressTimer = setTimeout(
    () => document.documentElement.classList.add('is-loading'),
    PROGRESS_DELAY
  )
  try {
    const result = await fetchPartial(url, null, controller.signal)
    const page = showPage(result.html, result.url, { push, scroll })
    if (page) {
      updateSidebar(page.outlineVersion)
      if (result.status === 200) {
        writeCache(result.url.pathname + result.url.search, result.html, result.etag)
      }
    }
  } catch (error) {
    if (error.name === 'AbortError') return
    console.error('Navigation failed, loading the page instead:', error)
    loadPage(url, push)
  } finally {
    clearTimeout(progressTimer)
    if (navigation === controller) {
      document.documentElement.classList.remove('is-loading')
    }
  }
}

/** Check a page shown from the cache for changes, and update it if needed. */
async function revalidate(url, cached, signal) {
  const path = url.pathname + url.search
  try {
    const result = await fetchPartial(url, cached.etag, signal)
    if (result.notModified) {
      touchCache(path, cached)
      return
    }
    if (result.status === 200) {
      writeCache(result.url.pathname + result.url.search, result.html, result.etag)
    } else {
      evictCache(path)
    }
    if (currentPath !== path) return
    // Replacing the page would lose what was entered in it or in an open dialog;
    // the updated page is shown on the next visit
    if (pageEdited || main.querySelector('dialog[open]')) return
    const container = scrollContainer()
    const scroll = container ? container.scrollTop : 0
    const page = showPage(result.html, result.url, { push: false, scroll })
    if (page) {
      updateSidebar(page.outlineVersion)
    }
  } catch (error) {
    if (error.name !== 'AbortError') {
      console.warn('Failed to revalidate cached page:', error)
    }
  }
}

function closeOverlays() {
  document.getElementById('doc-search-modal').close()
  document.getElementById('drawer-toggle').checked = false
}

document.addEventListener('click', (event) => {
  if (event.defaultPrevented || event.button !== 0) return
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
  const link = event.target.closest('a[href]')
  if (!link || !shouldIntercept(link)) return
  const url = new URL(link.href)
  if (url.pathname + url.search === currentPath) {
    // Let the browser handle in-page anchors
    if (url.hash) return
    event.preventDefault()
    closeOverlays()
    restoreScroll('', 0)
    return
  }
  event.preventDefault()
  navigate(url)
})

window.addEventListener('popstate', (event) => {
  const path = location.pathname + location.search
  if (path === currentPath) {
    restoreScroll(location.hash, event.state?.scroll)
    return
  }
  if (!confirmLeave()) {
    // The history entry has already changed, so go back to the current page
    history.pushState(null, '', currentPath)
    return
  }
  unsavedChanges = null
  navigate(location.href, { push: false, scroll: event.state?.scroll })
})

/* Unsaved changes */

// Returns whether the current page has unsaved changes, if it can have any
let unsavedChanges = null
// Whether anything has been entered in the current page's forms
let pageEdited = false

for (const type of ['input', 'change']) {
  document.addEventListener(type, (event) => {
    if (main.contains(event.target)) pageEdited = true
  })
}

function confirmLeave() {
  return !unsavedChanges?.() || confirm('You have unsaved changes. Discard them?')
}

window.addEventListener('beforeunload', (event) => {
  if (unsavedChanges?.()) event.preventDefault()
})

// Remember the scroll position of each history entry
let scrollTimer = null
document.addEventListener(
  'scroll',
  (event) => {
    if (event.target !== scrollContainer()) return
    clearTimeout(scrollTimer)
    scrollTimer = setTimeout(saveScroll, 200)
  },
  { capture: true, passive: true }
)

/* Sidebar */

let sidebarRequest = null

function markActiveLinks() {
  for (const link of document.querySelectorAll(
    '#sidebar a.sidebar-link, #sidebar a.sidebar-action'
  )) {
    link.classList.toggle('active', link.pathname === location.pathname)
  }
}

/** Expand the sidebar nodes leading to the link for a path. */
function revealInSidebar(path) {
  for (const link of document.querySelectorAll('#sidebar a.sidebar-link')) {
    if (link.pathname === path) {
      for (let node = link.closest('details'); node; node = node.parentElement.closest('details')) {
        node.open = true
      }
    }
  }
}

/** Load the sidebar if its version differs, or always if forced. */
async function updateSidebar(version, force = false) {
  const container = document.getElementById('sidebar')
  const sidebar = container.querySelector('.sidebar')
  const current = !version || sidebar?.dataset.outlineVersion === version
  if (!force && (current || sidebarRequest === version)) {
    return
  }
  sidebarRequest = version
  try {
    const response = await fetch(
      `/_partial/sidebar?path=${encodeURIComponent(location.pathname)}`,
      {
        credentials: 'same-origin',
      }
    )
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
    const html = await response.text()
    const expanded = [...container.querySelectorAll('details[open] > summary a')].map(
      (link) => link.pathname
    )
    container.innerHTML = html
    expanded.forEach(revealInSidebar)
    revealInSidebar(location.pathname)
    markActiveLinks()
  } catch (error) {
    console.warn('Failed to update the sidebar:', error)
  } finally {
    sidebarRequest = null
  }
}

function toggleSidebar() {
  if (mobileQuery.matches) {
    const toggle = document.getElementById('drawer-toggle')
    toggle.checked = !toggle.checked
    return
  }
  const open = document.body.dataset.sidebar !== 'open'
  document.body.dataset.sidebar = open ? 'open' : 'closed'
  setCookie('sidebar_open', open ? '1' : '0')
}

mobileQuery.addEventListener('change', () => {
  document.getElementById('drawer-toggle').checked = false
})

/* Theme */

function toggleTheme() {
  const mode = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'
  document.documentElement.setAttribute('data-theme', mode)
  localStorage.setItem('color-mode', mode)
}

/* Search */

const searchDialog = document.getElementById('doc-search-modal')
const searchInput = document.getElementById('doc-search-input')
const searchResults = document.getElementById('doc-search-results')
const searchSpinner = searchDialog.querySelector('.search-spinner')
const searchIcon = searchDialog.querySelector('.search-field-icon')
const searchClear = searchDialog.querySelector('.search-clear')
let searchTimer = null
let searchQuery = ''

function openSearch() {
  searchDialog.showModal()
  searchInput.focus()
  searchInput.select()
}

function setSearchLoading(loading) {
  searchSpinner.hidden = !loading
  searchIcon.classList.toggle('visually-hidden', loading)
}

function showSearchMessage(text, isError = false) {
  const item = document.createElement('li')
  item.className = isError ? 'search-message search-error' : 'search-message'
  item.textContent = text
  searchResults.replaceChildren(item)
}

function showSearchResults(results) {
  if (results.length === 0) {
    showSearchMessage('No results')
    return
  }
  const template = document.getElementById('search-result-template')
  searchResults.replaceChildren(
    ...results.map((result) => {
      const item = template.content.firstElementChild.cloneNode(true)
      item.querySelector('a').href = result.urlpath
      // The server escapes the result text and adds only highlight markup
      item.querySelector('strong').innerHTML = result.title
      item.querySelector('.search-result-text').innerHTML = result.text
      item.querySelector('.search-result-badge').hidden = result.public || !userId
      return item
    })
  )
}

async function runSearch(query) {
  try {
    const data = await api('/api/docs/search', { method: 'POST', body: { query } })
    if (query === searchQuery) showSearchResults(data.results)
  } catch (error) {
    console.error('Error fetching search results:', error)
    if (query === searchQuery) {
      showSearchMessage('Failed to retrieve search results. Please try again later.', true)
    }
  } finally {
    if (query === searchQuery) setSearchLoading(false)
  }
}

function onSearchInput() {
  clearTimeout(searchTimer)
  searchClear.hidden = !searchInput.value
  searchQuery = searchInput.value.trim()
  if (searchQuery.length < SEARCH_MIN_LENGTH) {
    setSearchLoading(false)
    showSearchMessage('No results')
    return
  }
  setSearchLoading(true)
  const query = searchQuery
  searchTimer = setTimeout(() => runSearch(query), SEARCH_DELAY)
}

searchInput.addEventListener('input', onSearchInput)
searchClear.addEventListener('click', () => {
  searchInput.value = ''
  onSearchInput()
  searchInput.focus()
})

// Ctrl+S saves in the editor and opens the search elsewhere
document.addEventListener('keydown', (event) => {
  if (event.key !== 's' || !(event.metaKey || event.ctrlKey)) return
  const editor = main.querySelector('form[data-form="save-doc"]')
  if (editor) {
    event.preventDefault()
    editor.requestSubmit()
  } else if (!['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)) {
    event.preventDefault()
    openSearch()
  }
})

/* Sharing */

function showCopied(element) {
  element.classList.add('is-copied')
  setTimeout(() => element.classList.remove('is-copied'), COPIED_DURATION)
}

async function shareDocument(button) {
  const dialog = document.getElementById('share_dialog')
  if (dialog) {
    dialog.showModal()
    loadShareLinks(dialog)
    return
  }
  const url = location.href
  if (navigator.share) {
    try {
      await navigator.share({
        title: button.dataset.title,
        text: `Check out this documentation: ${button.dataset.title}`,
        url,
      })
      return
    } catch (error) {
      if (error.name === 'AbortError') return
      console.warn('Share API failed:', error)
    }
  }
  try {
    await navigator.clipboard.writeText(url)
    const tooltip = button.parentElement
    tooltip.classList.add('tooltip', 'tooltip-left', 'tooltip-open')
    setTimeout(
      () => tooltip.classList.remove('tooltip', 'tooltip-left', 'tooltip-open'),
      COPIED_DURATION
    )
    showCopied(button)
  } catch (error) {
    console.error('Failed to copy link:', error)
  }
}

function setShareError(dialog, error) {
  const alert = dialog.querySelector('.share-dialog-error')
  alert.hidden = !error
  alert.textContent = error ? error.message : ''
}

function formatExpiration(expiresAt) {
  if (!expiresAt) return 'Never'
  return new Date(expiresAt).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function renderShareLinks(dialog, links) {
  const template = dialog.querySelector('.share-link-template')
  const list = dialog.querySelector('.share-links')
  dialog.querySelector('.share-dialog-empty').hidden = links.length > 0
  list.replaceChildren(
    ...links.map((link) => {
      const expired = link.expires_at !== null && new Date(link.expires_at) < new Date()
      const item = template.content.firstElementChild.cloneNode(true)
      item.dataset.id = link.id
      item.dataset.token = link.token
      item.classList.toggle('share-link-expired', expired)
      item.querySelector('.share-link-token').textContent = `${link.token.slice(0, 16)}...`
      const expiry = item.querySelector('.share-link-expiry')
      expiry.textContent = expired ? 'Expired' : `Expires: ${formatExpiration(link.expires_at)}`
      expiry.classList.toggle('share-link-expiry-expired', expired)
      item.querySelector('.share-link-views').textContent = `${link.access_count} views`
      item.querySelector('[data-action="copy-share-link"]').disabled = expired
      return item
    })
  )
}

async function loadShareLinks(dialog) {
  const loading = dialog.querySelector('.share-dialog-loading')
  loading.hidden = false
  dialog.querySelector('.share-links').replaceChildren()
  dialog.querySelector('.share-dialog-empty').hidden = true
  setShareError(dialog, null)
  try {
    const links = await api(`/api/sharelinks/?doc_id=${dialog.dataset.docId}`)
    renderShareLinks(dialog, links)
  } catch (error) {
    setShareError(dialog, error)
  } finally {
    loading.hidden = true
  }
}

async function createShareLink(button) {
  const dialog = button.closest('dialog')
  button.disabled = true
  setShareError(dialog, null)
  try {
    await api('/api/sharelinks/', {
      method: 'POST',
      body: {
        doc_id: Number(dialog.dataset.docId),
        expiration: dialog.querySelector('.share-dialog-expiration').value,
      },
    })
    await loadShareLinks(dialog)
  } catch (error) {
    setShareError(dialog, error)
  } finally {
    button.disabled = false
  }
}

async function copyShareLink(button) {
  const item = button.closest('.share-link')
  try {
    await navigator.clipboard.writeText(`${location.origin}/_share/${item.dataset.token}`)
    showCopied(button)
  } catch (error) {
    console.error('Failed to copy link:', error)
  }
}

async function deleteShareLink(button) {
  const dialog = button.closest('dialog')
  const item = button.closest('.share-link')
  button.disabled = true
  setShareError(dialog, null)
  try {
    await api(`/api/sharelinks/${item.dataset.id}`, { method: 'DELETE' })
    item.remove()
    dialog.querySelector('.share-dialog-empty').hidden =
      dialog.querySelector('.share-links').children.length > 0
  } catch (error) {
    setShareError(dialog, error)
    button.disabled = false
  }
}

/* Authentication */

async function submitLogin(form, submitter) {
  showError(form, null)
  await whileBusy(submitter, async () => {
    let message = 'An error occurred while trying to log in. Please try again later.'
    try {
      const response = await fetchWithCsrf('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: form.elements.username.value,
          password: form.elements.password.value,
        }),
      })
      if (response.ok) {
        // The whole page changes for a logged-in user, so load it from scratch
        location.assign(localPath(form.elements.next.value))
        return
      }
      if (response.status === 401) message = 'Login failed: Invalid credentials'
    } catch (error) {
      console.error('Login error:', error)
    }
    showError(form, new Error(message))
    form.elements.password.value = ''
  })
}

async function logout(element) {
  try {
    await api('/api/auth/logout', { method: 'POST' })
    location.replace('/')
  } catch (error) {
    console.error('Logout error:', error)
    element.querySelector('.loading').hidden = true
    const alert = element.querySelector('.alert')
    alert.textContent = 'An error occurred while trying to log out. Please try again later.'
    alert.hidden = false
  }
}

/* Administration */

/** Load the current page again, after changing what it shows. */
function refreshPage() {
  evictCache(currentPath)
  const container = scrollContainer()
  return navigate(location.href, { push: false, scroll: container ? container.scrollTop : 0 })
}

/** Run a change to a row of an administration table, then show the updated page. */
async function changeRow(button, operation) {
  const pageError = main.querySelector('[data-page-error]')
  if (pageError) showError(pageError.parentElement, null)
  await whileBusy(button, async () => {
    try {
      await operation()
      await refreshPage()
    } catch (error) {
      if (pageError) showError(pageError.parentElement, error)
      else console.error(error)
    }
  })
}

/** Submit a dialog's form, then close the dialog and show the updated page. */
async function submitDialog(form, submitter, operation) {
  showError(form, null)
  await whileBusy(submitter, async () => {
    try {
      await operation()
    } catch (error) {
      showError(form, error)
      return
    }
    form.closest('dialog').close()
    await refreshPage()
  })
}

function openDialogForm(id) {
  const dialog = document.getElementById(id)
  const form = dialog.querySelector('form')
  form.reset()
  showError(form, null)
  dialog.showModal()
  return form
}

function openUserDialog(row) {
  const form = openDialogForm('user_edit_dialog')
  const title = form.querySelector('.modal-title')
  title.textContent = row ? title.dataset.editTitle : title.dataset.addTitle
  form.dataset.userId = row ? row.dataset.userId : ''
  if (row) {
    form.elements.username.value = row.dataset.username
    form.elements.role.value = row.dataset.role
    form.elements.is_active.checked = row.dataset.active === 'true'
  }
  // The password is only set here for new users
  form.querySelector('.users-new-password').hidden = Boolean(row)
  form.elements.password.disabled = Boolean(row)
}

function saveUser(form, submitter) {
  const id = form.dataset.userId
  const body = {
    username: form.elements.username.value,
    role: Number(form.elements.role.value),
    is_active: form.elements.is_active.checked,
  }
  return submitDialog(form, submitter, () =>
    id
      ? api(`/api/users/${id}`, { method: 'PUT', body })
      : api('/api/users/', {
          method: 'POST',
          body: { ...body, password: form.elements.password.value },
        })
  )
}

function openPasswordDialog(button) {
  const row = button.closest('tr')
  const form = openDialogForm('change_password_dialog')
  form.dataset.userId = row.dataset.userId
  form.querySelector('.users-password-for').textContent = `For ${row.dataset.username}`
}

function changePassword(form, submitter) {
  const { old_password, new_password, confirm_password } = form.elements
  if (new_password.value !== confirm_password.value) {
    showError(form, new Error('Passwords do not match.'))
    return
  }
  return submitDialog(form, submitter, () =>
    api(`/api/users/${form.dataset.userId}/change-password`, {
      method: 'POST',
      body: { old_password: old_password.value, new_password: new_password.value },
    })
  )
}

function deleteUser(button) {
  const row = button.closest('tr')
  if (!confirm(`Are you sure you want to delete the user ${row.dataset.username}?`)) return
  return changeRow(button, () => api(`/api/users/${row.dataset.userId}`, { method: 'DELETE' }))
}

function fillFilename(input) {
  const target = document.querySelector(input.dataset.filenameInput)
  if (input.files.length > 0) target.value = input.files[0].name
}

function createUpload(form, submitter) {
  const data = new FormData(form)
  data.set('public', String(form.elements.public.checked))
  return submitDialog(form, submitter, () => api('/api/uploads/', { method: 'POST', body: data }))
}

/** Uploads attached to a document get the document's visibility. */
function updateUploadVisibility(select) {
  const form = select.form
  const inherited = select.value !== ''
  form.elements.public.disabled = inherited
  form.querySelector('.uploads-inherited-hint').hidden = !inherited
  if (inherited) {
    form.elements.public.checked = select.selectedOptions[0].dataset.public === 'true'
  }
}

function openUploadDialog(button) {
  const row = button.closest('tr')
  const form = openDialogForm('edit-upload-dialog')
  form.dataset.uploadId = row.dataset.uploadId
  form.elements.filename.value = row.dataset.filename
  form.elements.doc_id.value = row.dataset.docId
  form.elements.public.checked = row.dataset.public === 'true'
  updateUploadVisibility(form.elements.doc_id)
}

function saveUpload(form, submitter) {
  const docId = form.elements.doc_id.value
  return submitDialog(form, submitter, () =>
    api(`/api/uploads/${form.dataset.uploadId}`, {
      method: 'PUT',
      body: {
        filename: form.elements.filename.value,
        public: form.elements.public.checked,
        // 0 removes the upload from its document
        doc_id: docId ? Number(docId) : 0,
      },
    })
  )
}

function deleteUpload(button) {
  const row = button.closest('tr')
  if (!confirm('Are you sure you want to delete this upload? This action cannot be undone.')) {
    return
  }
  return changeRow(button, () => api(`/api/uploads/${row.dataset.uploadId}`, { method: 'DELETE' }))
}

const THEME_PROPERTIES = {
  primary_color: '--gnotus-primary',
  secondary_color: '--gnotus-secondary',
  primary_color_dark: '--gnotus-primary-dark',
  secondary_color_dark: '--gnotus-secondary-dark',
}

/** Show settings results; error is null on success. */
function showSettingsResult(form, error) {
  showError(form, error)
  form.querySelector('.alert-success').hidden = Boolean(error)
}

async function saveSettings(form, submitter) {
  showError(form, null)
  form.querySelector('.alert-success').hidden = true
  await whileBusy(submitter, async () => {
    try {
      const body = { site_name: form.elements.site_name.value }
      for (const key of Object.keys(THEME_PROPERTIES)) body[key] = form.elements[key].value
      const config = await api('/api/config', { method: 'PUT', body })
      // Apply the changes to the parts of the page that aren't reloaded
      for (const [key, property] of Object.entries(THEME_PROPERTIES)) {
        document.documentElement.style.setProperty(property, config[key])
      }
      document.querySelector('.app-header-title').textContent = config.site_name
      showSettingsResult(form, null)
    } catch (error) {
      showSettingsResult(form, error)
    }
  })
}

/** Keep a color picker and its text field in sync. */
function syncColor(input) {
  const other = document.querySelector(input.dataset.sync)
  if (input.type === 'color' || /^#[0-9a-f]{6}$/i.test(input.value)) {
    other.value = input.value
  }
}

function reloadIcons() {
  const src = `/api/icon?t=${Date.now()}`
  document.querySelectorAll('.settings-icon-image, .app-header-logo').forEach((img) => {
    img.src = src
  })
  document.querySelector('link[rel="icon"]').href = src
}

async function uploadIcon(input) {
  const file = input.files[0]
  if (!file) return
  const form = input.form
  const label = input.closest('label')
  label.classList.add('is-busy')
  try {
    const data = new FormData()
    data.append('file', file)
    await api('/api/icon', { method: 'POST', body: data })
    reloadIcons()
    form.querySelector('[data-action="revert-icon"]').hidden = false
    showSettingsResult(form, null)
  } catch (error) {
    showSettingsResult(form, error)
  } finally {
    label.classList.remove('is-busy')
    input.value = ''
  }
}

async function revertIcon(button) {
  const form = button.form
  await whileBusy(button, async () => {
    try {
      await api('/api/icon', { method: 'DELETE' })
      reloadIcons()
      button.hidden = true
      showSettingsResult(form, null)
    } catch (error) {
      showSettingsResult(form, error)
    }
  })
}

async function reindexDocs(form, submitter) {
  showError(form, null)
  await whileBusy(submitter, async () => {
    try {
      await api('/api/docs/reindex', { method: 'POST' })
    } catch (error) {
      showError(form, error)
      return
    }
    // Show the updated status of the index
    await refreshPage()
  })
}

async function viewRevision(button) {
  const dialog = document.getElementById('revision-modal')
  const body = dialog.querySelector('.revision-body')
  const loading = dialog.querySelector('.revision-loading')
  dialog.dataset.revisionId = button.dataset.revisionId
  body.replaceChildren()
  showError(dialog, null)
  loading.hidden = false
  dialog.showModal()
  try {
    const response = await fetch(`/_partial/revision/${button.dataset.revisionId}`, {
      credentials: 'same-origin',
    })
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
    body.innerHTML = await response.text()
    localizeDates(body)
  } catch (error) {
    console.error('Error loading revision:', error)
    showError(dialog, new Error('Failed to load revision. Please try again later.'))
  } finally {
    loading.hidden = true
  }
}

async function restoreRevision(button) {
  const dialog = button.closest('dialog')
  if (!confirm('Are you sure you want to restore this revision?')) return
  showError(dialog, null)
  await whileBusy(button, async () => {
    try {
      await api(
        `/api/docs/${dialog.dataset.docId}/restore_revision?revision_id=${dialog.dataset.revisionId}`,
        { method: 'POST' }
      )
    } catch (error) {
      console.error('Error restoring revision:', error)
      showError(dialog, new Error('Failed to restore revision. Please try again later.'))
      return
    }
    const path = dialog.dataset.docPath
    dialog.close()
    evictCache(path)
    navigate(path)
  })
}

/* Editor */

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100)
}

/** Fill in the slug from the title, until the slug is edited by hand. */
function fillSlug(input) {
  const slug = document.querySelector(input.dataset.slugInput)
  if (!slug.dataset.edited) slug.value = slugify(input.value)
}

function createDoc(form, submitter) {
  const parent = form.elements.parent_id.selectedOptions[0]
  showError(form, null)
  return whileBusy(submitter, async () => {
    try {
      const doc = await api('/api/docs/', {
        method: 'POST',
        body: {
          parent_id: Number(parent.value),
          title: form.elements.title.value,
          slug: form.elements.slug.value,
          // New documents start with their parent's visibility
          public: parent.dataset.public === 'true',
        },
      })
      navigate(`/_edit/${doc.id}`)
    } catch (error) {
      showError(form, error)
    }
  })
}

/** Insert text at the cursor, keeping the browser's undo history where possible. */
function insertAtCursor(textarea, text) {
  textarea.focus()
  if (!document.execCommand('insertText', false, text)) {
    textarea.setRangeText(text, textarea.selectionStart, textarea.selectionEnd, 'end')
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
  }
}

function attachmentMarkdown(filename, id, isImage) {
  const url = `/api/uploads/${id}/download`
  return isImage ? `![${filename}](${url})` : `[${filename}](${url})`
}

async function refreshAttachments(form) {
  const details = form.querySelector('.editor-attachments')
  try {
    const response = await fetch(`/_partial/attachments/${form.dataset.docId}`, {
      credentials: 'same-origin',
    })
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
    details.innerHTML = await response.text()
  } catch (error) {
    console.error('Failed to load attachments:', error)
  }
}

/** Upload files as attachments of the document, returning the uploads. */
async function uploadAttachments(form, files) {
  const progress = form.querySelector('.editor-upload-progress')
  const uploads = []
  progress.hidden = false
  showError(form, null)
  try {
    for (const file of files) {
      const data = new FormData()
      data.append('file', file)
      data.append('filename', file.name)
      data.append('public', String(form.elements.public.checked))
      data.append('doc_id', form.dataset.docId)
      try {
        uploads.push(await api('/api/uploads/', { method: 'POST', body: data }))
      } catch (error) {
        showError(form, new Error(`Failed to upload ${file.name}: ${error.message}`))
      }
    }
  } finally {
    progress.hidden = true
  }
  await refreshAttachments(form)
  return uploads
}

/** Upload pasted or dropped files and link to them at the cursor. */
async function insertFiles(event, files) {
  if (!files || files.length === 0) return
  event.preventDefault()
  const textarea = event.target
  const uploads = await uploadAttachments(textarea.form, files)
  for (const upload of uploads) {
    const isImage = upload.content_type.startsWith('image/')
    insertAtCursor(textarea, attachmentMarkdown(upload.filename, upload.id, isImage))
  }
}

async function addAttachments(input) {
  const label = input.closest('label')
  label.classList.add('is-busy')
  try {
    await uploadAttachments(input.form, [...input.files])
  } finally {
    label.classList.remove('is-busy')
    input.value = ''
  }
}

function insertAttachment(button) {
  const form = button.closest('form')
  const id = button.closest('.editor-attachment').dataset.uploadId
  const isImage = button.dataset.image === 'true'
  insertAtCursor(form.elements.markdown, attachmentMarkdown(button.dataset.filename, id, isImage))
}

async function deleteAttachment(button) {
  if (!confirm('Are you sure you want to delete this file? This action cannot be undone.')) return
  const form = button.closest('form')
  const id = button.closest('.editor-attachment').dataset.uploadId
  try {
    await api(`/api/uploads/${id}`, { method: 'DELETE' })
    await refreshAttachments(form)
  } catch (error) {
    showError(form, error)
  }
}

let previewTimer = null
let previewRequest = null

/** Render the Markdown on the server, exactly as it will be shown. */
async function updatePreview(form) {
  previewRequest?.abort()
  const controller = new AbortController()
  previewRequest = controller
  try {
    const response = await fetchWithCsrf('/api/docs/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markdown: form.elements.markdown.value }),
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
    const { html } = await response.json()
    form.querySelector('.editor-preview').innerHTML = html
  } catch (error) {
    if (error.name !== 'AbortError') console.warn('Failed to update the preview:', error)
  }
}

function editorValues(form) {
  const { title, slug, parent_id, markdown } = form.elements
  return JSON.stringify([
    title.value,
    slug?.value,
    parent_id?.value,
    markdown.value,
    form.elements.public.checked,
  ])
}

function initEditor(form) {
  const initialValues = editorValues(form)
  const isChanged = () => editorValues(form) !== initialValues
  unsavedChanges = isChanged
  const badge = form.querySelector('.editor-unsaved')
  const updateBadge = () => {
    badge.hidden = !isChanged()
  }
  form.addEventListener('input', updateBadge)
  form.addEventListener('change', updateBadge)

  const textarea = form.elements.markdown
  textarea.addEventListener('input', () => {
    clearTimeout(previewTimer)
    previewTimer = setTimeout(() => updatePreview(form), PREVIEW_DELAY)
  })
  textarea.addEventListener('keydown', (event) => {
    if (event.key === 'Tab' && !event.shiftKey && !event.ctrlKey && !event.metaKey) {
      event.preventDefault()
      insertAtCursor(textarea, '    ')
    }
  })
  textarea.addEventListener('paste', (event) => insertFiles(event, event.clipboardData?.files))
  textarea.addEventListener('drop', (event) => insertFiles(event, event.dataTransfer?.files))
}

function saveDoc(form, submitter) {
  const body = {
    title: form.elements.title.value,
    public: form.elements.public.checked,
    markdown: form.elements.markdown.value,
  }
  // The home page can't be moved or renamed
  if (!('home' in form.dataset)) {
    body.slug = form.elements.slug.value
    body.parent_id = Number(form.elements.parent_id.value)
  }
  showError(form, null)
  return whileBusy(submitter, async () => {
    try {
      const doc = await api(`/api/docs/${form.dataset.docId}`, { method: 'PUT', body })
      unsavedChanges = null
      evictCache(form.dataset.docPath)
      evictCache(doc.urlpath)
      navigate(doc.urlpath)
    } catch (error) {
      showError(form, error)
    }
  })
}

async function moveDoc(button) {
  const form = button.closest('form')
  showError(form, null)
  try {
    await api(`/api/docs/${form.dataset.docId}/move?direction=${button.dataset.direction}`, {
      method: 'POST',
    })
    updateSidebar(null, true)
  } catch (error) {
    showError(form, error)
  }
}

async function deleteDoc(button) {
  if (!confirm('Are you sure you want to delete this document? This action cannot be undone.')) {
    return
  }
  const form = button.closest('form')
  showError(form, null)
  await whileBusy(button, async () => {
    try {
      await api(`/api/docs/${form.dataset.docId}`, { method: 'DELETE' })
    } catch (error) {
      showError(form, error)
      return
    }
    unsavedChanges = null
    evictCache(form.dataset.docPath)
    navigate('/')
  })
}

/* Forms */

const forms = {
  login: submitLogin,
  'create-doc': createDoc,
  'save-doc': saveDoc,
  'save-user': saveUser,
  'change-password': changePassword,
  'create-upload': createUpload,
  'save-upload': saveUpload,
  'save-settings': saveSettings,
  'reindex-docs': reindexDocs,
}

document.addEventListener('submit', (event) => {
  const form = event.target
  const handler = forms[form.dataset.form]
  if (handler) {
    event.preventDefault()
    handler(form, event.submitter || form.querySelector('[type="submit"]'))
    return
  }
  // Navigate to the results of GET forms, such as pagination
  if (form.method === 'get' && new URL(form.action).origin === location.origin) {
    event.preventDefault()
    const url = new URL(form.action)
    url.search = new URLSearchParams(new FormData(form))
    navigate(url)
  }
})

// Handlers for form controls with a data-on-change attribute
const changeHandlers = {
  autosubmit: (input) => input.form.requestSubmit(),
  'add-attachments': addAttachments,
  'fill-filename': fillFilename,
  'upload-document': updateUploadVisibility,
  'upload-icon': uploadIcon,
}

document.addEventListener('change', (event) => {
  changeHandlers[event.target.dataset.onChange]?.(event.target)
})

document.addEventListener('input', (event) => {
  const input = event.target
  if (input.dataset.sync) syncColor(input)
  if (input.dataset.slugInput) fillSlug(input)
  // Stop filling in the slug once it has been edited, unless it's cleared
  if (input.form?.dataset.form === 'create-doc' && input.name === 'slug') {
    input.dataset.edited = input.value ? 'true' : ''
  }
})

/* Page initialization */

// Initializers for elements with a data-init attribute, run whenever they are shown
const initializers = {
  logout,
  editor: initEditor,
}

function initPage(root) {
  for (const element of root.querySelectorAll('[data-init]')) {
    initializers[element.dataset.init]?.(element)
  }
}

/* Actions */

const actions = {
  'toggle-sidebar': toggleSidebar,
  'toggle-theme': toggleTheme,
  'open-search': openSearch,
  share: shareDocument,
  'create-share-link': createShareLink,
  'copy-share-link': copyShareLink,
  'delete-share-link': deleteShareLink,
  'close-dialog': (button) => button.closest('dialog').close(),
  'add-user': () => openUserDialog(null),
  'edit-user': (button) => openUserDialog(button.closest('tr')),
  'change-password': openPasswordDialog,
  'delete-user': deleteUser,
  'new-upload': () => openDialogForm('new-upload-dialog'),
  'edit-upload': openUploadDialog,
  'delete-upload': deleteUpload,
  'revert-icon': revertIcon,
  'view-revision': viewRevision,
  'move-doc': moveDoc,
  'delete-doc': deleteDoc,
  'insert-attachment': insertAttachment,
  'delete-attachment': deleteAttachment,
  'restore-revision': restoreRevision,
}

document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-action]')
  const action = button && actions[button.dataset.action]
  if (action) {
    event.preventDefault()
    action(button)
  }
})

/* Initialization */

function init() {
  history.scrollRestoration = 'manual'
  purgeOtherUsers()
  // Cache the initial page before it is modified by scripts
  const etag = document.querySelector('meta[name="gnotus-partial-etag"]')?.content
  writeCache(currentPath, serializeCurrentPage(), etag)
  localizeDates(main)
  initPage(main)
  if (navigator.platform.includes('Mac')) {
    document.querySelector('[data-action="open-search"]').title = 'Search (⌘ + S)'
  }
  if (location.hash) {
    restoreScroll(location.hash, 0)
  } else if (history.state?.scroll) {
    restoreScroll('', history.state.scroll)
  }
}

init()
