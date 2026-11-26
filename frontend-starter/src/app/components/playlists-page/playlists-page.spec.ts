import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Playlist } from '../../shared/models/playlist.model';
import { PlaylistsPageComponent } from './playlists-page';

const playlist = (id: string, name: string, isOwner: boolean, trackCount = 2): Playlist => ({
  id,
  name,
  owner: { id: isOwner ? 'me' : 'friend', name: isOwner ? 'Demo' : 'Lucas' },
  isOwner,
  trackIds: Array.from({ length: trackCount }, (_, i) => `t${i + 1}`),
  trackCount,
  covers: [],
  ...(isOwner ? { sharedWithCount: 1 } : {}),
  createdAt: '2026-11-25T08:00:00.000Z',
  updatedAt: '2026-11-25T08:00:00.000Z',
});

describe('PlaylistsPageComponent', () => {
  let fixture: ComponentFixture<PlaylistsPageComponent>;
  let httpTesting: HttpTestingController;
  let element: HTMLElement;

  const names = (section: string) =>
    [...element.querySelectorAll(`[aria-label="${section}"] .playlist-name`)].map((a) => a.textContent?.trim());

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [PlaylistsPageComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    fixture = TestBed.createComponent(PlaylistsPageComponent);
    httpTesting = TestBed.inject(HttpTestingController);
    element = fixture.nativeElement as HTMLElement;
  });

  afterEach(() => httpTesting.verify());

  it('shows my playlists with their actions, and the shared ones in read-only', () => {
    httpTesting.expectOne('/api/playlists').flush([playlist('p1', 'Mes favoris', true), playlist('p2', 'Vide', true, 0)]);
    httpTesting.expectOne('/api/playlists/shared').flush([playlist('p3', 'Road trip', false)]);
    fixture.detectChanges();

    expect(names('Mes playlists')).toEqual(['Mes favoris', 'Vide']);
    expect(names('Playlists partagées avec moi')).toEqual(['Road trip']);
    const mine = element.querySelector('[aria-label="Mes playlists"]')!;
    const shared = element.querySelector('[aria-label="Playlists partagées avec moi"]')!;
    // The ⋯ menu (rename, share, delete) only exists on the user's own playlists.
    expect(mine.querySelectorAll('.menu-toggle')).toHaveLength(2);
    expect(shared.querySelectorAll('.menu-toggle')).toHaveLength(0);
    expect(shared.textContent).toContain('par Lucas');
    expect(mine.textContent).toContain('2 musiques');
    expect(mine.textContent).toContain('partagée avec 1 ami');
    // An empty playlist has nothing to play.
    const playButtons = [...mine.querySelectorAll<HTMLButtonElement>('.play')];
    expect(playButtons.map((button) => button.disabled)).toEqual([false, true]);
  });

  it('opens the playlist and starts it from the play button', () => {
    httpTesting.expectOne('/api/playlists').flush([]);
    httpTesting.expectOne('/api/playlists/shared').flush([playlist('p3', 'Road trip', false)]);
    fixture.detectChanges();
    const router = TestBed.inject(Router);
    const calls: unknown[] = [];
    router.navigate = ((...args: unknown[]) => {
      calls.push(args);
      return Promise.resolve(true);
    }) as Router['navigate'];

    element.querySelector<HTMLButtonElement>('.play')!.click();
    expect(calls).toEqual([[['/playlists', 'p3'], { queryParams: { play: 1 } }]]);
    expect(element.querySelector('[aria-label="Mes playlists"] .empty')?.textContent).toContain('pas encore de playlist');
  });

  it('shows an error with a retry button for each section', () => {
    httpTesting.expectOne('/api/playlists').flush({ message: 'Erreur serveur' }, { status: 500, statusText: 'Error' });
    httpTesting.expectOne('/api/playlists/shared').flush([]);
    fixture.detectChanges();
    expect(element.querySelector('[role="alert"]')?.textContent).toContain('Erreur serveur');
    element.querySelector<HTMLButtonElement>('.retry')!.click();
    httpTesting.expectOne('/api/playlists').flush([]);
    fixture.detectChanges();
    expect(element.querySelector('[role="alert"]')).toBeNull();
  });
});
