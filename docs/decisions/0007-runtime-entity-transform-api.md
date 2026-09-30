# ADR 0007: Runtime Entity Transforms Use Presenter Get/Set Methods

- Status: accepted
- Date: 2026-09-17

## Context

Applications need to inspect and modify named entities after scene loading. Direct Three.js access is useful for advanced work, but it does not synchronize the newHOP definition or provide a stable author-facing unit convention.

## Decision

Expose `Presenter.getEntityTransform(id)` and `Presenter.setEntityTransform(id, update)`. The getter returns a local transform snapshot with a read-only `mode`, position, rotation in degrees, scale, and a column-major matrix. In `matrix` mode, the component fields are inactive identity placeholders: position `[0, 0, 0]`, rotation `[0, 0, 0]`, and scale `[1, 1, 1]`. In `components` mode, the matrix is the actual derived matrix.

Supplying a matrix selects matrix mode and gives it precedence. Supplying position, rotation, or scale selects component mode, resets the components to identity, applies the supplied fields, and clears the stored matrix. The matrix is not decomposed during this transition. Matrix and component fields cannot be combined in one declaration or update.

An empty runtime update is a no-op.

## Consequences

- Common runtime transform operations have a stable newHOP API.
- Entity definitions remain synchronized when these methods are used.
- `getEntityObject(id)` remains an advanced escape hatch for direct Three.js manipulation.
- Direct Three.js mutations are not automatically reflected in the newHOP transform snapshot.
- Non-TRS matrices such as skew transforms remain usable as long as the entity stays in matrix mode.