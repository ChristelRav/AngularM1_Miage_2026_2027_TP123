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
  upload(file: File, title: string, cover?: File | null) {
    const body = new FormData();
    body.append('audio', file);
    body.append('title', title);
    if (cover) body.append('cover', cover);
    return this.http
      .post<Track>('/api/tracks', body)
      .pipe(catchError((error: unknown) => throwError(() => new Error(uploadErrorMessage(error)))));
  }

  audio(id: string) {
    return this.http.get(`/api/tracks/${id}/audio`, {
      responseType: 'blob',
    });
  }

  cover(id: string) {
    return this.http.get(`/api/tracks/${id}/cover`, {
      responseType: 'blob',
    });
  }

  /** Errors are emitted as `TrackRemovalError`, whose message can be shown as is. */
  remove(id: string) {
    return this.http
      .delete<void>(`/api/tracks/${id}`)
      .pipe(catchError((error: unknown) => throwError(() => removalError(error))));
  }
}

/** Removal failure; `trackGone` tells whether the track is no longer in the library anyway. */
export class TrackRemovalError extends Error {
  constructor(
    message: string,
    readonly trackGone: boolean,
  ) {
    super(message);
  }
}

function removalError(error: unknown): TrackRemovalError {
  if (error instanceof HttpErrorResponse) {
    // The backend filters on ownerId: a deleted track and someone else's track both give 404.
    if (error.status === 404) {
      return new TrackRemovalError(
        'Ce morceau n’existe plus ou ne vous appartient pas. La liste a été mise à jour.',
        true,
      );
    }
    // 500 "Métadonnée supprimée, mais fichier audio non supprimé": gone from the library.
    if (error.status === 500 && error.error?.message?.startsWith('Métadonnée supprimée')) {
      return new TrackRemovalError(
        'Le morceau a été retiré de la bibliothèque, mais son fichier n’a pas pu être effacé du serveur.',
        true,
      );
    }
  }
  return new TrackRemovalError(httpErrorMessage(error), false);
}

/** Multer answers "File too large" in English: translate the known server messages. */
function uploadErrorMessage(error: unknown): string {
  if (error instanceof HttpErrorResponse && error.status === 400) {
    const message = String(error.error?.message ?? '');
    if (message === 'File too large') return 'Fichier trop volumineux : 25 Mo maximum.';
    if (message === 'Format audio non accepté') {
      return 'Format refusé par le serveur. Formats acceptés : MP3, WAV, OGG ou M4A.';
    }
    if (message === 'Format image non accepté') {
      return 'Format d’image refusé. Formats acceptés : JPEG, PNG ou WebP.';
    }
  }
  return httpErrorMessage(error);
}
