import { Component, ElementRef, inject, OnDestroy, signal, viewChild } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { IconComponent } from '../../shared/components/icon/icon';
import { MatDialog } from '@angular/material/dialog';
import { MatPaginatorIntl, MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatSnackBar } from '@angular/material/snack-bar';
import {
  ConfirmDialogComponent,
  ConfirmDialogData,
} from '../../shared/components/confirm-dialog/confirm-dialog';
import { Track } from '../../shared/models/track.model';
import { AudioFormatPipe, FileSizePipe, ShortDatePipe } from '../../shared/pipes/track-format.pipes';
import { TrackRemovalError, TrackService } from '../../shared/services/track.service';
import { httpErrorMessage } from '../../shared/utils/http-error';

@Component({
  imports: [
    ReactiveFormsModule,
    IconComponent,
    MatPaginatorModule,
    AudioFormatPipe,
    FileSizePipe,
    ShortDatePipe,
  ],
  providers: [
    {
      provide: MatPaginatorIntl,
      useFactory: () => {
        const intl = new MatPaginatorIntl();
        intl.previousPageLabel = 'Précédent';
        intl.nextPageLabel = 'Suivant';
        intl.firstPageLabel = 'Première page';
        intl.lastPageLabel = 'Dernière page';
        intl.itemsPerPageLabel = 'Éléments par page :';
        return intl;
      },
    },
  ],
  templateUrl: './tracks-page.html',
  styleUrl: './tracks-page.css',
})
export class TracksPageComponent implements OnDestroy {
  private readonly service = inject(TrackService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  readonly limit = signal(5);
  readonly pageSizeOptions = [5, 10, 25, 50];
  readonly tracks = signal<Track[]>([]);
  readonly coverUrls = signal<Readonly<Record<string, string>>>({});
  readonly page = signal(1);
  readonly pages = signal(1);
  readonly total = signal(0);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly audioUrl = signal('');
  /** Id of the track loaded in the <audio> player. */
  private readonly playingTrackId = signal<string | null>(null);
  readonly title = new FormControl('', { nonNullable: true });
  readonly file = signal<File | null>(null);
  readonly cover = signal<File | null>(null);
  readonly uploading = signal(false);
  readonly uploadError = signal<string | null>(null);
  readonly uploadSuccess = signal<string | null>(null);
  private readonly fileInput = viewChild.required<ElementRef<HTMLInputElement>>('fileInput');
  private readonly coverInput = viewChild.required<ElementRef<HTMLInputElement>>('coverInput');
  /** Ids of the tracks whose DELETE request is in flight. */
  readonly deletingIds = signal<ReadonlySet<string>>(new Set());
  private coverLoadVersion = 0;

  constructor() {
    this.load();
  }

  choose(event: Event): void {
    this.file.set((event.target as HTMLInputElement).files?.[0] ?? null);
    this.uploadError.set(null);
    this.uploadSuccess.set(null);
    console.debug('[TracksPage] Fichier sélectionné', this.file()?.name);
  }

  chooseCover(event: Event): void {
    this.cover.set((event.target as HTMLInputElement).files?.[0] ?? null);
  }

  load(): void {
    const coverLoadVersion = ++this.coverLoadVersion;
    this.clearCoverUrls();
    this.loading.set(true);
    this.error.set(null);
    this.service.list(this.page(), this.limit()).subscribe({
      next: (response) => {
        console.debug('[TracksPage] Pistes chargées', response.items.length);
        this.tracks.set(response.items);
        this.loadCovers(response.items, coverLoadVersion);
        this.page.set(response.page);
        this.pages.set(response.pages);
        this.total.set(response.total);
        this.loading.set(false);
      },
      error: (error) => {
        console.error('[TracksPage] Chargement impossible', error);
        this.error.set(httpErrorMessage(error));
        this.loading.set(false);
      },
    });
  }

  ngOnDestroy(): void {
    this.coverLoadVersion++;
    this.clearCoverUrls();
    if (this.audioUrl()) URL.revokeObjectURL(this.audioUrl());
  }

  go(page: number, limit = this.limit()): void {
    this.page.set(page);
    this.limit.set(limit);
    this.load();
  }

  pageChanged(event: PageEvent): void {
    this.go(event.pageIndex + 1, event.pageSize);
  }

  upload(): void {
    const file = this.file();
    // Guard against double submissions while a request is in flight.
    if (!file || this.uploading()) return;

    this.uploading.set(true);
    this.uploadError.set(null);
    this.uploadSuccess.set(null);

    this.service.upload(file, this.title.value.trim() || file.name, this.cover()).subscribe({
      next: (track) => {
        console.debug('[TracksPage] Piste envoyée', track.id);
        this.uploading.set(false);
        this.uploadSuccess.set(`« ${track.title} » a bien été ajouté à votre bibliothèque.`);
        this.resetUploadForm();
        this.go(1);
      },
      error: (error: Error) => {
        this.uploading.set(false);
        this.uploadError.set(error.message);
      },
    });
  }

  private resetUploadForm(): void {
    this.title.setValue('');
    this.file.set(null);
    this.cover.set(null);
    // A file input can only be cleared through its DOM value.
    this.fileInput().nativeElement.value = '';
    this.coverInput().nativeElement.value = '';
  }

  private loadCovers(tracks: Track[], version: number): void {
    for (const track of tracks) {
      if (!track.coverUrl) continue;
      this.service.cover(track.id).subscribe({
        next: (blob) => {
          const url = URL.createObjectURL(blob);
          if (version !== this.coverLoadVersion) {
            URL.revokeObjectURL(url);
            return;
          }
          this.coverUrls.update((urls) => ({ ...urls, [track.id]: url }));
        },
        error: (error) => console.error(`[TracksPage] Couverture impossible à charger (${track.id})`, error),
      });
    }
  }

  private clearCoverUrls(): void {
    for (const url of Object.values(this.coverUrls())) URL.revokeObjectURL(url);
    this.coverUrls.set({});
  }

  play(track: Track): void {
    this.service.audio(track.id).subscribe({
      next: (blob) => {
        console.debug('[TracksPage] Audio chargé', track.id);
        const previousUrl = this.audioUrl();
        if (previousUrl) URL.revokeObjectURL(previousUrl);
        this.audioUrl.set(URL.createObjectURL(blob));
        this.playingTrackId.set(track.id);
      },
      error: (error) => console.error('[TracksPage] Lecture impossible', error),
    });
  }

  remove(track: Track): void {
    // Ignore clicks while this track is already being deleted.
    if (this.deletingIds().has(track.id)) return;

    this.dialog
      .open<ConfirmDialogComponent, ConfirmDialogData, boolean>(ConfirmDialogComponent, {
        data: {
          title: 'Supprimer ce morceau ?',
          message: `« ${track.title} » sera définitivement supprimé de votre bibliothèque. Cette action est irréversible.`,
          confirmLabel: 'Supprimer',
        },
      })
      .afterClosed()
      .subscribe((confirmed) => {
        if (confirmed) this.deleteTrack(track);
      });
  }

  private deleteTrack(track: Track): void {
    this.setDeleting(track.id, true);

    this.service.remove(track.id).subscribe({
      next: () => {
        this.setDeleting(track.id, false);
        this.stopPlaybackOf(track.id);
        this.notify(`« ${track.title} » a été supprimé.`);
        this.refreshAfterRemoval();
      },
      error: (error: TrackRemovalError) => {
        this.setDeleting(track.id, false);
        this.notify(error.message, true);
        // Already deleted elsewhere (other tab) or not ours: the card must disappear.
        if (error.trackGone) {
          this.stopPlaybackOf(track.id);
          this.refreshAfterRemoval();
        }
      },
    });
  }

  /**
   * The player reads a Blob already downloaded in memory, so deleting the file on the
   * server does not stop it. Removing the <audio> element (via @if) pauses playback,
   * and revoking the ObjectURL frees the Blob.
   */
  private stopPlaybackOf(trackId: string): void {
    if (this.playingTrackId() !== trackId) return;
    URL.revokeObjectURL(this.audioUrl());
    this.audioUrl.set('');
    this.playingTrackId.set(null);
  }

  /** Reloads the current page, or the previous one if its last card was just removed. */
  private refreshAfterRemoval(): void {
    if (this.tracks().length === 1 && this.page() > 1) {
      this.go(this.page() - 1);
    } else {
      this.load();
    }
  }

  private setDeleting(id: string, deleting: boolean): void {
    this.deletingIds.update((ids) => {
      const next = new Set(ids);
      if (deleting) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  private notify(message: string, isError = false): void {
    this.snackBar.open(message, 'OK', {
      duration: isError ? 8000 : 4000,
      panelClass: isError ? 'snack-error' : 'snack-success',
    });
  }
}
