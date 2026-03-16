import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class UnusedService {
  getValue() {
    return 42;
  }
}
