import { provideHttpClient } from '@angular/common/http';
import { Component, input, output, signal } from '@angular/core';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TrackPlayerComponent } from '../../shared/components/track-player/track-player';
import { Playlist, PlaylistTrack } from '../../shared/models/playlist.model';
import { AudioContextService } from '../../shared/services/audio-context.service';
import { PlaylistPageComponent } from './playlist-page';

/** Stands for the real player: only its inputs and its `ended` output matter here. */
@Component({ selector: 'app-track-player', template: '' })
class FakePlayerComponent {
  readonly src = input.required<string>();
  readonly label = input.required<string>();
  readonly ended = output<void>();
}

const track = (id: string, title: string): PlaylistTrack => ({
  id,
  title,
  originalName: `${id}.mp3`,
  mimeType: 'audio/mpeg',
  size: 1024,
  createdAt: '2026-11-25T08:00:00.000Z',
  coverUrl: null,
  audioUrl: `/api/playlists/p1/tracks/${id}/audio`,
});

const detail = (isOwner: boolean): Playlist => {
  const tracks = [track('t1', 'Intro'), track('t2', 'Solo'), track('t3', 'Outro')];
  return {
    id: 'p1',
    name: 'Répétition',
    owner: { id: isOwner ? 'me' : 'friend', name: isOwner ? 'Demo' : 'Lucas' },
    isOwner,
    trackIds: tracks.map((item) => item.id),
    trackCount: tracks.length,
    covers: [],
    tracks,
    createdAt: '2026-11-25T08:00:00.000Z',
    updatedAt: '2026-11-25T08:00:00.000Z',
  };
};

describe('PlaylistPageComponent', () => {
  let fixture: ComponentFixture<PlaylistPageComponent>;
  let httpTesting: HttpTestingController;
  let element: HTMLElement;
  let objectUrls = 0;

  const create = (query: Record<string, string> = {}) => {
    TestBed.configureTestingModule({
      imports: [PlaylistPageComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        // No Web Audio API in the test environment.
        { provide: AudioContextService, useValue: { unlock: () => undefined, playingSource: signal(null) } },
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: of(convertToParamMap({ id: 'p1' })),
            snapshot: { queryParamMap: convertToParamMap(query) },
          },
        },
      ],
    });
    // The real player is not needed here: only its inputs and its `ended` output are checked.
    TestBed.overrideComponent(PlaylistPageComponent, {
      remove: { imports: [TrackPlayerComponent] },
      add: { imports: [FakePlayerComponent] },
    });
    fixture = TestBed.createComponent(PlaylistPageComponent);
    httpTesting = TestBed.inject(HttpTestingController);
    element = fixture.nativeElement as HTMLElement;
  };
  const flushAudio = (id: string) =>
    httpTesting.expectOne(`/api/playlists/p1/tracks/${id}/audio`).flush(new Blob([id], { type: 'audio/mpeg' }));
  const nowPlaying = () => element.querySelector('.now-text b')?.textContent;

  beforeEach(() => {
    objectUrls = 0;
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:${++objectUrls}`);
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  });

  afterEach(() => {
    httpTesting.verify();
    vi.restoreAllMocks();
  });

  it('plays the tracks in the order of trackIds, with next, previous and auto-next', () => {
    create({ play: '1' });
    httpTesting.expectOne('/api/playlists/p1').flush(detail(true));
    flushAudio('t1');
    fixture.detectChanges();
    expect([...element.querySelectorAll('.track-text b')].map((b) => b.textContent)).toEqual(['Intro', 'Solo', 'Outro']);
    expect(nowPlaying()).toBe('Intro');
    // A single player for the whole playlist.
    expect(element.querySelectorAll('app-track-player')).toHaveLength(1);

    element.querySelector<HTMLButtonElement>('[aria-label="Musique suivante"]')!.click();
    flushAudio('t2');
    fixture.detectChanges();
    expect(nowPlaying()).toBe('Solo');

    // End of a track: the next one starts.
    fixture.debugElement.query(By.directive(FakePlayerComponent)).componentInstance.ended.emit();
    flushAudio('t3');
    fixture.detectChanges();
    expect(nowPlaying()).toBe('Outro');
    expect(element.querySelector<HTMLButtonElement>('[aria-label="Musique suivante"]')!.disabled).toBe(true);

    element.querySelector<HTMLButtonElement>('[aria-label="Musique précédente"]')!.click();
    flushAudio('t2');
    fixture.detectChanges();
    expect(nowPlaying()).toBe('Solo');
  });

  it('lets the owner remove a track, and keeps playing the current one', () => {
    create();
    httpTesting.expectOne('/api/playlists/p1').flush(detail(true));
    fixture.detectChanges();
    element.querySelectorAll<HTMLButtonElement>('[aria-label^="Lire"]')[1].click();
    flushAudio('t2');
    fixture.detectChanges();

    element.querySelector<HTMLButtonElement>('[aria-label="Retirer Intro de la playlist"]')!.click();
    const request = httpTesting.expectOne('/api/playlists/p1/tracks/t1');
    expect(request.request.method).toBe('DELETE');
    request.flush(null, { status: 204, statusText: 'No Content' });
    fixture.detectChanges();
    expect([...element.querySelectorAll('.track-text b')].map((b) => b.textContent)).toEqual(['Solo', 'Outro']);
    expect(nowPlaying()).toBe('Solo');
    expect(element.querySelector('.track-row.playing .track-text b')?.textContent).toBe('Solo');
  });

  it('shows a shared playlist without any editing control', () => {
    create();
    httpTesting.expectOne('/api/playlists/p1').flush(detail(false));
    fixture.detectChanges();
    expect(element.querySelector('.eyebrow')?.textContent).toContain('PARTAGÉE PAR LUCAS');
    expect(element.querySelectorAll('[aria-label^="Retirer"]')).toHaveLength(0);
    expect(element.textContent).not.toContain('Ajouter des musiques');
    expect(element.textContent).not.toContain('Partager');
    expect(element.querySelector('[aria-label="Autres actions"]')).toBeNull();
    // Listening is allowed.
    element.querySelector<HTMLButtonElement>('.listen')!.click();
    flushAudio('t1');
    fixture.detectChanges();
    expect(nowPlaying()).toBe('Intro');
  });

  it('explains when the playlist is no longer accessible', () => {
    create();
    httpTesting.expectOne('/api/playlists/p1').flush({ message: 'Playlist inconnue' }, { status: 404, statusText: 'Not Found' });
    fixture.detectChanges();
    expect(element.querySelector('[role="alert"]')?.textContent).toContain('Playlist inconnue');
    expect(element.textContent).toContain('n’est plus partagée avec vous');
  });
});
