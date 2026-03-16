import { Component } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';

@Component({
  selector: 'app-unsafe',
  standalone: true,
  template: '<div [innerHTML]="html"></div>',
})
export class UnsafeComponent {
  html = '';

  constructor(private sanitizer: DomSanitizer) {
    this.html = this.sanitizer.bypassSecurityTrustHtml('<b>bold</b>') as string;
  }
}
