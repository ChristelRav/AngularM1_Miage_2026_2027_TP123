import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Category, CategoryType } from '../models/category.model';

/** HTTP operations for music categories and their association with tracks. */
@Injectable({ providedIn: 'root' })
export class CategoryService {
  private readonly http = inject(HttpClient);

  /** Active categories, all of them or only one type. */
  list(type?: CategoryType) {
    return this.http.get<Category[]>('/api/categories', type ? { params: { type } } : {});
  }

  forTrack(trackId: string) {
    return this.http.get<Category[]>(`/api/tracks/${trackId}/categories`);
  }

  /** Replaces all the categories of a track; an empty list removes them. */
  updateForTrack(trackId: string, categoryIds: string[]) {
    return this.http.put<Category[]>(`/api/tracks/${trackId}/categories`, { categoryIds });
  }
}
