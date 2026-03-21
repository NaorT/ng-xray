# innerHTML Binding in Template

| Property | Value |
|----------|-------|
| Rule | `innerhtml-binding` |
| Category | security |
| Effort | quick-fix |
| Estimated fix time | ~5 min |

## Why it matters

Binding to [innerHTML] can render unsanitized HTML. While Angular sanitizes by default, dynamic HTML from user input or APIs can still introduce XSS risks.

## Before

```typescript
<div [innerHTML]="userContent"></div>
```

## After

```typescript
<!-- Use text interpolation or sanitize explicitly -->
<div>{{ userContent }}</div>
```

## Tags

`security`, `xss`, `template`
