import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';
import { Page } from '../models/page.model';
import { Track } from '../models/track.model';
import { httpErrorMessage } from '../utils/http-error';

/** Encapsulates all HTTP operations for backing tracks. */
@Injectable({ providedIn: 'root' })
export class TrackService {
  private readonly http = inject(HttpClient);

  list(page = 1, limit = 5) {
    return this.http.get<Page<Track>>('/api/tracks', {
      params: { page, limit },
    });
  }

  /** Errors are emitted as `Error` objects whose message can be shown as is. */
  upload(file: File, title: string) {
    const body = new FormData();
    body.append('audio', file);
    body.append('title', title);
    return this.http
      .post<Track>('/api/tracks', body)
      .pipe(catchError((error: unknown) => throwError(() => new Error(uploadErrorMessage(error)))));
  }

  audio(id: string) {
    return this.http.get(`/api/tracks/${id}/audio`, {
      responseType: 'blob',
    });
  }
}

/** Multer answers "File too large" in English: translate the known server messages. */
function uploadErrorMessage(error: unknown): string {
  if (error instanceof HttpErrorResponse && error.status === 400) {
    const message = String(error.error?.message ?? '');
    if (message === 'File too large') return 'Fichier trop volumineux : 25 Mo maximum.';
    if (message === 'Format audio non accepté') {
      return 'Format refusé par le serveur. Formats acceptés : MP3, WAV, OGG ou M4A.';
    }
  }
  return httpErrorMessage(error);
}
