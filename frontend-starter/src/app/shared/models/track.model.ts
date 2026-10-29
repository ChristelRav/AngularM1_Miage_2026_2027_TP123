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
}
