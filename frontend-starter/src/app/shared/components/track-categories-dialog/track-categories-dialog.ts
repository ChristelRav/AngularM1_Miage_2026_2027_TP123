import { Component, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { Category } from '../../models/category.model';
import { Track } from '../../models/track.model';
import { CategoryService } from '../../services/category.service';
import { httpErrorMessage } from '../../utils/http-error';
import { CategoryPickerComponent } from '../category-picker/category-picker';

export interface TrackCategoriesDialogData {
  track: Track;
  categories: Category[];
}

/** Edits the categories of a track; closes with the saved categories, or undefined if cancelled. */
@Component({
  selector: 'app-track-categories-dialog',
  imports: [MatDialogModule, CategoryPickerComponent],
  templateUrl: './track-categories-dialog.html',
  styleUrl: './track-categories-dialog.css',
})
export class TrackCategoriesDialogComponent {
  readonly data = inject<TrackCategoriesDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<TrackCategoriesDialogComponent, Category[]>);
  private readonly service = inject(CategoryService);

  readonly selectedIds = signal((this.data.track.categories ?? []).map((category) => category._id));
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  save(): void {
    if (this.saving()) return;
    this.saving.set(true);
    this.error.set(null);
    this.service.updateForTrack(this.data.track.id, this.selectedIds()).subscribe({
      next: (categories) => {
        console.debug('[TrackCategoriesDialog] Catégories enregistrées', categories.length);
        this.dialogRef.close(categories);
      },
      error: (error) => {
        console.error('[TrackCategoriesDialog] Enregistrement impossible', error);
        this.saving.set(false);
        this.error.set(httpErrorMessage(error));
      },
    });
  }
}
