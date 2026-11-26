import { Component, computed, DestroyRef, effect, inject, input, signal, untracked } from '@angular/core';
import { PlaylistService } from '../../services/playlist.service';
import { IconComponent } from '../icon/icon';

/**
 * Visual of a playlist built from the covers of its tracks: a 2×2 mosaic with 4 covers, the first
 * cover alone with 1 to 3, a placeholder otherwise. Same square frame (`.thumb`) in every case.
 * Covers are protected by the JWT, so they are downloaded as blobs.
 */
@Component({
  selector: 'app-playlist-cover',
  imports: [IconComponent],
  templateUrl: './playlist-cover.html',
  styleUrl: './playlist-cover.css',
})
export class PlaylistCoverComponent {
  private readonly service = inject(PlaylistService);

  readonly covers = input<string[]>([]);
  readonly name = input.required<string>();

  private readonly objectUrls = signal<string[]>([]);
  readonly images = computed(() => {
    const urls = this.objectUrls();
    return urls.length >= 4 ? urls.slice(0, 4) : urls.slice(0, 1);
  });

  constructor() {
    effect(() => {
      const covers = this.covers();
      untracked(() => this.load(covers));
    });
    inject(DestroyRef).onDestroy(() => this.release());
  }

  private load(covers: string[]): void {
    this.release();
    // Only the covers that will be shown: 4 for a mosaic, otherwise the first one.
    const wanted = covers.length >= 4 ? covers.slice(0, 4) : covers.slice(0, 1);
    const loaded: (string | null)[] = wanted.map(() => null);
    wanted.forEach((url, index) => {
      this.service.file(url).subscribe({
        next: (blob) => {
          loaded[index] = URL.createObjectURL(blob);
          if (loaded.every(Boolean)) this.objectUrls.set(loaded as string[]);
        },
        // A missing cover keeps the placeholder.
        error: (error: Error) => console.warn('[PlaylistCover] Pochette indisponible', url, error.message),
      });
    });
  }

  private release(): void {
    for (const url of this.objectUrls()) URL.revokeObjectURL(url);
    this.objectUrls.set([]);
  }
}
