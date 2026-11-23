# ADR 0011: Grouped Object Appearance Modifiers

newHOP needs reversible runtime appearance changes without destroying material choices authored by a model format.

Use a grouped object appearance API with these properties:

- `visible`: controls object visibility.
- `uniform` and `color`: when enabled, suppress source textures and vertex colors and use the declared color.
- `transparent`: enables material blending.
- `alpha`: supplies opacity only while `transparent` is true; otherwise it is ignored.
- `shadeless`: switch to an unlit alternate material while retaining source color inputs.
- `doubleSided`: controls face culling.

Material instances are isolated per entity before appearance changes are applied. The original material instances remain available as the baseline, while shadeless alternates are maintained separately. Disabling a modifier restores the authored state instead of reconstructing it from incomplete runtime properties.

GLB/glTF material settings remain the baseline for the original material. PLY, OBJ, and Nexus loaders provide their format-specific baseline materials. Runtime modifiers are applied after loading and can be changed through `getObjectAppearance()` and `setObjectAppearance()`.

The appearance API targets objects. Spots retain their primitive-specific controls until a separate spot appearance contract is needed.
