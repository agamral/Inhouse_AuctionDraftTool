import { useLocation } from 'react-router-dom'
import './Footer.css'

export default function Footer() {
  const location = useLocation()
  const isFullscreenView = location.pathname.endsWith('/espectador')
    || location.pathname.includes('/hero-draft/overlay')
    || location.pathname.includes('/hero-draft/espectador')
    || location.pathname.endsWith('/showmatch/espectador')
  if (isFullscreenView) return null

  return (
    <footer className="footer">
      <span>Copa Inhouse · Heroes of the Storm · v2</span>
    </footer>
  )
}
