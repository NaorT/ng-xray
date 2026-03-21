# Public API Bypass

| Property | Value |
|----------|-------|
| Rule | `public-api-violation` |
| Category | architecture |
| Effort | quick-fix |
| Estimated fix time | ~5 min |

## Why it matters

Importing internal files of a module instead of its barrel file (index.ts) couples consumers to implementation details. When the module refactors internals, all consumers break.

## Before

```typescript
import { AuthGuard } from '../auth/guards/auth.guard';
```

## After

```typescript
import { AuthGuard } from '../auth'; // via index.ts barrel
```

## Tags

`architecture`, `public-api`, `barrel`
