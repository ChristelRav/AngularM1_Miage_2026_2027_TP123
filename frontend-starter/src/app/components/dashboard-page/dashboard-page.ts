import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IconComponent, IconName } from '../../shared/components/icon/icon';
import { Track } from '../../shared/models/track.model';
import { AudioFormatPipe, ShortDatePipe } from '../../shared/pipes/track-format.pipes';
import { TrackService } from '../../shared/services/track.service';
import { httpErrorMessage } from '../../shared/utils/http-error';

/** Number of recent tracks shown on the dashboard. */
const RECENT_COUNT = 4;

interface Stat {
  icon: IconName;
  label: string;
  /** null: the feature has no backend yet, so there is no number to show. */
  value: number | null;
  link: string;
}

/**
 * Personal dashboard. Every number comes from the API (`GET /api/tracks`, sorted from the newest);
 * playlists and albums have no backend yet, so they show "Bientôt" instead of an invented count.
 */
@Component({
  imports: [RouterLink, IconComponent, AudioFormatPipe, ShortDatePipe],
  templateUrl: './dashboard-page.html',
  styleUrl: './dashboard-page.css',
})
export class DashboardPageComponent {
  private readonly service = inject(TrackService);

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly total = signal(0);
  readonly recentTracks = signal<Track[]>([]);
  readonly coverUrls = signal<Readonly<Record<string, string>>>({});

  readonly stats = computed<Stat[]>(() => [
    { icon: 'music', label: 'Musiques importées', value: this.total(), link: '/tracks' },
    { icon: 'list-music', label: 'Playlists', value: null, link: '/playlists' },
    { icon: 'disc', label: 'Albums', value: null, link: '/albums' },
  ]);

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      for (const url of Object.values(this.coverUrls())) URL.revokeObjectURL(url);
    });
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.service.list(1, RECENT_COUNT).subscribe({
      next: (response) => {
        console.debug('[Dashboard] Pistes récentes chargées', response.items.length, '/', response.total);
        this.total.set(response.total);
        this.recentTracks.set(response.items);
        this.loading.set(false);
        this.loadCovers(response.items);
      },
      error: (error: unknown) => {
        console.error('[Dashboard] Chargement impossible', error);
        this.error.set(httpErrorMessage(error));
        this.loading.set(false);
      },
    });
  }

  /** Covers are protected by the JWT, so they are downloaded as blobs (same as the tracks page). */
  private loadCovers(tracks: Track[]): void {
    for (const track of tracks) {
      if (!track.coverUrl || this.coverUrls()[track.id]) continue;
      this.service.cover(track.id).subscribe({
        next: (blob) => {
          const url = URL.createObjectURL(blob);
          this.coverUrls.update((urls) => ({ ...urls, [track.id]: url }));
        },
        // A missing cover keeps the placeholder: nothing to show to the user.
        error: (error: unknown) => console.warn('[Dashboard] Couverture indisponible', track.id, error),
      });
    }
  }
}
