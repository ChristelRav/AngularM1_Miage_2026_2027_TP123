import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatMenuModule } from '@angular/material/menu';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { IconComponent } from '../../shared/components/icon/icon';
import { PlaylistCoverComponent } from '../../shared/components/playlist-cover/playlist-cover';
import {
  PlaylistTracksDialogComponent,
  PlaylistTracksDialogData,
} from '../../shared/components/playlist-tracks-dialog/playlist-tracks-dialog';
import { TrackPlayerComponent } from '../../shared/components/track-player/track-player';
import { Playlist, PlaylistTrack } from '../../shared/models/playlist.model';
import { AudioFormatPipe } from '../../shared/pipes/track-format.pipes';
import { AudioContextService } from '../../shared/services/audio-context.service';
import { PlaylistActionsService } from '../../shared/services/playlist-actions.service';
import { PlaylistService } from '../../shared/services/playlist.service';

/**
 * Content of one playlist, played with the existing track player (one player for the whole
 * playlist: the next track starts when one ends). The owner can add or remove tracks, rename,
 * share and delete; an invited friend can only listen.
 */
@Component({
  imports: [RouterLink, MatMenuModule, IconComponent, PlaylistCoverComponent, TrackPlayerComponent, AudioFormatPipe],
  templateUrl: './playlist-page.html',
  styleUrl: './playlist-page.css',
})
export class PlaylistPageComponent {
  private readonly service = inject(PlaylistService);
  private readonly actions = inject(PlaylistActionsService);
  private readonly dialog = inject(MatDialog);
  private readonly audioContext = inject(AudioContextService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly playlist = signal<Playlist | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly tracks = computed(() => this.playlist()?.tracks ?? []);

  /** Index (in `tracks`) of the track loaded in the player, or null. */
  readonly currentIndex = signal<number | null>(null);
  readonly audioUrl = signal('');
  readonly loadingTrack = signal(false);
  readonly current = computed(() => {
    const index = this.currentIndex();
    return index === null ? null : (this.tracks()[index] ?? null);
  });
  readonly hasPrevious = computed(() => (this.currentIndex() ?? 0) > 0);
  readonly hasNext = computed(() => {
    const index = this.currentIndex();
    return index !== null && index < this.tracks().length - 1;
  });
  /** Ignores an audio download that finished after another track was chosen. */
  private playVersion = 0;

  constructor() {
    const subscription = this.route.paramMap.subscribe((params) => {
      const id = params.get('id');
      if (id) this.load(id, this.route.snapshot.queryParamMap.has('play'));
    });
    inject(DestroyRef).onDestroy(() => {
      subscription.unsubscribe();
      this.stop();
    });
  }

  load(id: string, autoplay = false): void {
    this.stop();
    this.loading.set(true);
    this.error.set(null);
    this.service.get(id).subscribe({
      next: (playlist) => {
        console.debug('[PlaylistPage] Playlist chargée', playlist.id, playlist.trackCount);
        this.playlist.set(playlist);
        this.loading.set(false);
        if (autoplay && playlist.tracks?.length) this.playAt(0);
      },
      error: (error: Error) => {
        console.error('[PlaylistPage] Playlist indisponible', error);
        this.error.set(error.message);
        this.loading.set(false);
      },
    });
  }

  playAt(index: number): void {
    const track = this.tracks()[index];
    if (!track) return;
    if (this.currentIndex() === index && this.audioUrl()) return;
    // Unlocked during the click: after the download, the browser would keep the audio graph silent.
    this.audioContext.unlock();
    const version = ++this.playVersion;
    this.loadingTrack.set(true);
    this.service.file(track.audioUrl).subscribe({
      next: (blob) => {
        if (version !== this.playVersion) return;
        console.debug('[PlaylistPage] Audio chargé', track.id);
        const previous = this.audioUrl();
        this.audioUrl.set(URL.createObjectURL(blob));
        if (previous) URL.revokeObjectURL(previous);
        this.currentIndex.set(index);
        this.loadingTrack.set(false);
      },
      error: (error: Error) => {
        console.error('[PlaylistPage] Lecture impossible', error);
        this.loadingTrack.set(false);
        this.actions.notify(`Lecture impossible : ${error.message}`, true);
      },
    });
  }

  previous(): void {
    const index = this.currentIndex();
    if (index !== null && index > 0) this.playAt(index - 1);
  }

  /** Called by the buttons and when a track ends: the last track simply stops. */
  next(): void {
    const index = this.currentIndex();
    if (index !== null && index < this.tracks().length - 1) this.playAt(index + 1);
  }

  addTracks(playlist: Playlist): void {
    this.dialog
      .open<PlaylistTracksDialogComponent, PlaylistTracksDialogData, Playlist | null>(PlaylistTracksDialogComponent, {
        data: { playlist },
        width: '520px',
        maxWidth: '95vw',
      })
      .afterClosed()
      .subscribe({
        // Tracks are added at the end: the index of the track being played does not change.
        next: (updated) => {
          if (updated) this.playlist.set(updated);
        },
        error: (error: unknown) => console.error('[PlaylistPage] Ajout impossible', error),
      });
  }

  removeTrack(playlist: Playlist, track: PlaylistTrack, index: number): void {
    this.service.removeTrack(playlist.id, track.id).subscribe({
      next: () => {
        console.debug('[PlaylistPage] Musique retirée', track.id);
        const current = this.currentIndex();
        if (current === index) this.stop();
        else if (current !== null && index < current) this.currentIndex.set(current - 1);
        const tracks = this.tracks().filter((item) => item.id !== track.id);
        this.playlist.set({ ...playlist, tracks, trackIds: tracks.map((item) => item.id), trackCount: tracks.length });
        this.actions.notify(`« ${track.title} » retirée de la playlist.`);
      },
      error: (error: Error) => {
        console.error('[PlaylistPage] Retrait impossible', error);
        this.actions.notify(error.message, true);
      },
    });
  }

  rename(playlist: Playlist): void {
    this.actions.rename(playlist).subscribe({
      next: (updated) => this.playlist.set({ ...playlist, name: updated.name, updatedAt: updated.updatedAt }),
      error: (error: unknown) => console.error('[PlaylistPage] Renommage impossible', error),
    });
  }

  share(playlist: Playlist): void {
    this.actions.share(playlist).subscribe({
      next: (count) => this.playlist.set({ ...playlist, sharedWithCount: count }),
      error: (error: unknown) => console.error('[PlaylistPage] Partage impossible', error),
    });
  }

  remove(playlist: Playlist): void {
    this.actions.remove(playlist).subscribe({
      next: () => void this.router.navigateByUrl('/playlists'),
      error: (error: unknown) => console.error('[PlaylistPage] Suppression impossible', error),
    });
  }

  /** Removing the player (via @if) stops the sound; revoking the ObjectURL frees the Blob. */
  private stop(): void {
    this.playVersion++;
    if (this.audioUrl()) URL.revokeObjectURL(this.audioUrl());
    this.audioUrl.set('');
    this.currentIndex.set(null);
    this.loadingTrack.set(false);
  }
}
