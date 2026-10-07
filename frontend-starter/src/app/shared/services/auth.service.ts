import { computed, inject, Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError, tap, throwError } from 'rxjs';
import { AuthResponse } from '../models/auth-response.model';
import { User } from '../models/user.model';
import { httpErrorMessage } from '../utils/http-error';

const TOKEN_KEY = 'gpc_token';

/** Handles authentication and the current user's profile. */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);

  readonly currentUser = signal<User | null>(null);
  readonly token = signal<string | null>(readToken());
  readonly isAuthenticated = computed(() => this.token() !== null);

  /** Errors are emitted as `Error` objects whose message can be shown as is. */
  login(email: string, password: string) {
    return this.http
      .post<AuthResponse>('/api/auth/login', { email: email.trim().toLowerCase(), password })
      .pipe(
        tap((response) => this.storeAuthentication(response)),
        catchError((error: unknown) =>
          throwError(() => new Error(httpErrorMessage(error, { 401: 'Email ou mot de passe incorrect.' }))),
        ),
      );
  }

  /** Errors are emitted as `Error` objects whose message can be shown as is. */
  register(name: string, email: string, password: string) {
    return this.http
      .post<AuthResponse>('/api/auth/register', {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password,
      })
      .pipe(
        tap((response) => this.storeAuthentication(response)),
        catchError((error: unknown) =>
          throwError(
            () =>
              new Error(
                httpErrorMessage(error, {
                  409: 'Cet email est déjà utilisé. Connectez-vous ou choisissez un autre email.',
                }),
              ),
          ),
        ),
      );
  }

  profile() {
    return this.http
      .get<User>('/api/users/me')
      .pipe(tap((user) => this.currentUser.set(user)));
  }

  update(name: string) {
    return this.http
      .put<User>('/api/users/me', { name })
      .pipe(tap((user) => this.currentUser.set(user)));
  }

  logout(): void {
    writeToken(null);
    this.token.set(null);
    this.currentUser.set(null);
  }

  /** Persists the JWT (never logged) and publishes the user through the Signal. */
  private storeAuthentication(response: AuthResponse): void {
    writeToken(response.token);
    this.token.set(response.token);
    this.currentUser.set(response.user);
  }
}

/** localStorage may be unavailable (private mode, blocked storage): fail silently. */
function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function writeToken(token: string | null): void {
  try {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
  } catch {
    // The session still works in memory through the token Signal.
  }
}
