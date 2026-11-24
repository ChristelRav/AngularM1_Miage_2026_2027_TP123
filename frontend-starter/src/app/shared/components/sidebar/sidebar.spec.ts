import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { describe, beforeEach, expect, it } from 'vitest';
import { SidebarComponent } from './sidebar';

@Component({ template: '' })
class EmptyPageComponent {}

const PATHS = ['discover', 'dashboard', 'tracks', 'playlists', 'albums', 'visualizer', 'music-lab'];

describe('SidebarComponent', () => {
  let fixture: ComponentFixture<SidebarComponent>;
  let element: HTMLElement;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [SidebarComponent],
      providers: [provideRouter(PATHS.map((path) => ({ path, component: EmptyPageComponent })))],
    });
    fixture = TestBed.createComponent(SidebarComponent);
    element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  });

  const activeLinks = () => [...element.querySelectorAll<HTMLAnchorElement>('a.active')];

  it('groups the pages in the three sections', () => {
    const sections = [...element.querySelectorAll('.section')].map((section) => ({
      title: section.querySelector('.section-title')?.textContent?.trim(),
      links: [...section.querySelectorAll('.link-label')].map((label) => label.textContent?.trim()),
    }));
    expect(sections).toEqual([
      { title: 'Accueil', links: ['Découvrir', 'Dashboard'] },
      { title: 'Bibliothèque', links: ['Backing Tracks', 'Playlists', 'Albums'] },
      { title: 'Outils', links: ['Visualiseur audio', 'Music Lab'] },
    ]);
    // Profile, theme and logout stay in the top bar only.
    expect(element.textContent).not.toMatch(/Profil|Déconnexion|sombre/);
  });

  it('navigates on click and marks only the current page as active', async () => {
    const router = TestBed.inject(Router);
    for (const path of PATHS) {
      element.querySelector<HTMLAnchorElement>(`a[href="/${path}"]`)?.click();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(router.url).toBe(`/${path}`);
      expect(activeLinks().map((link) => link.getAttribute('href'))).toEqual([`/${path}`]);
      expect(activeLinks()[0].getAttribute('aria-current')).toBe('page');
    }
  });

  it('marks the pages without backend as "Bientôt"', () => {
    const soon = [...element.querySelectorAll('a')]
      .filter((link) => link.querySelector('.soon'))
      .map((link) => link.getAttribute('href'));
    expect(soon).toEqual(['/discover', '/playlists', '/albums']);
  });
});
