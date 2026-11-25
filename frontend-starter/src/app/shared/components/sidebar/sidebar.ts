import { afterNextRender, Component, DestroyRef, ElementRef, inject, Injector } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { filter } from 'rxjs';
import { IconComponent, IconName } from '../icon/icon';

interface SidebarLink {
  path: string;
  label: string;
  icon: IconName;
  /** Prepared page without backend yet: shows a small "Bientôt" marker. */
  soon?: boolean;
}

interface SidebarSection {
  id: string;
  title: string;
  links: readonly SidebarLink[];
}

/**
 * Main navigation of the signed-in user, in three sections. Profile, theme, visualizer switch and
 * logout stay in the top bar and are not repeated here.
 */
@Component({
  selector: 'app-sidebar',
  imports: [RouterLink, RouterLinkActive, IconComponent],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.css',
})
export class SidebarComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly injector = inject(Injector);

  constructor() {
    afterNextRender(() => this.revealActiveLink());
    const subscription = inject(Router)
      .events.pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe(() => afterNextRender(() => this.revealActiveLink(), { injector: this.injector }));
    inject(DestroyRef).onDestroy(() => subscription.unsubscribe());
  }

  /** On phones the menu is a horizontal bar: scroll it so the current page is visible and centered. */
  private revealActiveLink(): void {
    const link = this.host.querySelector<HTMLElement>('a.active');
    if (!link || this.host.scrollWidth <= this.host.clientWidth) return;
    this.host.scrollTo({ left: link.offsetLeft - (this.host.clientWidth - link.offsetWidth) / 2, behavior: 'smooth' });
  }

  readonly sections: readonly SidebarSection[] = [
    {
      id: 'home',
      title: 'Accueil',
      links: [
        { path: '/discover', label: 'Découvrir', icon: 'compass', soon: true },
        { path: '/dashboard', label: 'Dashboard', icon: 'layout-dashboard' },
      ],
    },
    {
      id: 'library',
      title: 'Bibliothèque',
      links: [
        { path: '/tracks', label: 'Backing Tracks', icon: 'music' },
        { path: '/playlists', label: 'Playlists', icon: 'list-music' },
        { path: '/albums', label: 'Albums', icon: 'disc', soon: true },
      ],
    },
    {
      id: 'tools',
      title: 'Outils',
      links: [
        { path: '/visualizer', label: 'Visualiseur audio', icon: 'audio-waveform' },
        { path: '/music-lab', label: 'Music Lab', icon: 'flask' },
      ],
    },
  ];
}
