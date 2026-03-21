import { Component, ChangeDetectionStrategy } from '@angular/core';

@Component({
  selector: 'app-root',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<h1>{{ title }}</h1>',
})
export class AppComponent {
  title = 'clean';
}
