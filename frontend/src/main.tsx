import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@maxhub/max-ui/dist/styles.css'
import '@fontsource/m-plus-1p/cyrillic-400.css'
import '@fontsource/m-plus-1p/cyrillic-500.css'
import '@fontsource/m-plus-1p/cyrillic-700.css'
import '@fontsource/m-plus-1p/latin-400.css'
import '@fontsource/m-plus-1p/latin-500.css'
import '@fontsource/m-plus-1p/latin-700.css'
import './index.css'
import { App } from './app/App'
import './app/redesign.css'
import './app/worker-design.css'
import './app/employer-review.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
