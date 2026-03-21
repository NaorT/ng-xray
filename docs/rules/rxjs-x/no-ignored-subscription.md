# Ignored Subscription

| Property | Value |
|----------|-------|
| Rule | `rxjs-x/no-ignored-subscription` |
| Category | best-practices |
| Effort | quick-fix |
| Estimated fix time | ~3 min |

## Why it matters

Calling .subscribe() without storing or managing the returned Subscription means you have no way to unsubscribe, leading to memory leaks and stale callbacks.

## Before

```typescript
this.data$.subscribe(d => this.data = d);
```

## After

```typescript
this.data$.pipe(
  takeUntilDestroyed()
).subscribe(d => this.data = d);
```

## Tags

`best-practices`, `rxjs`, `memory-leak`
