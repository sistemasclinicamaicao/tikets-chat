import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import '@tabler/icons-webfont/dist/tabler-icons.min.css';
import './index.css';

/**
 * Bootstrap del tema antes de montar React para evitar parpadeo.
 * - Si el usuario ya eligió tema, se persiste en localStorage('theme').
 * - Si no, respeta la preferencia del sistema operativo (prefers-color-scheme).
 * Se expone window.__setAppTheme para que el toggle del layout lo cambie.
 */
(function bootstrapTheme() {
  try {
    const stored = localStorage.getItem('theme');
    const sysDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const initial: 'light' | 'dark' =
      stored === 'light' || stored === 'dark' ? stored : sysDark ? 'dark' : 'light';
    document.documentElement.dataset.theme = initial;
    (window as unknown as { __setAppTheme?: (t: 'light' | 'dark') => void }).__setAppTheme = (t) => {
      document.documentElement.dataset.theme = t;
      try {
        localStorage.setItem('theme', t);
      } catch {
        /* almacenamiento no disponible */
      }
      window.dispatchEvent(new CustomEvent('app-theme-change', { detail: t }));
    };
  } catch {
    document.documentElement.dataset.theme = 'light';
  }
})();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
