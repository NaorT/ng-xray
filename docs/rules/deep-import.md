# Deep Import Into Package Internals

| Property | Value |
|----------|-------|
| Rule | `deep-import` |
| Category | architecture |
| Effort | moderate |
| Estimated fix time | ~10 min |

## Why it matters

Importing from internal paths of a package bypasses its public API and couples your code to implementation details that may change without notice.

## Before

```typescript
import { internalHelper } from '@angular/core/src/util';
```

## After

```typescript
import { publicHelper } from '@angular/core';
```

## Tags

`architecture`, `coupling`, `public-api`
