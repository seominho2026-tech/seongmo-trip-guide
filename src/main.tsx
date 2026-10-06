import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/tokens.css'
import './styles/fonts.css'
import './styles/app.css'
import './styles/screens.css'
import { App } from './app/App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// 배포본에서만: 한 번 연 화면·안내·지도를 기기에 저장해 두어 인터넷이 약한 곳에서도 일정이 열리게 한다.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => undefined)
  })
}
