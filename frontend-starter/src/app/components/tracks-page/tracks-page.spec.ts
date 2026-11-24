import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Category } from '../../shared/models/category.model';
import { Track } from '../../shared/models/track.model';
import { TracksPageComponent } from './tracks-page';

describe('TracksPageComponent pagination', () => {
  let fixture: ComponentFixture<TracksPageComponent>;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [TracksPageComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    fixture = TestBed.createComponent(TracksPageComponent);
    httpTesting = TestBed.inject(HttpTestingController);
    httpTesting.expectOne('/api/categories').flush([]);
  });

  afterEach(() => httpTesting.verify());

  it('loads the selected page and page size from the server', () => {
    const firstPageRequest = httpTesting.expectOne(
      (request) =>
        request.url === '/api/tracks' &&
        request.params.get('page') === '1' &&
        request.params.get('limit') === '5',
    );
    firstPageRequest.flush({
      items: [],
      page: 1,
      limit: 5,
      total: 50,
      pages: 10,
    });

    fixture.componentInstance.pageChanged({
      pageIndex: 1,
      previousPageIndex: 0,
      pageSize: 5,
      length: 6,
    });

    const secondPageRequest = httpTesting.expectOne(
      (request) =>
        request.url === '/api/tracks' &&
        request.params.get('page') === '2' &&
        request.params.get('limit') === '5',
    );
    const secondPageTrack: Track = {
      id: 'track-6',
      title: 'Dernière piste',
      originalName: 'track-6.mp3',
      mimeType: 'audio/mpeg',
      size: 1024,
      createdAt: '2026-10-07T08:00:00.000Z',
    };
    secondPageRequest.flush({
      items: [secondPageTrack],
      page: 2,
      limit: 5,
      total: 50,
      pages: 10,
    });

    expect(fixture.componentInstance.page()).toBe(2);
    expect(fixture.componentInstance.tracks()).toEqual([secondPageTrack]);
    expect(fixture.componentInstance.loading()).toBe(false);

    fixture.componentInstance.pageChanged({
      pageIndex: 0,
      previousPageIndex: 1,
      pageSize: 10,
      length: 50,
    });

    const resizedPageRequest = httpTesting.expectOne(
      (request) =>
        request.url === '/api/tracks' &&
        request.params.get('page') === '1' &&
        request.params.get('limit') === '10',
    );
    resizedPageRequest.flush({
      items: [],
      page: 1,
      limit: 10,
      total: 50,
      pages: 5,
    });

    expect(fixture.componentInstance.page()).toBe(1);
    expect(fixture.componentInstance.limit()).toBe(10);
  });
});

describe('TracksPageComponent access menu', () => {
  let fixture: ComponentFixture<TracksPageComponent>;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [TracksPageComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    fixture = TestBed.createComponent(TracksPageComponent);
    httpTesting = TestBed.inject(HttpTestingController);
    httpTesting.expectOne('/api/categories').flush([]);
  });

  afterEach(() => httpTesting.verify());

  it('loads access options, marks the current one and saves a selection', () => {
    const track: Track = {
      id: 'track-1',
      title: 'Morceau de test',
      originalName: 'track.mp3',
      mimeType: 'audio/mpeg',
      size: 1024,
      createdAt: '2026-10-07T08:00:00.000Z',
      accesId: { _id: 'access-private', accesName: 'privé' },
    };
    httpTesting.expectOne('/api/tracks?page=1&limit=5').flush({
      items: [track],
      page: 1,
      limit: 5,
      total: 1,
      pages: 1,
    });
    fixture.detectChanges();

    const menuButton = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '.access-menu-toggle',
    );
    expect(menuButton).not.toBeNull();
    menuButton?.click();
    httpTesting.expectOne('/api/acces').flush([
      { _id: 'access-private', accesName: 'privé' },
      { _id: 'access-friendly', accesName: 'friendly' },
    ]);
    fixture.detectChanges();

    const options = (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>(
      '.access-option',
    );
    expect(options).toHaveLength(2);
    expect(options[0].getAttribute('aria-checked')).toBe('true');
    expect(options[0].textContent).toContain('privé');
    expect(options[0].textContent).not.toContain('access-private');
    expect(options[1].textContent).toContain('friendly');
    expect(options[1].textContent).not.toContain('access-friendly');
    expect(menuButton?.classList.contains('btn-icon')).toBe(true);
    options[1].click();

    const updateRequest = httpTesting.expectOne('/api/tracks/track-1/access');
    expect(updateRequest.request.method).toBe('PATCH');
    expect(updateRequest.request.body).toEqual({ accesId: 'access-friendly' });
    updateRequest.flush({ ...track, accesId: { _id: 'access-friendly', accesName: 'friendly' } });

    expect(fixture.componentInstance.tracks()[0].accesId?.accesName).toBe('friendly');
    expect(fixture.componentInstance.accessMenuTrackId()).toBeNull();
  });
});

describe('TracksPageComponent categories', () => {
  let fixture: ComponentFixture<TracksPageComponent>;
  let httpTesting: HttpTestingController;
  const category = (id: string, name: string, type: Category['type']): Category => ({
    _id: id,
    name,
    slug: id,
    type,
    parentId: null,
    description: '',
    image: { url: `/uploads/categories/${id}.jpg`, alt: name },
    isActive: true,
  });

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [TracksPageComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    fixture = TestBed.createComponent(TracksPageComponent);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpTesting.verify());

  it('shows the categories from the API and sends the selected ones with the upload', () => {
    httpTesting.expectOne('/api/tracks?page=1&limit=5').flush({ items: [], page: 1, limit: 5, total: 0, pages: 1 });
    httpTesting.expectOne('/api/categories').flush([
      category('pop', 'Pop', 'GENRE'),
      category('r-and-b', 'R&B', 'GENRE'),
      category('romantique', 'Romantique', 'MOOD'),
    ]);
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    const tiles = element.querySelectorAll<HTMLButtonElement>('.tile');
    expect(tiles).toHaveLength(2); // Genres tab only
    tiles[0].click();
    tiles[1].click();
    element.querySelectorAll<HTMLButtonElement>('.tab')[1].click();
    fixture.detectChanges();
    element.querySelector<HTMLButtonElement>('.tile')?.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.selectedCategoryIds()).toEqual(['pop', 'r-and-b', 'romantique']);
    expect(element.querySelectorAll('.chip')).toHaveLength(3);
    expect(element.querySelector('.tile')?.getAttribute('aria-pressed')).toBe('true');

    // Deselecting from the summary chips.
    element.querySelector<HTMLButtonElement>('.chip-remove')?.click();
    expect(fixture.componentInstance.selectedCategoryIds()).toEqual(['r-and-b', 'romantique']);

    fixture.componentInstance.file.set(new File(['x'], 'song.mp3', { type: 'audio/mpeg' }));
    fixture.componentInstance.upload();
    const request = httpTesting.expectOne('/api/tracks');
    expect((request.request.body as FormData).getAll('categoryIds')).toEqual(['r-and-b', 'romantique']);
  });

  it('edits the categories of a track in the dialog and updates its card', async () => {
    const track: Track = {
      id: 'track-1',
      title: 'Only Love',
      originalName: 'only-love.mp3',
      mimeType: 'audio/mpeg',
      size: 1024,
      createdAt: '2026-11-24T08:00:00.000Z',
      categoryIds: ['pop'],
      categories: [category('pop', 'Pop', 'GENRE')],
    };
    httpTesting.expectOne('/api/tracks?page=1&limit=5').flush({ items: [track], page: 1, limit: 5, total: 1, pages: 1 });
    httpTesting.expectOne('/api/categories').flush([category('pop', 'Pop', 'GENRE'), category('rock', 'Rock', 'GENRE')]);
    fixture.detectChanges();

    // The card no longer lists its categories: only the tag button gives access to them.
    const card = (fixture.nativeElement as HTMLElement).querySelector('.track-card') as HTMLElement;
    expect(card.textContent).not.toContain('Pop');
    const tagButton = card.querySelector<HTMLButtonElement>('button[aria-label="Modifier les catégories de Only Love"]');
    expect(tagButton?.disabled).toBe(false);
    tagButton?.click();
    fixture.detectChanges();
    await fixture.whenStable();
    const closed = firstValueFrom(TestBed.inject(MatDialog).openDialogs[0].afterClosed());
    const dialog = document.querySelector('app-track-categories-dialog') as HTMLElement;
    expect(dialog).not.toBeNull();
    const tiles = dialog.querySelectorAll<HTMLButtonElement>('.tile');
    expect(tiles[0].getAttribute('aria-pressed')).toBe('true'); // Pop already selected
    tiles[0].click(); // remove Pop
    tiles[1].click(); // add Rock
    fixture.detectChanges();
    [...dialog.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.includes('Enregistrer'))?.click();

    const request = httpTesting.expectOne('/api/tracks/track-1/categories');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({ categoryIds: ['rock'] });
    request.flush([category('rock', 'Rock', 'GENRE')]);
    await closed;

    expect(fixture.componentInstance.tracks()[0].categoryIds).toEqual(['rock']);
    expect(fixture.componentInstance.tracks()[0].categories?.map((c) => c.name)).toEqual(['Rock']);
  });
});
