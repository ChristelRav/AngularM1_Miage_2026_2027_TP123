import { Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { IconComponent } from '../../shared/components/icon/icon';
import { MatPaginatorIntl, MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { Track } from '../../shared/models/track.model';
import { AudioFormatPipe, FileSizePipe, ShortDatePipe } from '../../shared/pipes/track-format.pipes';
import { TrackService } from '../../shared/services/track.service';
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
export class TracksPageComponent {
  private readonly service = inject(TrackService);

  readonly limit = signal(5);
  readonly pageSizeOptions = [5, 10, 25, 50];
  readonly tracks = signal<Track[]>([]);
  readonly page = signal(1);
  readonly pages = signal(1);
  readonly total = signal(0);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly audioUrl = signal('');
  readonly title = new FormControl('', { nonNullable: true });
  readonly file = signal<File | null>(null);
  readonly uploading = signal(false);
  readonly uploadError = signal<string | null>(null);
  readonly uploadSuccess = signal<string | null>(null);
  private readonly fileInput = viewChild.required<ElementRef<HTMLInputElement>>('fileInput');

  constructor() {
    this.load();
  }

  choose(event: Event): void {
    this.file.set((event.target as HTMLInputElement).files?.[0] ?? null);
    this.uploadError.set(null);
    this.uploadSuccess.set(null);
    console.debug('[TracksPage] Fichier sélectionné', this.file()?.name);
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.service.list(this.page(), this.limit()).subscribe({
      next: (response) => {
        console.debug('[TracksPage] Pistes chargées', response.items.length);
        this.tracks.set(response.items);
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

    this.service.upload(file, this.title.value.trim() || file.name).subscribe({
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
    // A file input can only be cleared through its DOM value.
    this.fileInput().nativeElement.value = '';
  }

  play(track: Track): void {
    this.service.audio(track.id).subscribe({
      next: (blob) => {
        console.debug('[TracksPage] Audio chargé', track.id);
        const previousUrl = this.audioUrl();
        if (previousUrl) URL.revokeObjectURL(previousUrl);
        this.audioUrl.set(URL.createObjectURL(blob));
      },
      error: (error) => console.error('[TracksPage] Lecture impossible', error),
    });
  }
}
