import { Component, computed, input, model, signal } from '@angular/core';
import { Category, CATEGORY_GROUPS, CategoryType } from '../../models/category.model';

/**
 * Multi-selection of categories shown as image tiles, in three tabs
 * (genres, moods, themes). Selection is optional; `selectedIds` is two-way bound.
 */
@Component({
  selector: 'app-category-picker',
  templateUrl: './category-picker.html',
  styleUrl: './category-picker.css',
})
export class CategoryPickerComponent {
  /** Categories loaded from the API by the parent. */
  readonly categories = input.required<Category[]>();
  readonly selectedIds = model<string[]>([]);
  readonly disabled = input(false);

  readonly groups = CATEGORY_GROUPS;
  readonly activeType = signal<CategoryType>('GENRE');
  /** Slugs whose image failed to load: a placeholder tile is shown instead. */
  readonly brokenImages = signal<ReadonlySet<string>>(new Set());

  private readonly selectedSet = computed(() => new Set(this.selectedIds()));

  readonly visibleCategories = computed(() =>
    this.categories().filter((category) => category.type === this.activeType()),
  );

  /** Selected categories, in group order then name order, for the summary. */
  readonly selectedCategories = computed(() => {
    const selected = this.selectedSet();
    const order = this.groups.map((group) => group.type);
    return this.categories()
      .filter((category) => selected.has(category._id))
      .sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type) || a.name.localeCompare(b.name));
  });

  readonly countByType = computed(() => {
    const counts: Record<CategoryType, number> = { GENRE: 0, MOOD: 0, THEME: 0 };
    for (const category of this.selectedCategories()) counts[category.type]++;
    return counts;
  });

  isSelected(category: Category): boolean {
    return this.selectedSet().has(category._id);
  }

  toggle(category: Category): void {
    if (this.disabled()) return;
    this.selectedIds.update((ids) =>
      ids.includes(category._id) ? ids.filter((id) => id !== category._id) : [...ids, category._id],
    );
  }

  clear(): void {
    if (!this.disabled()) this.selectedIds.set([]);
  }

  imageFailed(category: Category): void {
    this.brokenImages.update((slugs) => new Set(slugs).add(category.slug));
  }

  hasImage(category: Category): boolean {
    return !!category.image.url && !this.brokenImages().has(category.slug);
  }

  /** Two letters shown on the placeholder tile, e.g. "R&B" -> "RB", "Hip-Hop" -> "HH". */
  initials(category: Category): string {
    const words = category.name.split(/[\s\-&]+/).filter(Boolean);
    const letters = words.length > 1 ? words[0][0] + words[1][0] : category.name.slice(0, 2);
    return letters.toUpperCase();
  }
}
