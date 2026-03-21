# Low Signal Adoption

| Property | Value |
|----------|-------|
| Rule | `low-signal-readiness` |
| Category | best-practices |
| Effort | moderate |
| Estimated fix time | ~10 min |

## Why it matters

Angular Signals provide fine-grained reactivity and eliminate the need for manual subscription management. Adopting signals improves performance and reduces boilerplate.

## Before

```typescript
@Input() name: string;
this.data$.subscribe(d => this.data = d);
```

## After

```typescript
name = input<string>();
data = toSignal(this.data$);
```

## Tags

`best-practices`, `signals`
