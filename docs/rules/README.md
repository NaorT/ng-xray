# Rule Reference

All rules documented by ng-xray.

## Architecture

- [`circular-dependency`](./circular-dependency.md) — Circular Import Dependency
- [`deep-import`](./deep-import.md) — Deep Import Into Package Internals
- [`boundary-violation`](./boundary-violation.md) — Architecture Boundary Violation
- [`public-api-violation`](./public-api-violation.md) — Public API Bypass
- [`circular-service-injection`](./circular-service-injection.md) — Circular Service Injection
- [`forward-ref-usage`](./forward-ref-usage.md) — forwardRef Usage

## Best-practices

- [`non-standalone-component`](./non-standalone-component.md) — Non-Standalone Component
- [`@angular-eslint/template/banana-in-box`](./@angular-eslint/template/banana-in-box.md) — Banana-in-Box Syntax Error
- [`rxjs-x/no-unsafe-takeuntil`](./rxjs-x/no-unsafe-takeuntil.md) — Unsafe takeUntil Placement
- [`rxjs-x/no-ignored-subscription`](./rxjs-x/no-ignored-subscription.md) — Ignored Subscription
- [`low-signal-readiness`](./low-signal-readiness.md) — Low Signal Adoption

## Dead-code

- [`dead-code-generic`](./dead-code-generic.md) — Unused Export (Generic)
- [`unused-angular-entity`](./unused-angular-entity.md) — Unused Angular Entity
- [`unused-class-member`](./unused-class-member.md) — Unused Class Member

## Performance

- [`missing-onpush`](./missing-onpush.md) — Missing OnPush Change Detection
- [`missing-trackby`](./missing-trackby.md) — Missing trackBy in *ngFor
- [`large-component`](./large-component.md) — Oversized Component
- [`eager-route-component`](./eager-route-component.md) — Eagerly Loaded Route Component
- [`eager-route-children`](./eager-route-children.md) — Eagerly Loaded Route Children
- [`@angular-eslint/template/use-track-by-function`](./@angular-eslint/template/use-track-by-function.md) — Missing trackBy in *ngFor / track in @for

## Security

- [`bypass-security-trust`](./bypass-security-trust.md) — DomSanitizer Bypass
- [`eval-usage`](./eval-usage.md) — eval() or new Function() Usage
- [`hardcoded-secret`](./hardcoded-secret.md) — Hardcoded Secret or API Key
- [`innerhtml-binding`](./innerhtml-binding.md) — innerHTML Binding in Template
