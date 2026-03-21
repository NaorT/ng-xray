# Missing trackBy in *ngFor

| Property | Value |
|----------|-------|
| Rule | `missing-trackby` |
| Category | performance |
| Effort | quick-fix |
| Estimated fix time | ~3 min |

## Why it matters

Without trackBy, Angular destroys and recreates DOM elements on every change. With large lists this causes jank and memory thrashing.

## Before

```typescript
<div *ngFor="let item of items">{{ item.name }}</div>
```

## After

```typescript
<div *ngFor="let item of items; trackBy: trackById">{{ item.name }}</div>
```

## Tags

`performance`, `dom`
