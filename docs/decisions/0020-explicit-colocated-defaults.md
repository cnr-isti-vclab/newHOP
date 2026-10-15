# ADR 0020: Explicit Colocated Defaults

- Status: accepted
- Date: 2026-10-15

## Context

newHOP aims to provide sensible behavior without requiring scene authors to configure every parameter. The runtime also exposes configuration objects that are used both during initialization and in later updates. When fallback values are scattered through constructors, setters, and material creation, it becomes difficult for a human maintainer or author to see the complete behavior at a glance and easy for initialization and runtime updates to drift apart.

## Decision

Each configurable feature should define a complete, human-readable defaults structure in the module that owns the feature. The structure should contain every parameter with its default value, including visual and interaction parameters such as marker size, color, opacity, depth behavior, and offsets. Initialization and runtime update paths should reuse that structure, or a normalized derivative of it, rather than introducing independent fallback literals.

Defaults do not need to live in one global file. Keeping them close to the owning manager or subsystem is preferred when that makes ownership and maintenance clearer. Public documentation and examples should describe the defaults that matter to authors, and changes to defaults should be validated with the affected feature.

## Consequences

- Maintainers can review a feature's behavior from one compact code structure.
- Initialization and runtime updates are less likely to disagree about fallback values.
- Sensible defaults remain easy to discover and tune without broad code archaeology.
- Defaults become an explicit part of the feature contract and require documentation and validation when changed.
- A feature may need a small normalization layer when public partial updates and complete internal defaults use different shapes.
