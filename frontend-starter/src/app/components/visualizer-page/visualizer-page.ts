import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IconComponent } from '../../shared/components/icon/icon';
import { AudioContextService } from '../../shared/services/audio-context.service';
import { VisualizerService } from '../../shared/services/visualizer.service';

/**
 * Settings page of the existing MilkDrop background (butterchurn). It uses the same switch as the
 * navbar button (VisualizerService): the visualizer itself is unchanged and still runs behind
 * the whole app while a track plays.
 */
@Component({
  imports: [RouterLink, IconComponent],
  templateUrl: './visualizer-page.html',
  styleUrl: './visualizer-page.css',
})
export class VisualizerPageComponent {
  readonly visualizer = inject(VisualizerService);
  private readonly audio = inject(AudioContextService);

  readonly playing = computed(() => this.audio.playingSource() !== null);
  readonly status = computed(() => {
    if (!this.visualizer.enabled()) return 'Désactivé';
    return this.playing() ? 'Actif : le fond suit la musique' : 'Activé : en attente d’une lecture';
  });
}
