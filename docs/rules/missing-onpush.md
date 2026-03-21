# Missing OnPush Change Detection

| Property | Value |
|----------|-------|
| Rule | `missing-onpush` |
| Category | performance |
| Effort | quick-fix |
| Estimated fix time | ~2 min |

## Why it matters

Without OnPush, Angular runs change detection on every browser event for this component. This can cause hundreds of unnecessary re-checks per second in large applications.

## Before

```typescript
@Component({ selector: 'app-foo' })
export class FooComponent {}
```

## After

```typescript
@Component({
  selector: 'app-foo',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FooComponent {}
```

## Tags

`performance`, `change-detection`
