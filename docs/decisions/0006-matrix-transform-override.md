# ADR 0006: Matrix Transforms Override Decomposed Entity Transforms

- Status: accepted
- Date: 2026-09-17

## Context

Some source formats and existing 3DHOP scenes provide a complete 4x4 transform matrix rather than separate position, rotation, and scale values. Requiring authors to decompose that matrix can introduce precision loss and unnecessary work.

## Decision

Object and spot definitions may provide a column-major 4x4 `matrix`, using the same element order as `THREE.Matrix4.toArray()`. A definition must use either `matrix` or component fields; the two representations cannot be combined.

## Consequences

- Imported transforms can be preserved without decomposition.
- The matrix representation is explicit and compatible with Three.js.
- Authors should omit decomposed transform properties when the matrix is the source of truth.
- Direct runtime matrix mutation requires `matrixAutoUpdate` to remain disabled or be managed explicitly by the caller.