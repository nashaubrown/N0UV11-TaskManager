import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// PWA: register the service worker in production builds (not the single-file preview)
if ('serviceWorker' in navigator && import.meta.env.PROD && import.meta.env.MODE !== 'artifact') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((e) => console.warn('SW registration failed', e))
  })
}
