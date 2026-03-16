import { Component, ChangeDetectionStrategy } from '@angular/core';

class MyService {}

@Component({
  selector: 'app-old-style',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<p>Old</p>',
})
export class OldStyleComponent {
  constructor(private myService: MyService) {}
}
