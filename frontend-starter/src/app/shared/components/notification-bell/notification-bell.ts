import { Component, DestroyRef, ElementRef, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Friendship, initialsOf } from '../../models/friendship.model';
import { ShortDatePipe } from '../../pipes/track-format.pipes';
import { FriendshipService } from '../../services/friendship.service';
import { httpErrorMessage } from '../../utils/http-error';
import { IconComponent } from '../icon/icon';

/** The badge is reloaded every minute while the tab is visible, and after every action. */
const REFRESH_INTERVAL = 60_000;

/**
 * Navbar bell: badge with the number of friend requests received and still pending, and a dropdown
 * to accept or reject them. Only real data from `GET /api/friendships/received`.
 */
@Component({
  selector: 'app-notification-bell',
  imports: [RouterLink, IconComponent, ShortDatePipe],
  templateUrl: './notification-bell.html',
  styleUrl: './notification-bell.css',
  host: {
    '(document:click)': 'closeOnOutsideClick($event)',
    '(document:keydown.escape)': 'close()',
  },
})
export class NotificationBellComponent {
  readonly friendships = inject(FriendshipService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  readonly open = signal(false);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  /** Id of the request whose answer is being sent (its buttons are disabled meanwhile). */
  readonly busyId = signal<string | null>(null);
  readonly initialsOf = initialsOf;

  constructor() {
    this.refresh();
    const timer = window.setInterval(() => {
      if (!document.hidden) this.refresh();
    }, REFRESH_INTERVAL);
    const onVisible = () => {
      if (!document.hidden) this.refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      this.friendships.clear();
    });
  }

  toggle(): void {
    this.open.update((open) => !open);
    if (this.open()) {
      this.error.set(null);
      this.refresh();
    }
  }

  close(): void {
    this.open.set(false);
  }

  closeOnOutsideClick(event: MouseEvent): void {
    if (this.open() && !this.host.contains(event.target as Node)) this.close();
  }

  refresh(): void {
    this.loading.set(true);
    this.friendships.refreshReceived().subscribe({
      next: (requests) => {
        // The error of a previous action stays visible: it is cleared when the panel is reopened.
        console.debug('[NotificationBell] Demandes reçues', requests.length);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        console.error('[NotificationBell] Chargement des demandes impossible', error);
        this.error.set(httpErrorMessage(error));
        this.loading.set(false);
      },
    });
  }

  accept(request: Friendship): void {
    this.answer(request, 'accept');
  }

  reject(request: Friendship): void {
    this.answer(request, 'reject');
  }

  private answer(request: Friendship, action: 'accept' | 'reject'): void {
    this.busyId.set(request.id);
    this.error.set(null);
    this.friendships[action](request.id).subscribe({
      next: () => {
        console.debug(`[NotificationBell] Demande ${action === 'accept' ? 'acceptée' : 'refusée'}`, request.id);
        this.busyId.set(null);
        // Reload from the API: the badge shows the server's count, not a local guess.
        this.refresh();
      },
      error: (error: Error) => {
        console.error('[NotificationBell] Réponse impossible', error);
        this.busyId.set(null);
        this.error.set(error.message);
        // The request may have been handled elsewhere (409): resynchronize the list.
        this.refresh();
      },
    });
  }
}
