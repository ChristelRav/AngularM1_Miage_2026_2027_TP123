import { Injectable } from '@angular/core';

/** One AudioContext for the whole app: browsers limit how many can exist at the same time. */
@Injectable({ providedIn: 'root' })
export class AudioContextService {
  private context: AudioContext | null = null;

  get(): AudioContext {
    this.context ??= new AudioContext();
    return this.context;
  }

  /** Call it from a click handler: browsers keep a context suspended (silent) until a user gesture. */
  unlock(): void {
    void this.get().resume();
  }
}
