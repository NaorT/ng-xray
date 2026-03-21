# DomSanitizer Bypass

| Property | Value |
|----------|-------|
| Rule | `bypass-security-trust` |
| Category | security |
| Effort | moderate |
| Estimated fix time | ~15 min |

## Why it matters

Calling bypassSecurityTrust* disables Angular's built-in XSS protection for that value. If the input is ever user-controlled, it opens the door to cross-site scripting attacks.

## Before

```typescript
this.sanitizer.bypassSecurityTrustHtml(userInput)
```

## After

```typescript
// Use DomSanitizer.sanitize() or restructure to avoid raw HTML
```

## Tags

`security`, `xss`, `sanitization`
