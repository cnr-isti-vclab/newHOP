# newHOP Desiderata

This document records desirable future capabilities that are not currently part of the implementation. Entries describe goals and design direction, not committed release work.

## Configurable Mouse Bindings

Allow authors to configure the navigation mouse bindings for each scene or presenter.

The configuration should be able to assign navigation actions such as:

- Rotate
- Pan
- Zoom
- Application-defined context-menu behavior

Bindings should support mouse buttons, modifier keys such as Shift, Ctrl, and Alt, and gesture types such as drag, click, and wheel. Conflicting bindings should be rejected or reported clearly.

A right-button click should remain distinguishable from a right-button drag: a click may open the browser context menu or an author-defined menu, while a drag may pan, rotate, or perform another configured navigation action.

This should be designed as a navigation configuration feature rather than as hard-coded behavior in the Trackball implementation.

## Configurable Color Precedence

Define an explicit color-composition policy for models that provide both textures and per-vertex colors. The policy should support at least:

- Texture only
- Vertex colors only
- Texture multiplied by vertex colors

The default should preserve the source material behavior where possible, while allowing authors to select a predictable policy when a format or renderer exposes both inputs. The policy should be evaluated consistently across Nexus, PLY, OBJ, and other formats that can provide these channels, without changing the authored material unless explicitly requested.

## Backface Readability Cue

Provide an optional visual cue for back faces so final users can recognize when they are viewing the reverse side of a surface. This is separate from backface culling, which is already available.

The simplest feasible approach is a shader-level adjustment that detects back faces and either applies a configurable tint or darkens the final shaded color, while preserving the material's normal texture, vertex-color, and lighting behavior. It should not replace the material with a separate shading model or require duplicate geometry.

## Equirectangular Environment Maps

Support a lat-long/equirectangular image in the `world` block as an environment resource. The environment's vertical orientation should follow the scene/navigation `upAxis`, while an explicit azimuth rotation should allow authors to align the image with the authored scene.

Keep background display and environment lighting as separate choices. The image may be used as a visible background, as a reflection source for specular materials, or both. Diffuse image-based illumination should not be assumed to come directly from the sharp environment image: prefer a prefiltered or blurred representation, such as a PMREM-generated environment, and allow it to be disabled or configured independently when explicit scene lights provide the diffuse contribution.
