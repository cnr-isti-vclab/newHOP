# ADR 0014: UI Components Use the Public Viewer API

- Status: accepted
- Date: 2026-10-01

## Context

Applications may need different controls and layouts around the viewer. A built-in toolbar is useful, but the Presenter should remain usable without a particular UI component.

## Decision

Keep UI components such as `Toolbar` separate from `Presenter`. They may be distributed with newHOP, but they control the viewer only through its public API and public navigation or manager interfaces. The Presenter does not create or require a toolbar.

Application-owned controls are first-class clients of the same API and may replace or supplement the built-in toolbar.

## Consequences

- The viewer runtime remains UI-independent and reusable in custom pages.
- The built-in toolbar provides a convenient optional default without defining the application layout.
- Public API changes must preserve the needs of both built-in and application-owned controls.
