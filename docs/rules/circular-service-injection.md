# Circular Service Injection

| Property | Value |
|----------|-------|
| Rule | `circular-service-injection` |
| Category | architecture |
| Effort | refactor |
| Estimated fix time | ~45 min |

## Why it matters

Circular injection causes runtime errors or requires forwardRef hacks. It indicates tangled business logic that should be restructured.

## Before

```typescript
// AuthService injects UserService, UserService injects AuthService
```

## After

```typescript
// Extract shared logic into a new SharedAuthService that both services depend on.
```

## Tags

`architecture`, `dependency-injection`
