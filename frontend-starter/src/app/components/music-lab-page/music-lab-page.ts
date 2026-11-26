import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IconComponent, IconName } from '../../shared/components/icon/icon';

interface LabIdea {
  icon: IconName;
  name: string;
  description: string;
}

/**
 * Hub of the musical tools and experiments. Only the visualizer exists today; the other entries are
 * clearly marked as not available and do nothing.
 */
@Component({
  imports: [RouterLink, IconComponent],
  templateUrl: './music-lab-page.html',
  styleUrl: './music-lab-page.css',
})
export class MusicLabPageComponent {
  readonly ideas: readonly LabIdea[] = [
    { icon: 'timer', name: 'Métronome', description: 'Travailler en rythme, avec un tempo réglable.' },
    { icon: 'gauge', name: 'Accordeur', description: 'Accorder sa guitare avec le micro de l’appareil.' },
    { icon: 'repeat', name: 'Boucle A-B', description: 'Répéter un passage précis d’une backing track.' },
  ];
}
