import { HttpErrorResponse } from '@angular/common/http';

/** Turns an API error into a message the user can understand. */
export function httpErrorMessage(error: unknown, messages: Partial<Record<number, string>> = {}): string {
  if (!(error instanceof HttpErrorResponse)) {
    return 'Une erreur inattendue est survenue.';
  }
  if (error.status === 0) {
    return 'Serveur injoignable. Vérifiez que le backend est démarré.';
  }

  const serverMessage =
    typeof error.error === 'object' && error.error !== null && 'message' in error.error
      ? String(error.error.message)
      : null;

  return messages[error.status] ?? serverMessage ?? `Erreur ${error.status}. Réessayez plus tard.`;
}
