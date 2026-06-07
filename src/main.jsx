import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import { installSyncInterceptor, pullWorkspaceIntoLocalStorage } from './utils/cloudSync'

// Pull the shared team library into localStorage BEFORE the app (and store.jsx)
// read it, so everyone opens to the same data. App.jsx is imported dynamically
// afterwards so its storage reads see the synced data.
;(async () => {
  installSyncInterceptor()
  try { await pullWorkspaceIntoLocalStorage() } catch (e) { console.warn('[sync] initial pull failed', e) }
  const { default: App } = await import('./App.jsx')
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  )
})()
