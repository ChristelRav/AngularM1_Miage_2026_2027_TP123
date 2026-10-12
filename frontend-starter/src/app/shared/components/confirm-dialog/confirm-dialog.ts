import { Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';

export interface ConfirmDialogData {
  title: string;
  message: string;
  confirmLabel: string;
}

/** Generic confirmation dialog: closes with `true` when confirmed, `false` or undefined otherwise. */
@Component({
  selector: 'app-confirm-dialog',
  imports: [MatDialogModule],
  template: `
    <h2 mat-dialog-title>{{ data.title }}</h2>
    <mat-dialog-content>
      <p>{{ data.message }}</p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <!-- Focus starts on "Annuler" so that pressing Enter never deletes by accident. -->
      <button type="button" class="btn-ghost" [mat-dialog-close]="false" cdkFocusInitial>Annuler</button>
      <button type="button" class="btn-danger" [mat-dialog-close]="true">{{ data.confirmLabel }}</button>
    </mat-dialog-actions>
  `,
  styles: `
    mat-dialog-actions { gap: 0.5rem; }
  `,
})
export class ConfirmDialogComponent {
  readonly data = inject<ConfirmDialogData>(MAT_DIALOG_DATA);
}
