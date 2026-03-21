import { Component } from '@angular/core';
import { AuthService } from '../auth/auth.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  template: '<div>Dashboard</div>',
})
export class DashboardComponent {
  constructor(private auth: AuthService) {}
}
