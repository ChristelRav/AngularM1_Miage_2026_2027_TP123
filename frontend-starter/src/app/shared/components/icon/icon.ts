import { Component, input } from '@angular/core';

export type IconName =
  | 'guitar'
  | 'music'
  | 'user'
  | 'login'
  | 'logout'
  | 'user-plus'
  | 'upload'
  | 'refresh'
  | 'play'
  | 'chevron-left'
  | 'chevron-right'
  | 'save'
  | 'alert';

/** Inline stroke icon that inherits the surrounding text color and size. */
@Component({
  selector: 'app-icon',
  host: { 'aria-hidden': 'true' },
  styles: `
    :host { display: inline-flex; flex-shrink: 0; }
    svg { width: 1.15em; height: 1.15em; }
  `,
  template: `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      @switch (name()) {
        @case ('guitar') {
          <path d="m20 7 1.7-1.7a1 1 0 0 0 0-1.4l-1.6-1.6a1 1 0 0 0-1.4 0L17 4v3Z" />
          <path d="m17 7-5.1 5.1" />
          <circle cx="11.5" cy="12.5" r=".5" fill="currentColor" />
          <path d="M6 12a2 2 0 0 0 1.8-1.2l.4-.9C8.7 8.8 9.8 8 11 8c2.8 0 5 2.2 5 5 0 1.2-.8 2.3-1.9 2.8l-.9.4A2 2 0 0 0 12 18a4 4 0 0 1-4 4c-3.3 0-6-2.7-6-6a4 4 0 0 1 4-4" />
          <path d="m6 16 2 2" />
        }
        @case ('music') {
          <path d="M9 18V5l12-2v13" />
          <circle cx="6" cy="18" r="3" />
          <circle cx="18" cy="16" r="3" />
        }
        @case ('user') {
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21a8 8 0 0 1 16 0" />
        }
        @case ('login') {
          <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
          <path d="m10 17 5-5-5-5" />
          <path d="M15 12H3" />
        }
        @case ('logout') {
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <path d="m16 17 5-5-5-5" />
          <path d="M21 12H9" />
        }
        @case ('user-plus') {
          <circle cx="9" cy="8" r="4" />
          <path d="M2 21a7 7 0 0 1 14 0" />
          <path d="M19 8v6M16 11h6" />
        }
        @case ('upload') {
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <path d="m17 8-5-5-5 5" />
          <path d="M12 3v12" />
        }
        @case ('refresh') {
          <path d="M21 12a9 9 0 0 1-15.5 6.2L3 16" />
          <path d="M3 12A9 9 0 0 1 18.5 5.8L21 8" />
          <path d="M21 3v5h-5M3 21v-5h5" />
        }
        @case ('play') {
          <path d="M7 4v16l13-8Z" fill="currentColor" />
        }
        @case ('chevron-left') {
          <path d="m15 18-6-6 6-6" />
        }
        @case ('chevron-right') {
          <path d="m9 18 6-6-6-6" />
        }
        @case ('save') {
          <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z" />
          <path d="M17 21v-8H7v8M7 3v5h8" />
        }
        @case ('alert') {
          <circle cx="12" cy="12" r="10" />
          <path d="M12 8v4M12 16h.01" />
        }
      }
    </svg>
  `,
})
export class IconComponent {
  readonly name = input.required<IconName>();
}
