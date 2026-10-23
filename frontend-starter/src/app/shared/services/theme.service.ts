import { DOCUMENT, effect, inject, Injectable, signal } from '@angular/core';

export type Theme = 'light' | 'dark';

const THEME_KEY = 'gpc_theme';

/** Light / dark theme: follows the system until the user picks one, then remembers the choice. */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);

  readonly theme = signal<Theme>(readTheme() ?? systemTheme());

  constructor() {
    // `data-theme` on <html> switches the CSS variables of styles.css and the Material color-scheme.
    effect(() => {
      this.document.documentElement.dataset['theme'] = this.theme();
    });
  }

  toggle(): void {
    const next: Theme = this.theme() === 'dark' ? 'light' : 'dark';
    writeTheme(next);
    this.theme.set(next);
  }
}

function systemTheme(): Theme {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** localStorage may be unavailable (private mode, blocked storage): fail silently. */
function readTheme(): Theme | null {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    return stored === 'light' || stored === 'dark' ? stored : null;
  } catch {
    return null;
  }
}

function writeTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // The theme still applies for the current session through the Signal.
  }
}
