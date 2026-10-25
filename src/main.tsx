
import './previewGuard'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// Remove dark mode class addition
createRoot(document.getElementById("root")!).render(<>
  <App />
  <aside aria-label="Historical preview notice" style={{position:'fixed',bottom:0,left:0,right:0,zIndex:2147483647,background:'#f5f0e8',color:'#18301f',padding:'12px 20px',borderTop:'2px solid #a18335',fontFamily:'system-ui,sans-serif',fontSize:14,lineHeight:1.5,boxShadow:'0 -3px 20px #0003'}}>
    <strong>Original homepage · June 6, 2026</strong>{' — '}Historical design preview. Live data, forms and payments are disabled. Figures and claims are historical, not current verification.{' '}
    <a href="https://orchidcontinuum.org" target="_blank" rel="noreferrer" style={{color:'#18301f',textDecoration:'underline'}}>Open current website ↗</a>
  </aside>
</>);

