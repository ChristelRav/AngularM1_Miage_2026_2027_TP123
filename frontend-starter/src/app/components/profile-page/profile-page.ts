import { Component, effect, inject, signal, untracked } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { IconComponent } from '../../shared/components/icon/icon';
import { Friend, Friendship, initialsOf } from '../../shared/models/friendship.model';
import { ShortDatePipe } from '../../shared/pipes/track-format.pipes';
import { AuthService } from '../../shared/services/auth.service';
import { FriendshipService } from '../../shared/services/friendship.service';
import { httpErrorMessage } from '../../shared/utils/http-error';

@Component({
  imports: [ReactiveFormsModule, IconComponent, ShortDatePipe],
  templateUrl: './profile-page.html',
  styleUrl: './profile-page.css',
})
export class ProfilePageComponent {
  readonly auth = inject(AuthService);
  private readonly friendships = inject(FriendshipService);
  readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
  });

  /** Friend request form: the other user is found by the email of their account. */
  readonly friendForm = new FormGroup({
    email: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email] }),
  });
  readonly friendEmail = this.friendForm.controls.email;
  readonly friends = signal<Friend[]>([]);
  readonly sentRequests = signal<Friendship[]>([]);
  readonly friendsError = signal<string | null>(null);
  readonly sending = signal(false);
  readonly sendResult = signal<{ ok: boolean; message: string } | null>(null);
  readonly initialsOf = initialsOf;

  constructor() {
    this.load();
    // Reloads the friends when a request is sent here or answered from the navbar bell.
    effect(() => {
      this.friendships.version();
      untracked(() => this.loadFriends());
    });
  }

  load(): void {
    this.auth.profile().subscribe({
      next: (user) => {
        console.debug('[ProfilePage] Profil chargé', user.id);
        this.form.setValue({ name: user.name });
      },
      error: (error) => console.error('[ProfilePage] Chargement impossible', error),
    });
  }

  save(): void {
    this.auth.update(this.form.getRawValue().name).subscribe({
      next: (user) => console.debug('[ProfilePage] Profil enregistré', user.id),
      error: (error) => console.error('[ProfilePage] Enregistrement impossible', error),
    });
  }

  loadFriends(): void {
    this.friendsError.set(null);
    this.friendships.friends().subscribe({
      next: (friends) => {
        console.debug('[ProfilePage] Amis chargés', friends.length);
        this.friends.set(friends);
      },
      error: (error: unknown) => {
        console.error('[ProfilePage] Chargement des amis impossible', error);
        this.friendsError.set(httpErrorMessage(error));
      },
    });
    this.friendships.sent().subscribe({
      next: (requests) => this.sentRequests.set(requests),
      error: (error: unknown) => {
        console.error('[ProfilePage] Chargement des demandes envoyées impossible', error);
        this.friendsError.set(httpErrorMessage(error));
      },
    });
  }

  sendRequest(): void {
    if (this.friendEmail.invalid || this.sending()) {
      this.friendEmail.markAsTouched();
      return;
    }
    this.sending.set(true);
    this.sendResult.set(null);
    this.friendships.send(this.friendEmail.value).subscribe({
      next: (request) => {
        console.debug('[ProfilePage] Demande d’amitié envoyée', request.id);
        this.sending.set(false);
        this.sendResult.set({ ok: true, message: `Demande envoyée à ${request.user.name}.` });
        this.friendForm.reset();
      },
      error: (error: Error) => {
        console.error('[ProfilePage] Demande d’amitié refusée', error);
        this.sending.set(false);
        this.sendResult.set({ ok: false, message: error.message });
      },
    });
  }
}
