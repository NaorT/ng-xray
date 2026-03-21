# Non-Standalone Component

| Property | Value |
|----------|-------|
| Rule | `non-standalone-component` |
| Category | best-practices |
| Effort | moderate |
| Estimated fix time | ~15 min |

## Why it matters

NgModules add indirection and increase bundle complexity. Standalone components are the recommended pattern since Angular 15+ and mandatory for best tree-shaking.

## Before

```typescript
@Component({ selector: 'app-foo' })
export class FooComponent {}  // + NgModule declaration
```

## After

```typescript
@Component({
  selector: 'app-foo',
  standalone: true,
  imports: [CommonModule]
})
export class FooComponent {}
```

## Tags

`standalone`, `angular-19`
