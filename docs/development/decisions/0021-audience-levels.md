# ADR 0021: Developer, Author, and User Audience Levels

- Status: accepted
- Date: 2026-10-15

## Context

newHOP is middleware rather than a finished visualization. It is distributed so third parties can build interactive 3D visualization webpages. Requirements can otherwise become ambiguous because the person developing the library, the person authoring an application with it, and the person using the finished page have different needs and different validation surfaces.

## Decision

Use three audience levels consistently throughout design, implementation, documentation, and validation:

- **Developer** builds and maintains newHOP and produces its distributable library and bundles.
- **Author** consumes the distributed library to build a visualization application, including scene data, controls, and application-specific behavior.
- **User** accesses and interacts with the completed visualization webpage.

When a requirement spans levels, state the affected levels explicitly. Public APIs, scene schemas, defaults, and authoring references primarily serve authors. Source structure, build output, tests, and architectural rules primarily serve developers. Interaction behavior, visual feedback, accessibility, and visible errors in a finished page primarily serve users.

## Consequences

- Design discussions can identify the intended consumer of a behavior without relying on context.
- Validation can be chosen at the appropriate level: build and type checks for developers, examples and API checks for authors, and browser interaction checks for users.
- Documentation can separate library implementation guidance from application-authoring guidance and finished-page behavior.
- A feature may intentionally serve multiple levels, but that relationship should be explicit.
