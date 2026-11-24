/** Music category returned by the API (genre, mood or theme). */
export type CategoryType = 'GENRE' | 'MOOD' | 'THEME';

export interface Category {
  _id: string;
  name: string;
  slug: string;
  type: CategoryType;
  parentId: string | null;
  description: string;
  /** Public path of the image (e.g. /uploads/categories/pop.jpg); the file may not exist yet. */
  image: { url: string; alt: string };
  isActive: boolean;
}

/** Display order and labels of the three category groups. */
export const CATEGORY_GROUPS: readonly { type: CategoryType; label: string }[] = [
  { type: 'GENRE', label: 'Genres musicaux' },
  { type: 'MOOD', label: 'Ambiances' },
  { type: 'THEME', label: 'Thèmes' },
];
