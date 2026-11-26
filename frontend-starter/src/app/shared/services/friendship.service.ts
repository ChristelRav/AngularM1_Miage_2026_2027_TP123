import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { catchError, tap, throwError } from 'rxjs';
import { Friend, Friendship } from '../models/friendship.model';
import { httpErrorMessage } from '../utils/http-error';

/**
 * Friend requests and friends of the signed-in user. The received requests are kept in a Signal
 * so that the navbar bell and its badge always show the server's current list.
 */
@Injectable({ providedIn: 'root' })
export class FriendshipService {
  private readonly http = inject(HttpClient);

  /** Pending requests received by the signed-in user (source of the notification badge). */
  readonly received = signal<Friendship[]>([]);
  readonly pendingCount = computed(() => this.received().length);
  /** Incremented after each change (sent, accepted, rejected) so that other views can reload. */
  readonly version = signal(0);

  /** Reloads the received requests from the API and updates the badge. */
  refreshReceived() {
    return this.http
      .get<Friendship[]>('/api/friendships/received')
      .pipe(tap((requests) => this.received.set(requests)));
  }

  sent() {
    return this.http.get<Friendship[]>('/api/friendships/sent');
  }

  friends() {
    return this.http.get<Friend[]>('/api/friends');
  }

  /** Errors are emitted as `Error` objects whose message can be shown as is. */
  send(email: string) {
    return this.http.post<Friendship>('/api/friendships', { email: email.trim().toLowerCase() }).pipe(
      tap(() => this.changed()),
      catchError((error: unknown) => throwError(() => new Error(httpErrorMessage(error)))),
    );
  }

  accept(id: string) {
    return this.answer(id, 'accept');
  }

  reject(id: string) {
    return this.answer(id, 'reject');
  }

  /** Called on logout: the next user must not see the previous user's notifications. */
  clear(): void {
    this.received.set([]);
  }

  private answer(id: string, action: 'accept' | 'reject') {
    return this.http.patch<Friendship>(`/api/friendships/${id}/${action}`, {}).pipe(
      tap(() => {
        // The answered request leaves the list at once; the caller then reloads it from the API.
        this.received.update((requests) => requests.filter((request) => request.id !== id));
        this.changed();
      }),
      catchError((error: unknown) => throwError(() => new Error(httpErrorMessage(error)))),
    );
  }

  private changed(): void {
    this.version.update((version) => version + 1);
  }
}
