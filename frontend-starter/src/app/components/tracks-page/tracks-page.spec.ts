import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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
