import { Component, ChangeDetectionStrategy } from '@angular/core';

@Component({
  selector: 'app-bindings',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div [class.active]="isActive">
      <button (click)="handleClick()">Click</button>
      @if (showExtra) {
        <span>{{ extraLabel }}</span>
      }
    </div>
  `,
})
export class BindingsComponent {
  isActive = true;
  showExtra = false;
  extraLabel = 'extra';

  handleClick(): void {
    this.showExtra = !this.showExtra;
  }

  private neverUsedMethod(): string {
    return 'dead code';
  }
}
