# eval() or new Function() Usage

| Property | Value |
|----------|-------|
| Rule | `eval-usage` |
| Category | security |
| Effort | moderate |
| Estimated fix time | ~20 min |

## Why it matters

eval() and new Function() execute arbitrary strings as code, enabling code injection attacks. They also prevent JavaScript engine optimizations.

## Before

```typescript
const result = eval(userExpression);
```

## After

```typescript
// Use JSON.parse() for data, or a safe expression evaluator
```

## Tags

`security`, `code-injection`
