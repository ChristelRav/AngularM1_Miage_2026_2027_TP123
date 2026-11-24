import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Track } from '../../shared/models/track.model';
import { DashboardPageComponent } from './dashboard-page';

describe('DashboardPageComponent', () => {
  let fixture: ComponentFixture<DashboardPageComponent>;
  let httpTesting: HttpTestingController;
  let element: HTMLElement;

  const track = (id: string, title: string, coverUrl: string | null = null): Track => ({
    id,
    title,
    originalName: `${id}.mp3`,
    mimeType: 'audio/mpeg',
    size: 1024,
    createdAt: '2026-11-24T08:00:00.000Z',
    coverUrl,
    accesId: { _id: 'a1', accesName: 'public' },
  });

  beforeEach(() => {
    // The test environment cannot turn a Blob into an object URL.
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:cover');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    TestBed.configureTestingModule({
      imports: [DashboardPageComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    fixture = TestBed.createComponent(DashboardPageComponent);
    httpTesting = TestBed.inject(HttpTestingController);
    element = fixture.nativeElement as HTMLElement;
  });

  afterEach(() => {
    httpTesting.verify();
    vi.restoreAllMocks();
  });

  it('shows the real track count and the latest tracks, without invented numbers', () => {
    httpTesting.expectOne('/api/tracks?page=1&limit=4').flush({
      items: [track('t1', 'Only Love', '/api/tracks/t1/cover'), track('t2', 'Ocean eyes')],
      page: 1,
      limit: 4,
      total: 7,
      pages: 2,
    });
    httpTesting.expectOne('/api/tracks/t1/cover').flush(new Blob(['x'], { type: 'image/png' }));
    fixture.detectChanges();

    const stats = [...element.querySelectorAll('.stat')].map((stat) => [
      stat.querySelector('.stat-label')?.textContent,
      stat.querySelector('.stat-value, .stat-soon')?.textContent,
    ]);
    expect(stats).toEqual([
      ['Musiques importées', '7'],
      ['Playlists', 'Bientôt disponible'],
      ['Albums', 'Bientôt disponible'],
    ]);

    const recent = [...element.querySelectorAll('.recent')];
    expect(recent.map((item) => item.querySelector('.recent-title')?.textContent)).toEqual(['Only Love', 'Ocean eyes']);
    // Cover and placeholder share the same frame.
    expect(recent[0].querySelector('.thumb > img')).not.toBeNull();
    expect(recent[1].querySelector('.thumb > .thumb-placeholder')).not.toBeNull();
    expect(element.querySelector('.activity')?.textContent).toContain('accès public');
  });

  it('shows an error with a retry button when the API fails', () => {
    httpTesting.expectOne('/api/tracks?page=1&limit=4').flush({ message: 'Erreur' }, { status: 500, statusText: 'Error' });
    fixture.detectChanges();
    expect(element.querySelector('[role="alert"]')).not.toBeNull();

    element.querySelector<HTMLButtonElement>('.retry')?.click();
    httpTesting.expectOne('/api/tracks?page=1&limit=4').flush({ items: [], page: 1, limit: 4, total: 0, pages: 0 });
    fixture.detectChanges();
    expect(element.querySelector('[role="alert"]')).toBeNull();
    expect(element.querySelector('.empty')?.textContent).toContain('Aucune musique');
  });
});
