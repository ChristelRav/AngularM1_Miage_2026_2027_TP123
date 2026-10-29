import { Injectable, signal } from '@angular/core';

/** One AudioContext for the whole app: browsers limit how many can exist at the same time. */
@Injectable({ providedIn: 'root' })
export class AudioContextService {
  private context: AudioContext | null = null;

  /** Node of the track currently playing (null when paused), so the background visualizer can listen to it. */
  readonly playingSource = signal<AudioNode | null>(null);

  get(): AudioContext {
    this.context ??= new AudioContext();
    return this.context;
  }

  /** Call it from a click handler: browsers keep a context suspended (silent) until a user gesture. */
  unlock(): void {
    void this.get().resume();
  }
}
