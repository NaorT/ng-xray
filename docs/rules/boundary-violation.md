# Architecture Boundary Violation

| Property | Value |
|----------|-------|
| Rule | `boundary-violation` |
| Category | architecture |
| Effort | moderate |
| Estimated fix time | ~20 min |

## Why it matters

Crossing module boundaries creates tight coupling. Features that import from other features or layers break isolation and make independent deployment and testing impossible.

## Before

```typescript
// In features/auth/login.component.ts
import { CartService } from '../cart/cart.service';
```

## After

```typescript
// Move shared logic to shared/ or core/
import { CartService } from '@shared/cart/cart.service';
```

## Tags

`architecture`, `boundaries`, `coupling`
