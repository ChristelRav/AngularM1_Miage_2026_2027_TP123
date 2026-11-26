import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ProfilePageComponent } from './profile-page';

describe('ProfilePageComponent friends', () => {
  let fixture: ComponentFixture<ProfilePageComponent>;
  let httpTesting: HttpTestingController;
  let element: HTMLElement;

  const flushFriends = (friends: unknown[] = [], sent: unknown[] = []) => {
    httpTesting.expectOne('/api/friends').flush(friends);
    httpTesting.expectOne('/api/friendships/sent').flush(sent);
  };
  const submit = (email: string) => {
    const input = element.querySelector<HTMLInputElement>('.send-form input')!;
    input.value = email;
    input.dispatchEvent(new Event('input'));
    element.querySelector<HTMLButtonElement>('.send-form button')!.click();
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ProfilePageComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    fixture = TestBed.createComponent(ProfilePageComponent);
    httpTesting = TestBed.inject(HttpTestingController);
    element = fixture.nativeElement as HTMLElement;
    httpTesting.expectOne('/api/users/me').flush({ id: 'me', name: 'Demo', email: 'demo@example.com', createdAt: '2026-11-01' });
    fixture.detectChanges();
    flushFriends([{ id: 'u1', name: 'Lucas Bernard', friendshipId: 'f1', since: '2026-11-25T08:00:00.000Z' }]);
    fixture.detectChanges();
  });

  afterEach(() => httpTesting.verify());

  it('lists the friends from the API', () => {
    expect([...element.querySelectorAll('.people b')].map((b) => b.textContent)).toEqual(['Lucas Bernard']);
  });

  it('sends a friend request by email from the form, then reloads the lists', () => {
    submit('Emma@Example.com');
    const request = httpTesting.expectOne('/api/friendships');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ email: 'emma@example.com' });
    request.flush({ id: 'f2', status: 'PENDING', direction: 'SENT', user: { id: 'u2', name: 'Emma' }, createdAt: '', updatedAt: '' });
    fixture.detectChanges();
    expect(element.querySelector('.send-ok')?.textContent).toContain('Demande envoyée à Emma');
    // The service version changed: friends and sent requests are reloaded.
    flushFriends([], [{ id: 'f2', status: 'PENDING', direction: 'SENT', user: { id: 'u2', name: 'Emma' }, createdAt: '2026-11-25T08:00:00.000Z', updatedAt: '' }]);
    fixture.detectChanges();
    expect(element.textContent).toContain('En attente');
  });

  it('shows the server message when the request is refused', () => {
    submit('lucas@example.com');
    httpTesting.expectOne('/api/friendships').flush({ message: 'Vous êtes déjà amis' }, { status: 409, statusText: 'Conflict' });
    fixture.detectChanges();
    expect(element.querySelector('.friends p.error')?.textContent).toContain('Vous êtes déjà amis');
  });

  it('does not call the API with an invalid email', () => {
    submit('pas-un-email');
    fixture.detectChanges();
    expect(element.querySelector('.field-error')?.textContent).toContain('adresse email valide');
  });
});
