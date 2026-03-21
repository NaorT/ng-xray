# Banana-in-Box Syntax Error

| Property | Value |
|----------|-------|
| Rule | `@angular-eslint/template/banana-in-box` |
| Category | best-practices |
| Effort | quick-fix |
| Estimated fix time | ~1 min |

## Why it matters

Writing `([ngModel])` instead of `[(ngModel)]` silently creates a one-way binding instead of two-way, causing form values not to update.

## Before

```typescript
<input ([ngModel])="name">
```

## After

```typescript
<input [(ngModel)]="name">
```

## Tags

`best-practices`, `template`, `two-way-binding`
