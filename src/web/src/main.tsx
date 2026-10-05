import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/readex-pro'
import '@fontsource-variable/fraunces'
import '@fontsource-variable/noto-naskh-arabic'
import './styles/tokens.css'
import './styles/base.css'
import './styles/components.css'
import './i18n'
import App from './App'
import { refreshCsrf } from './api/client'

// Always start with a CSRF token bound to the current identity (contracts/http-api.md).
void refreshCsrf()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
