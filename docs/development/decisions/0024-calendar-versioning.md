# Decision 0024: Calendar-Based Versioning

- Status: accepted
- Date: 2026-11-27

## Context

newHOP needs versions that are valid npm/SemVer versions while remaining easy
to associate with a release date. Multiple releases on the same calendar day
are possible, especially for urgent corrections.

## Decision

Use the numeric version format:

```text
YYYY.M.D
```

The components mean:

- `YYYY`: four-digit release year.
- `M`: release month, from `1` to `12`.
- `D`: calendar day for a normal release, from `1` to `31`.

Examples:

```text
2026.11.27
2027.1.12
```

The version remains valid SemVer because all three components are numeric.
Month and day components are not zero-padded; numeric SemVer identifiers must
not contain leading zeroes.

For an exceptional release that must occur again in the same month while
preserving strict version ordering, use a third component greater than `100`.
The value must be greater than the previous released version in that month.
Once an exceptional value is used in a month, subsequent releases in that
month must also use an increasing value above `100`.

For example:

```text
2027.1.12       normal release
2027.1.112      exceptional release
2027.1.113      follow-up release
2027.2.1        next normal release
```

The version in `package.json` is the source of truth. It is propagated to the
lockfile, built library, exported `VERSION`, and generated distribution
metadata.

## Consequences

- Versions communicate the normal release date without prerelease suffixes.
- Emergency releases remain valid SemVer and visibly differ from normal dates.
- Release preparation must check that the new version is strictly greater than
  the previous released version.
- The exceptional-release convention is intentionally project-specific and
  must be explained wherever versions are changed.
- The current development version may use a temporary value such as
  `2026.0.1`; official releases must use the calendar format.
