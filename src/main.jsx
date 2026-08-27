import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import './index.css'

// BrowserRouter rather than HashRouter, so the URLs read as
// /stonkbrokers/yield rather than /#/stonkbrokers/yield. GitHub Pages has no
// rewrite rules and would 404 on a deep link, so the build writes a 404.html
// that is a byte-copy of index.html -- Pages serves it for any unmatched path,
// the app boots, and the router reads the original URL off `location`. See the
// `spa-fallback` plugin in vite.config.js.
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
)
