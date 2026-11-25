/** Track as seen inside a playlist: its files are served by the playlist routes (works for invited friends). */
export interface PlaylistTrack {
  id: string;
  title: string;
  originalName: string;
  mimeType: string;
  size: number;
  createdAt: string;
  coverUrl: string | null;
  audioUrl: string;
}

export interface Playlist {
  id: string;
  name: string;
  owner: { id: string; name: string };
  /** True for the signed-in user's own playlists; false for playlists shared by a friend. */
  isOwner: boolean;
  trackIds: string[];
  trackCount: number;
  /** Up to 4 cover URLs for the mosaic. */
  covers: string[];
  /** Only sent to the owner. */
  sharedWithCount?: number;
  /** Only sent by the detail route (`GET /api/playlists/:id`), in the play order. */
  tracks?: PlaylistTrack[];
  createdAt: string;
  updatedAt: string;
}

/** Friend who can see a playlist. */
export interface PlaylistShare {
  id: string;
  name: string;
}

export const PLAYLIST_NAME_MAX = 80;
