import { Component, computed, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { Friend, initialsOf } from '../../models/friendship.model';
import { Playlist, PlaylistShare } from '../../models/playlist.model';
import { FriendshipService } from '../../services/friendship.service';
import { PlaylistService } from '../../services/playlist.service';
import { IconComponent } from '../icon/icon';

export interface PlaylistShareDialogData {
  playlist: Playlist;
}

/**
 * Shares a playlist with friends. Lists the friends who already have access (with a remove button)
 * and the other friends, who can be selected and added together. Every change is saved at once;
 * the dialog closes with the number of friends who have access.
 */
@Component({
  selector: 'app-playlist-share-dialog',
  imports: [MatDialogModule, IconComponent],
  templateUrl: './playlist-share-dialog.html',
  styleUrl: './playlist-share-dialog.css',
})
export class PlaylistShareDialogComponent {
  readonly data = inject<PlaylistShareDialogData>(MAT_DIALOG_DATA);
  private readonly playlists = inject(PlaylistService);
  private readonly friendships = inject(FriendshipService);

  readonly friends = signal<Friend[]>([]);
  readonly shares = signal<PlaylistShare[]>([]);
  readonly selected = signal<ReadonlySet<string>>(new Set());
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly initialsOf = initialsOf;

  /** Friends who do not have access yet. */
  readonly available = computed(() => {
    const shared = new Set(this.shares().map((share) => share.id));
    return this.friends().filter((friend) => !shared.has(friend.id));
  });

  constructor() {
    let pending = 2;
    const done = () => {
      if (--pending === 0) this.loading.set(false);
    };
    this.friendships.friends().subscribe({
      next: (friends) => {
        this.friends.set(friends);
        done();
      },
      error: (error: unknown) => {
        console.error('[PlaylistShare] Amis indisponibles', error);
        this.error.set('Impossible de charger vos amis.');
        done();
      },
    });
    this.playlists.shares(this.data.playlist.id).subscribe({
      next: (shares) => {
        this.shares.set(shares);
        done();
      },
      error: (error: Error) => {
        console.error('[PlaylistShare] Partage indisponible', error);
        this.error.set(error.message);
        done();
      },
    });
  }

  toggle(friend: Friend): void {
    this.selected.update((selected) => {
      const next = new Set(selected);
      if (next.has(friend.id)) next.delete(friend.id);
      else next.add(friend.id);
      return next;
    });
  }

  share(): void {
    const userIds = [...this.selected()];
    if (!userIds.length || this.saving()) return;
    this.saving.set(true);
    this.error.set(null);
    this.playlists.share(this.data.playlist.id, userIds).subscribe({
      next: (shares) => {
        console.debug('[PlaylistShare] Playlist partagée', this.data.playlist.id, userIds.length);
        this.shares.set(shares);
        this.selected.set(new Set());
        this.saving.set(false);
      },
      error: (error: Error) => {
        console.error('[PlaylistShare] Partage refusé', error);
        this.error.set(error.message);
        this.saving.set(false);
      },
    });
  }

  unshare(share: PlaylistShare): void {
    this.saving.set(true);
    this.error.set(null);
    this.playlists.unshare(this.data.playlist.id, share.id).subscribe({
      next: () => {
        console.debug('[PlaylistShare] Accès retiré', share.id);
        this.shares.update((shares) => shares.filter((item) => item.id !== share.id));
        this.saving.set(false);
      },
      error: (error: Error) => {
        console.error('[PlaylistShare] Retrait impossible', error);
        this.error.set(error.message);
        this.saving.set(false);
      },
    });
  }
}
