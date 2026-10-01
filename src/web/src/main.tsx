import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/baloo-bhaijaan-2'
import '@fontsource-variable/rubik'
import './styles/tokens.css'
import './styles/base.css'
import './styles/components.css'
import './i18n'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
