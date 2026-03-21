# Missing trackBy in *ngFor / track in @for

| Property | Value |
|----------|-------|
| Rule | `@angular-eslint/template/use-track-by-function` |
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

`performance`, `dom`, `template`
