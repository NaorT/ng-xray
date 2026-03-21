# Eagerly Loaded Route Component

| Property | Value |
|----------|-------|
| Rule | `eager-route-component` |
| Category | performance |
| Effort | moderate |
| Estimated fix time | ~10 min |

## Why it matters

Eagerly loaded route components increase the initial bundle size. Lazy loading defers the load until the user navigates to that route.

## Before

```typescript
{ path: 'feature', component: FeatureComponent }
```

## After

```typescript
{ path: 'feature', loadComponent: () => import('./feature.component').then(m => m.FeatureComponent) }
```

## Tags

`performance`, `lazy-loading`
