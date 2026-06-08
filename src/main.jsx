import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { installSyncInterceptor, backgroundSync } from './utils/cloudSync'

// Render immediately from local data so the login + app never wait on the
// network. The shared library then syncs in the background and reloads only if
// it actually changed something.
installSyncInterceptor()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

backgroundSync()
