# ADR 0020: Explicit Colocated Defaults

- Status: accepted
- Date: 2026-10-15

## Context

newHOP aims to provide sensible behavior without requiring scene authors to configure every parameter. The runtime also exposes configuration objects that are used both during initialization and in later updates. When fallback values are scattered through constructors, setters, and material creation, it becomes difficult for a human maintainer or author to see the complete behavior at a glance and easy for initialization and runtime updates to drift apart.

## Decision

Each configurable feature should preferably define human-readable defaults structures near the beginning of the module that owns the feature. The public defaults structure is a copy of the author-facing option declaration shape: it contains every author-configurable parameter with its default value, including visual and interaction parameters such as marker size, color, opacity, depth behavior, and offsets, but excludes fixed implementation constants. If the runtime has additional fixed defaults, they should preferably belong in a separate private structure or grouped private constants in the same module. Initialization and runtime update paths should reuse the appropriate structure, or a normalized derivative of it, rather than introducing independent fallback literals. This is a recommendation, not a blocking requirement; exceptions are acceptable when the structure would make the implementation less clear or practical.

Defaults do not need to live in one global file. Keeping them close to the owning manager or subsystem is preferred when that makes ownership and maintenance clearer. Public documentation and examples should describe the defaults that matter to authors, and changes to defaults should be validated with the affected feature.

## Consequences

- Maintainers can review author-facing behavior from one compact public structure and implementation-only behavior from a colocated private structure.
- Initialization and runtime updates are less likely to disagree about fallback values.
- Sensible defaults remain easy to discover and tune without broad code archaeology.
- Defaults become an explicit part of the feature contract and require documentation and validation when changed.
- A feature may need a small normalization layer when public partial updates and complete internal defaults use different shapes.
