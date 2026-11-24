import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ComingSoonComponent } from '../../shared/components/coming-soon/coming-soon';
import { IconComponent } from '../../shared/components/icon/icon';

/** Prepared page: playlists need a backend collection and routes that do not exist yet. */
@Component({
  imports: [RouterLink, ComingSoonComponent, IconComponent],
  templateUrl: './playlists-page.html',
  styleUrl: './playlists-page.css',
})
export class PlaylistsPageComponent {}
