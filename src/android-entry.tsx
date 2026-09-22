import React from 'react'
import ReactDOM from 'react-dom/client'
import { AppShell } from '@/components/app-shell'
import '@/styles.css'

function Root() {
  return <AppShell />
}

const root = document.getElementById('root')
if (root) {
  ReactDOM.createRoot(root).render(<Root />)
}
