import { Routes } from '@angular/router';
import { authGuard } from './shared/guards/auth.guard';
import { AlbumsPageComponent } from './components/albums-page/albums-page';
import { DashboardPageComponent } from './components/dashboard-page/dashboard-page';
import { DiscoverPageComponent } from './components/discover-page/discover-page';
import { LoginPageComponent } from './components/login-page/login-page';
import { MusicLabPageComponent } from './components/music-lab-page/music-lab-page';
import { PlaylistsPageComponent } from './components/playlists-page/playlists-page';
import { ProfilePageComponent } from './components/profile-page/profile-page';
import { RegisterPageComponent } from './components/register-page/register-page';
import { TracksPageComponent } from './components/tracks-page/tracks-page';
import { VisualizerPageComponent } from './components/visualizer-page/visualizer-page';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
  { path: 'login', component: LoginPageComponent },
  { path: 'register', component: RegisterPageComponent },
  { path: 'profile', component: ProfilePageComponent, canActivate: [authGuard] },
  // Accueil
  { path: 'discover', component: DiscoverPageComponent, canActivate: [authGuard] },
  { path: 'dashboard', component: DashboardPageComponent, canActivate: [authGuard] },
  // Bibliothèque
  { path: 'tracks', component: TracksPageComponent, canActivate: [authGuard] },
  { path: 'playlists', component: PlaylistsPageComponent, canActivate: [authGuard] },
  { path: 'albums', component: AlbumsPageComponent, canActivate: [authGuard] },
  // Outils
  { path: 'visualizer', component: VisualizerPageComponent, canActivate: [authGuard] },
  { path: 'music-lab', component: MusicLabPageComponent, canActivate: [authGuard] },
  { path: '**', redirectTo: 'dashboard' },
];
