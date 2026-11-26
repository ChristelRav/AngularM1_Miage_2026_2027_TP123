import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, Observable, throwError } from 'rxjs';
import { Playlist, PlaylistShare } from '../models/playlist.model';
import { httpErrorMessage } from '../utils/http-error';

/**
 * HTTP operations for playlists. Errors are emitted as `Error` objects whose message
 * (sent by the server) can be shown as is.
 */
@Injectable({ providedIn: 'root' })
export class PlaylistService {
  private readonly http = inject(HttpClient);

  mine() {
    return this.http.get<Playlist[]>('/api/playlists').pipe(readable());
  }

  sharedWithMe() {
    return this.http.get<Playlist[]>('/api/playlists/shared').pipe(readable());
  }

  get(id: string) {
    return this.http.get<Playlist>(`/api/playlists/${id}`).pipe(readable());
  }

  create(name: string) {
    return this.http.post<Playlist>('/api/playlists', { name }).pipe(readable());
  }

  rename(id: string, name: string) {
    return this.http.patch<Playlist>(`/api/playlists/${id}`, { name }).pipe(readable());
  }

  remove(id: string) {
    return this.http.delete<void>(`/api/playlists/${id}`).pipe(readable());
  }

  addTrack(id: string, trackId: string) {
    return this.http.post<Playlist>(`/api/playlists/${id}/tracks`, { trackId }).pipe(readable());
  }

  removeTrack(id: string, trackId: string) {
    return this.http.delete<void>(`/api/playlists/${id}/tracks/${trackId}`).pipe(readable());
  }

  shares(id: string) {
    return this.http.get<PlaylistShare[]>(`/api/playlists/${id}/shares`).pipe(readable());
  }

  share(id: string, userIds: string[]) {
    return this.http.post<PlaylistShare[]>(`/api/playlists/${id}/shares`, { userIds }).pipe(readable());
  }

  unshare(id: string, userId: string) {
    return this.http.delete<void>(`/api/playlists/${id}/shares/${userId}`).pipe(readable());
  }

  /** Audio or cover of a playlist track, downloaded with the JWT (an <audio> or <img> tag cannot send it). */
  file(url: string) {
    return this.http.get(url, { responseType: 'blob' }).pipe(readable());
  }
}

function readable<T>() {
  return (source: Observable<T>) =>
    source.pipe(catchError((error: unknown) => throwError(() => new Error(httpErrorMessage(error)))));
}
