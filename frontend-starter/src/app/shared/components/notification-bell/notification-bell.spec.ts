import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Friendship } from '../../models/friendship.model';
import { NotificationBellComponent } from './notification-bell';

describe('NotificationBellComponent', () => {
  let fixture: ComponentFixture<NotificationBellComponent>;
  let httpTesting: HttpTestingController;
  let element: HTMLElement;

  const request = (id: string, name: string): Friendship => ({
    id,
    status: 'PENDING',
    direction: 'RECEIVED',
    user: { id: `user-${id}`, name },
    createdAt: '2026-11-25T08:00:00.000Z',
    updatedAt: '2026-11-25T08:00:00.000Z',
  });
  const badge = () => element.querySelector('.badge')?.textContent?.trim() ?? null;
  const button = (label: string) =>
    [...element.querySelectorAll<HTMLButtonElement>('.request button')].find((b) => b.textContent?.includes(label));

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [NotificationBellComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    fixture = TestBed.createComponent(NotificationBellComponent);
    httpTesting = TestBed.inject(HttpTestingController);
    element = fixture.nativeElement as HTMLElement;
  });

  afterEach(() => {
    fixture.destroy();
    httpTesting.verify();
  });

  it('shows the number of pending requests received from the API', () => {
    httpTesting.expectOne('/api/friendships/received').flush([request('1', 'Alice Martin'), request('2', 'Bruno')]);
    fixture.detectChanges();
    expect(badge()).toBe('2');
    expect(element.querySelector('.bell')?.getAttribute('aria-label')).toContain('2 demande(s)');
  });

  it('opens the dropdown, accepts and rejects requests, and reloads the counter after each action', () => {
    httpTesting.expectOne('/api/friendships/received').flush([request('1', 'Alice Martin'), request('2', 'Bruno')]);
    fixture.detectChanges();

    element.querySelector<HTMLButtonElement>('.bell')?.click();
    httpTesting.expectOne('/api/friendships/received').flush([request('1', 'Alice Martin'), request('2', 'Bruno')]);
    fixture.detectChanges();
    const items = [...element.querySelectorAll('.request')];
    expect(items.map((item) => item.querySelector('b')?.textContent)).toEqual(['Alice Martin', 'Bruno']);
    expect(items[0].querySelector('.avatar')?.textContent).toBe('AM');

    // Accept Alice: PATCH, then the list and the badge are reloaded from the API.
    button('Accepter')?.click();
    const accept = httpTesting.expectOne('/api/friendships/1/accept');
    expect(accept.request.method).toBe('PATCH');
    accept.flush({ ...request('1', 'Alice Martin'), status: 'ACCEPTED' });
    httpTesting.expectOne('/api/friendships/received').flush([request('2', 'Bruno')]);
    fixture.detectChanges();
    expect(badge()).toBe('1');

    // Reject Bruno: no request left, the empty message is shown and the badge disappears.
    button('Refuser')?.click();
    httpTesting.expectOne('/api/friendships/2/reject').flush({ ...request('2', 'Bruno'), status: 'REJECTED' });
    httpTesting.expectOne('/api/friendships/received').flush([]);
    fixture.detectChanges();
    expect(badge()).toBeNull();
    expect(element.querySelector('.empty')?.textContent).toContain('Aucune nouvelle demande');
  });

  it('shows the server message when a request was already handled', () => {
    httpTesting.expectOne('/api/friendships/received').flush([request('1', 'Alice')]);
    fixture.detectChanges();
    element.querySelector<HTMLButtonElement>('.bell')?.click();
    httpTesting.expectOne('/api/friendships/received').flush([request('1', 'Alice')]);
    fixture.detectChanges();

    button('Accepter')?.click();
    httpTesting
      .expectOne('/api/friendships/1/accept')
      .flush({ message: 'Cette demande a déjà été traitée' }, { status: 409, statusText: 'Conflict' });
    httpTesting.expectOne('/api/friendships/received').flush([]);
    fixture.detectChanges();
    expect(element.querySelector('[role="alert"]')?.textContent).toContain('déjà été traitée');
    expect(badge()).toBeNull();
  });
});
