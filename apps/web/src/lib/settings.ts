const KEY = 'crosswordle:settings';

export interface Settings {
  /** Orange and blue instead of green and yellow, for colour-blind players. */
  readonly highContrast: boolean;
}

export function loadSettings(): Settings {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Settings>;
    return { highContrast: saved.highContrast === true };
  } catch {
    return { highContrast: false };
  }
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Blocked storage: the setting lasts until the page is closed.
  }
}

/** Applies settings to the page; the colour tokens in app.css key off these attributes. */
export function applySettings(settings: Settings): void {
  document.documentElement.toggleAttribute('data-high-contrast', settings.highContrast);
}
