import { Component, inject } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { PLAYLIST_NAME_MAX } from '../../models/playlist.model';

export interface PlaylistNameDialogData {
  title: string;
  confirmLabel: string;
  name?: string;
}

/** Asks for a playlist name (creation or renaming). Closes with the trimmed name, or nothing when cancelled. */
@Component({
  selector: 'app-playlist-name-dialog',
  imports: [MatDialogModule, ReactiveFormsModule],
  templateUrl: './playlist-name-dialog.html',
  styleUrl: './playlist-name-dialog.css',
})
export class PlaylistNameDialogComponent {
  readonly data = inject<PlaylistNameDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<PlaylistNameDialogComponent, string>);
  readonly max = PLAYLIST_NAME_MAX;
  readonly name = new FormControl(this.data.name ?? '', {
    nonNullable: true,
    validators: [Validators.required, Validators.maxLength(PLAYLIST_NAME_MAX), Validators.pattern(/\S/)],
  });

  submit(): void {
    if (this.name.invalid) {
      this.name.markAsTouched();
      return;
    }
    this.dialogRef.close(this.name.value.trim());
  }
}
