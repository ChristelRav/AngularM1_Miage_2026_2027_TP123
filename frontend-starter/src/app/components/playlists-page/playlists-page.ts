import { NgTemplateOutlet } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { MatMenuModule } from '@angular/material/menu';
import { Router, RouterLink } from '@angular/router';
import { IconComponent } from '../../shared/components/icon/icon';
import { PlaylistCoverComponent } from '../../shared/components/playlist-cover/playlist-cover';
import { Playlist } from '../../shared/models/playlist.model';
import { PlaylistActionsService } from '../../shared/services/playlist-actions.service';
import { PlaylistService } from '../../shared/services/playlist.service';

/** "Mes playlists" (owner actions in the ⋯ menu) and "Partagées avec moi" (read and listen only). */
@Component({
  imports: [NgTemplateOutlet, RouterLink, MatMenuModule, IconComponent, PlaylistCoverComponent],
  templateUrl: './playlists-page.html',
  styleUrl: './playlists-page.css',
})
export class PlaylistsPageComponent {
  private readonly service = inject(PlaylistService);
  private readonly actions = inject(PlaylistActionsService);
  private readonly router = inject(Router);

  readonly mine = signal<Playlist[]>([]);
  readonly shared = signal<Playlist[]>([]);
  readonly loadingMine = signal(true);
  readonly loadingShared = signal(true);
  readonly errorMine = signal<string | null>(null);
  readonly errorShared = signal<string | null>(null);

  constructor() {
    this.loadMine();
    this.loadShared();
  }

  loadMine(): void {
    this.loadingMine.set(true);
    this.errorMine.set(null);
    this.service.mine().subscribe({
      next: (playlists) => {
        console.debug('[PlaylistsPage] Mes playlists', playlists.length);
        this.mine.set(playlists);
        this.loadingMine.set(false);
      },
      error: (error: Error) => {
        console.error('[PlaylistsPage] Chargement de mes playlists impossible', error);
        this.errorMine.set(error.message);
        this.loadingMine.set(false);
      },
    });
  }

  loadShared(): void {
    this.loadingShared.set(true);
    this.errorShared.set(null);
    this.service.sharedWithMe().subscribe({
      next: (playlists) => {
        console.debug('[PlaylistsPage] Playlists partagées avec moi', playlists.length);
        this.shared.set(playlists);
        this.loadingShared.set(false);
      },
      error: (error: Error) => {
        console.error('[PlaylistsPage] Chargement des playlists partagées impossible', error);
        this.errorShared.set(error.message);
        this.loadingShared.set(false);
      },
    });
  }

  create(): void {
    this.actions.create().subscribe({
      next: (playlist) => void this.router.navigate(['/playlists', playlist.id]),
      error: (error: unknown) => console.error('[PlaylistsPage] Création impossible', error),
    });
  }

  /** Opens the playlist page, which starts the first track. */
  play(playlist: Playlist): void {
    void this.router.navigate(['/playlists', playlist.id], { queryParams: { play: 1 } });
  }

  rename(playlist: Playlist): void {
    this.actions.rename(playlist).subscribe({
      next: (updated) => this.replace(updated),
      error: (error: unknown) => console.error('[PlaylistsPage] Renommage impossible', error),
    });
  }

  share(playlist: Playlist): void {
    this.actions.share(playlist).subscribe({
      next: (count) => this.replace({ ...playlist, sharedWithCount: count }),
      error: (error: unknown) => console.error('[PlaylistsPage] Partage impossible', error),
    });
  }

  remove(playlist: Playlist): void {
    this.actions.remove(playlist).subscribe({
      next: () => this.mine.update((playlists) => playlists.filter((item) => item.id !== playlist.id)),
      error: (error: unknown) => console.error('[PlaylistsPage] Suppression impossible', error),
    });
  }

  private replace(updated: Playlist): void {
    this.mine.update((playlists) =>
      playlists.map((item) => (item.id === updated.id ? { ...item, ...updated, tracks: undefined } : item)),
    );
  }
}
