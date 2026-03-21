# Unsafe takeUntil Placement

| Property | Value |
|----------|-------|
| Rule | `rxjs-x/no-unsafe-takeuntil` |
| Category | best-practices |
| Effort | quick-fix |
| Estimated fix time | ~2 min |

## Why it matters

Placing takeUntil before operators like switchMap or mergeMap creates inner subscriptions that are not cleaned up when the notifier fires, causing memory leaks.

## Before

```typescript
.pipe(
  takeUntilDestroyed(),
  switchMap(val => this.http.get(url))
).subscribe();
```

## After

```typescript
.pipe(
  switchMap(val => this.http.get(url)),
  takeUntilDestroyed()
).subscribe();
```

## Tags

`best-practices`, `rxjs`, `memory-leak`
