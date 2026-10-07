import { Component, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { IconComponent } from '../../shared/components/icon/icon';
import { MatPaginatorIntl, MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { Track } from '../../shared/models/track.model';
import { TrackService } from '../../shared/services/track.service';
import { httpErrorMessage } from '../../shared/utils/http-error';

@Component({
  imports: [ReactiveFormsModule, IconComponent, MatPaginatorModule],
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
  file?: File;

  constructor() {
    this.load();
  }

  choose(event: Event): void {
    this.file = (event.target as HTMLInputElement).files?.[0];
    console.debug('[TracksPage] Fichier sélectionné', this.file?.name);
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
    if (!this.file) return;

    this.service.upload(this.file, this.title.value || this.file.name).subscribe({
      next: (track) => {
        console.debug('[TracksPage] Piste envoyée', track.id);
        this.title.setValue('');
        this.file = undefined;
        this.page.set(1);
        this.load();
      },
      error: (error) => console.error('[TracksPage] Envoi impossible', error),
    });
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
