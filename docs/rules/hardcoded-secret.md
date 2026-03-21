# Hardcoded Secret or API Key

| Property | Value |
|----------|-------|
| Rule | `hardcoded-secret` |
| Category | security |
| Effort | quick-fix |
| Estimated fix time | ~5 min |

## Why it matters

Hardcoded secrets in source code get committed to version control, appear in build artifacts, and can be extracted by anyone with repository access.

## Before

```typescript
const apiKey = 'sk-proj-abc123...';
```

## After

```typescript
const apiKey = environment.apiKey; // from environment variables
```

## Tags

`security`, `secrets`, `credentials`
