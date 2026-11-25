import { Component, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { Playlist } from '../../models/playlist.model';
import { Track } from '../../models/track.model';
import { AudioFormatPipe } from '../../pipes/track-format.pipes';
import { PlaylistService } from '../../services/playlist.service';
import { TrackService } from '../../services/track.service';
import { httpErrorMessage } from '../../utils/http-error';
import { IconComponent } from '../icon/icon';

export interface PlaylistTracksDialogData {
  playlist: Playlist;
}

/** Largest page allowed by `GET /api/tracks`. */
const PAGE_SIZE = 20;

/**
 * Adds the user's own tracks to a playlist (existing `GET /api/tracks`, page by page). A track
 * already in the playlist is marked as added. Closes with the updated playlist, or nothing if
 * no track was added.
 */
@Component({
  selector: 'app-playlist-tracks-dialog',
  imports: [MatDialogModule, IconComponent, AudioFormatPipe],
  templateUrl: './playlist-tracks-dialog.html',
  styleUrl: './playlist-tracks-dialog.css',
})
export class PlaylistTracksDialogComponent {
  readonly data = inject<PlaylistTracksDialogData>(MAT_DIALOG_DATA);
  private readonly tracks = inject(TrackService);
  private readonly playlists = inject(PlaylistService);

  readonly items = signal<Track[]>([]);
  readonly page = signal(1);
  readonly pages = signal(1);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly addingId = signal<string | null>(null);
  readonly addedIds = signal<ReadonlySet<string>>(new Set(this.data.playlist.trackIds));
  /** Last version of the playlist sent by the API, returned when the dialog closes. */
  readonly updated = signal<Playlist | null>(null);

  constructor() {
    this.go(1);
  }

  go(page: number): void {
    this.loading.set(true);
    this.error.set(null);
    this.tracks.list(page, PAGE_SIZE).subscribe({
      next: (response) => {
        this.items.set(response.items);
        this.page.set(response.page);
        this.pages.set(response.pages);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        console.error('[PlaylistTracks] Musiques indisponibles', error);
        this.error.set(httpErrorMessage(error));
        this.loading.set(false);
      },
    });
  }

  add(track: Track): void {
    this.addingId.set(track.id);
    this.error.set(null);
    this.playlists.addTrack(this.data.playlist.id, track.id).subscribe({
      next: (playlist) => {
        console.debug('[PlaylistTracks] Musique ajoutée', track.id);
        this.updated.set(playlist);
        this.addedIds.set(new Set(playlist.trackIds));
        this.addingId.set(null);
      },
      error: (error: Error) => {
        console.error('[PlaylistTracks] Ajout impossible', error);
        this.error.set(error.message);
        this.addingId.set(null);
      },
    });
  }
}
