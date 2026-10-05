# ADR 0016: Co-located Nexus Worker

- Status: accepted
- Date: 2026-10-05

## Context

Nexus models load the Corto worker from a URL configured through Nexus's `Cache.cortopath`. A fixed site-root path makes deployments depend on a particular server layout and prevents a self-contained example from being moved or renamed.

## Decision

Place `corto.em.js` beside each built newHOP library. The global build captures its script URL, and the ESM build uses its module URL, then newHOP sets Nexus's worker directory to that library's directory. Source-based Vite development continues to use the dev server's `/nexus3d/corto.em.js` route.

## Consequences

- The minimal deployment can be moved or renamed without changing its worker path.
- Deployments using Nexus models must keep `corto.em.js` beside the loaded newHOP library.
- Applications that inline the library instead of loading a built library file have no separate library URL to derive the worker location from.
