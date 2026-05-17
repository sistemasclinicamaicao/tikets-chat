import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import App from './App';
import '@tabler/icons-webfont/dist/tabler-icons.min.css';
import './index.css';

/** Tema fijo claro (sin modo noche). */
document.documentElement.dataset.theme = 'light';
try {
  localStorage.removeItem('theme');
} catch {
  /* almacenamiento no disponible */
}

const isDesktopShell = import.meta.env.VITE_DESKTOP_SHELL === 'true';
const Router = isDesktopShell ? HashRouter : BrowserRouter;
const routerFuture = { v7_startTransition: true, v7_relativeSplatPath: true } as const;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Router future={routerFuture}>
      <App />
    </Router>
  </React.StrictMode>,
);
