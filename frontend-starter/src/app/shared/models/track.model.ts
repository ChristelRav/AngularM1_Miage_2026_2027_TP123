import { Category } from './category.model';

/** Audio track metadata returned by the API. */
export interface Acces {
  _id: string;
  accesName: string;
}

export interface Track {
  id: string;
  title: string;
  originalName: string;
  mimeType: string;
  size: number;
  createdAt: string;
  coverUrl?: string | null;
  accesId?: Acces | null;
  /** Ids stored in the track document (`tracks.categoryIds`); empty for tracks without categories. */
  categoryIds?: string[];
  /** The same categories with their details (name, type, image), sent by the API for display. */
  categories?: Category[];
}
