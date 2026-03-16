import { Component, ChangeDetectionStrategy } from '@angular/core';

@Component({
  selector: 'app-heavy',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<p>Heavy</p>',
})
export class HeavyComponent {
  a = '';
  b = '';
  c = '';
  d = '';
  e = '';
  f = '';

  constructor() {
    this.a = 'one';
    this.b = 'two';
    this.c = 'three';
    this.d = 'four';
    this.e = 'five';
    this.f = 'six';
  }
}
