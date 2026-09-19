import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles/global.css';
import { initTheme } from './features/settings/theme.js';

// Apply the saved theme before first paint to avoid a flash of the wrong theme.
initTheme();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);
