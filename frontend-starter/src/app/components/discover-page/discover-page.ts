import { Component, computed, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ComingSoonComponent } from '../../shared/components/coming-soon/coming-soon';
import { IconComponent, IconName } from '../../shared/components/icon/icon';

type DiscoverSource = 'public' | 'friends';

interface DiscoverTab {
  source: DiscoverSource;
  label: string;
  icon: IconName;
  heading: string;
  message: string;
}

/**
 * Prepared page. The API only lists the tracks of the signed-in user (`GET /api/tracks` filters on
 * the owner): discovering other users' tracks needs new backend routes. Friendships exist (Friendship
 * model, managed from the profile page), but there is no route yet for the tracks of one's friends.
 * Until then the page shows no data, only what each tab will contain.
 */
@Component({
  imports: [RouterLink, ComingSoonComponent, IconComponent],
  templateUrl: './discover-page.html',
  styleUrl: './discover-page.css',
})
export class DiscoverPageComponent {
  readonly tabs: readonly DiscoverTab[] = [
    {
      source: 'public',
      label: 'Musiques publiques',
      icon: 'globe',
      heading: 'Les musiques publiques de la communauté',
      message:
        'Vous retrouverez ici les backing tracks que les autres utilisateurs ont rendues publiques (accès « public »). Les musiques privées ne seront jamais affichées.',
    },
    {
      source: 'friends',
      label: 'Musiques de mes amis',
      icon: 'users',
      heading: 'Les musiques partagées par vos amis',
      message:
        'Vous retrouverez ici les backing tracks que vos amis partagent avec leurs amis (accès « friendly »), en plus de leurs musiques publiques. Vous pouvez déjà ajouter des amis depuis votre profil ; l’affichage de leurs musiques reste à développer.',
    },
  ];
  readonly source = signal<DiscoverSource>('public');

  readonly activeTab = computed(() => this.tabs.find((tab) => tab.source === this.source()) ?? this.tabs[0]);
}
