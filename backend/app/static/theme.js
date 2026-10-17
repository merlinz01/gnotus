// Apply the saved color mode before the page is shown, so it doesn't flash.
// Loaded synchronously from <head>, and kept separate from app.js since that runs later.
document.documentElement.setAttribute('data-theme', localStorage.getItem('color-mode') || 'light')
