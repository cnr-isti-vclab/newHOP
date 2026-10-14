# ADR 0006: Navigation Trackball Visualizer

## Status

Accepted

## Decision

Expose the optional visual trackball through `navigation.trackball`, not through the general `helpers` block. The visualizer is owned by the navigation subsystem, follows the live navigation target, and renders through a dedicated non-pickable overlay root.

The configuration supports visibility, screen-relative size, color, opacity, axis lines, and rotation rings. It is disabled by default so existing scenes retain their current appearance.

## Consequences

The visualizer can follow recentering, fitting, mode changes, and projection changes without contributing to scene bounds, clipping, measurement, or object picking. It remains useful in both turntable and sphere modes while keeping ordinary helpers focused on world-space scene references.
