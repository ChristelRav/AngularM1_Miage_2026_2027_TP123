import { inject, Injectable } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { catchError, EMPTY, filter, map, Observable, switchMap, tap } from 'rxjs';
import { ConfirmDialogComponent, ConfirmDialogData } from '../components/confirm-dialog/confirm-dialog';
import {
  PlaylistNameDialogComponent,
  PlaylistNameDialogData,
} from '../components/playlist-name-dialog/playlist-name-dialog';
import {
  PlaylistShareDialogComponent,
  PlaylistShareDialogData,
} from '../components/playlist-share-dialog/playlist-share-dialog';
import { Playlist } from '../models/playlist.model';
import { PlaylistService } from './playlist.service';

/**
 * Owner actions on a playlist, shared by the playlists page and the playlist page: open the dialog,
 * call the API, show the result in a snack bar. Each method emits only on success.
 */
@Injectable({ providedIn: 'root' })
export class PlaylistActionsService {
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly playlists = inject(PlaylistService);

  create(): Observable<Playlist> {
    return this.askName({ title: 'Nouvelle playlist', confirmLabel: 'Créer' }).pipe(
      switchMap((name) => this.playlists.create(name).pipe(this.handle(`Playlist « ${name} » créée.`))),
    );
  }

  rename(playlist: Playlist): Observable<Playlist> {
    return this.askName({ title: 'Renommer la playlist', confirmLabel: 'Enregistrer', name: playlist.name }).pipe(
      filter((name) => name !== playlist.name),
      switchMap((name) => this.playlists.rename(playlist.id, name).pipe(this.handle('Playlist renommée.'))),
    );
  }

  /** Emits the number of friends who have access when the dialog closes. */
  share(playlist: Playlist): Observable<number> {
    return this.dialog
      .open<PlaylistShareDialogComponent, PlaylistShareDialogData, number>(PlaylistShareDialogComponent, {
        data: { playlist },
        width: '480px',
        maxWidth: '95vw',
      })
      .afterClosed()
      .pipe(filter((count): count is number => typeof count === 'number'));
  }

  remove(playlist: Playlist): Observable<void> {
    return this.dialog
      .open<ConfirmDialogComponent, ConfirmDialogData, boolean>(ConfirmDialogComponent, {
        data: {
          title: 'Supprimer cette playlist ?',
          message: `« ${playlist.name} » sera supprimée. Vos backing tracks ne sont pas supprimées.`,
          confirmLabel: 'Supprimer',
        },
      })
      .afterClosed()
      .pipe(
        filter(Boolean),
        switchMap(() => this.playlists.remove(playlist.id).pipe(this.handle('Playlist supprimée.'))),
        map(() => undefined),
      );
  }

  notify(message: string, isError = false): void {
    this.snackBar.open(message, 'OK', {
      duration: isError ? 8000 : 4000,
      panelClass: isError ? 'snack-error' : 'snack-success',
    });
  }

  private askName(data: PlaylistNameDialogData): Observable<string> {
    return this.dialog
      .open<PlaylistNameDialogComponent, PlaylistNameDialogData, string>(PlaylistNameDialogComponent, {
        data,
        width: '420px',
        maxWidth: '95vw',
      })
      .afterClosed()
      .pipe(filter((name): name is string => !!name));
  }

  /** Success message, or error message and nothing emitted. */
  private handle<T>(success: string) {
    return (source: Observable<T>) =>
      source.pipe(
        tap(() => this.notify(success)),
        catchError((error: Error) => {
          console.error('[PlaylistActions] Action impossible', error);
          this.notify(error.message, true);
          return EMPTY;
        }),
      );
  }
}
