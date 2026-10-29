import { Injectable, signal } from '@angular/core';

const VISUALIZER_KEY = 'gpc_visualizer';

/**
 * On / off switch of the animated MilkDrop background. Off by default: it can flash and uses the
 * graphics card, so the user turns it on explicitly; the choice is remembered.
 */
@Injectable({ providedIn: 'root' })
export class VisualizerService {
  readonly enabled = signal(readEnabled());

  toggle(): void {
    const next = !this.enabled();
    writeEnabled(next);
    this.enabled.set(next);
  }
}

/** localStorage may be unavailable (private mode, blocked storage): fail silently. */
function readEnabled(): boolean {
  try {
    return localStorage.getItem(VISUALIZER_KEY) === 'on';
  } catch {
    return false;
  }
}

function writeEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(VISUALIZER_KEY, enabled ? 'on' : 'off');
  } catch {
    // The choice still applies for the current session through the Signal.
  }
}
