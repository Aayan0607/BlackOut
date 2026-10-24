import { Component, type ReactNode } from 'react'

export default class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    if (this.state.failed)
      return (
        <main className="startup-error" role="alert">
          <h1>BlackOut couldn’t display this screen.</h1>
          <p>Your saved browser data has not been cleared. Reload to reopen the expedition.</p>
          <button onClick={() => window.location.reload()}>Reload BlackOut</button>
        </main>
      )
    return this.props.children
  }
}
