import { Component, input } from '@angular/core';
import { IconComponent, IconName } from '../icon/icon';

/**
 * Panel for a page whose backend does not exist yet: says what the page will do, without showing
 * any data. Extra content (links, list of planned features) can be projected inside.
 */
@Component({
  selector: 'app-coming-soon',
  imports: [IconComponent],
  templateUrl: './coming-soon.html',
  styleUrl: './coming-soon.css',
})
export class ComingSoonComponent {
  readonly icon = input.required<IconName>();
  readonly heading = input.required<string>();
  readonly message = input.required<string>();
}
