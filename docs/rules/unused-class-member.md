# Unused Class Member

| Property | Value |
|----------|-------|
| Rule | `unused-class-member` |
| Category | dead-code |
| Effort | quick-fix |
| Estimated fix time | ~2 min |

## Why it matters

Unused properties and methods add noise to classes and can mask the component's true interface. They are also potential maintenance hazards.

## Before

```typescript
class FooComponent {
  unusedField = 'hello'; // never accessed
}
```

## After

```typescript
class FooComponent {
  // Field removed
}
```

## Tags

`dead-code`, `class-hygiene`
