import { Injectable, inject } from '@angular/core';
import { ServiceB } from './service-b.service';

@Injectable({ providedIn: 'root' })
export class ServiceA {
  private b = inject(ServiceB);

  getDataA(): string {
    return this.b.getDataB();
  }
}
