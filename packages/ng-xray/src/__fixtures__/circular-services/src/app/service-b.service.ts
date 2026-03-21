import { Injectable, inject } from '@angular/core';
import { ServiceA } from './service-a.service';

@Injectable({ providedIn: 'root' })
export class ServiceB {
  private a = inject(ServiceA);

  getDataB(): string {
    return this.a.getDataA();
  }
}
