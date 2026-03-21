# Eagerly Loaded Route Children

| Property | Value |
|----------|-------|
| Rule | `eager-route-children` |
| Category | performance |
| Effort | moderate |
| Estimated fix time | ~15 min |

## Why it matters

Inlined children arrays prevent code splitting. Using loadChildren keeps sub-routes in a separate chunk.

## Before

```typescript
{ path: 'admin', children: [{ path: 'users', component: UsersComponent }] }
```

## After

```typescript
{ path: 'admin', loadChildren: () => import('./admin/admin.routes').then(m => m.routes) }
```

## Tags

`performance`, `lazy-loading`
