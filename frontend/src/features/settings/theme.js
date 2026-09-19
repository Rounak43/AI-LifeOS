/**
 * Theme application. 'system' follows prefers-color-scheme; every other theme is
 * forced via a data-theme attribute on <html> (see styles/global.css). Persisted in
 * localStorage so the choice survives reloads and applies before auth resolves.
 */
const KEY = 'lifeos.theme';

/** Options shown in Settings → Appearance. `swatch` colors: [bg, surface, accent]. */
export const THEME_OPTIONS = [
  { id: 'system', label: 'System', swatch: ['#c7ccd6', '#ffffff', '#5b5bd6'] },
  { id: 'light', label: 'Light', swatch: ['#eceef3', '#fbfcfe', '#5b5bd6'] },
  { id: 'dark', label: 'Dark', swatch: ['#0f1114', '#22262e', '#8b8bf0'] },
  { id: 'midnight', label: 'Midnight', swatch: ['#0b0f1e', '#1d2440', '#8b93ff'] },
  { id: 'ocean', label: 'Ocean', swatch: ['#061a1f', '#12363f', '#2dd4bf'] },
  { id: 'forest', label: 'Forest', swatch: ['#0a150f', '#1a2e24', '#34d399'] },
  { id: 'sunset', label: 'Sunset', swatch: ['#fdf1ea', '#ffe8db', '#f9743a'] },
  { id: 'lavender', label: 'Lavender', swatch: ['#f4f1fb', '#efeaf9', '#7c3aed'] },
  { id: 'rose', label: 'Rose', swatch: ['#fcf0f3', '#fbe5ea', '#e11d54'] },
];

export const THEMES = THEME_OPTIONS.map((t) => t.id);

export function applyTheme(theme) {
  const t = THEMES.includes(theme) ? theme : 'system';
  const root = document.documentElement;
  if (t === 'system') {
    root.removeAttribute('data-theme');
  } else {
    root.setAttribute('data-theme', t);
  }
  try {
    localStorage.setItem(KEY, t);
  } catch {
    /* private mode / blocked storage — non-fatal */
  }
}

export function getStoredTheme() {
  try {
    return localStorage.getItem(KEY) || 'system';
  } catch {
    return 'system';
  }
}

/** Apply the stored theme immediately at startup. */
export function initTheme() {
  applyTheme(getStoredTheme());
}
