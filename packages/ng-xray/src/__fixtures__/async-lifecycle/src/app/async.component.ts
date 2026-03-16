import { Component, ChangeDetectionStrategy } from '@angular/core';

@Component({
  selector: 'app-async',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<p>Async</p>',
})
export class AsyncComponent {
  data = '';

  async ngOnInit() {
    this.data = await Promise.resolve('loaded');
  }
}
