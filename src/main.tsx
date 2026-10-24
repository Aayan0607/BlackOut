import React from 'react'
import ReactDOM from 'react-dom/client'
import { initializeWasm } from '@automerge/automerge/slim'
import wasmUrl from '@automerge/automerge/automerge.wasm?url'
import App from './ui/App'
import './ui/styles.css'

initializeWasm(
  fetch(wasmUrl).then(async (response) => {
    if (!response.ok) throw new Error('Merge engine could not be loaded.')
    return new Uint8Array(await response.arrayBuffer())
  }),
)
  .then(() => {
    ReactDOM.createRoot(document.getElementById('root')!).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
    )
  })
  .catch((error) => {
    const root = document.getElementById('root')!
    root.textContent = `BlackOut could not start. Reload while connected once to cache its files. ${String(error)}`
  })
