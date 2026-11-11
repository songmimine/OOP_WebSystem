# University LabLink visual system

## Direction

LabLink is an operate-first university service desk. The redesign uses a restrained instrument-panel language: deep ink navy for trust and navigation, cobalt for actions and focus, saffron for attention, and a lightly ruled field that makes dense operational screens easier to scan.

## Tokens

- **Ink:** `#17243b`
- **Navy:** `#102b52`
- **Deep navy:** `#071b38`
- **Cobalt:** `#1d66c1`
- **Saffron:** `#e8ab27`
- **Page field:** `#f3f6fa`
- **Line:** `#dce5f0`

## Composition

Shared pages use a branded utility/search bar, a navy navigation band, a focused page heading, and one primary workspace. Cards are reserved for bounded tasks or stateful information; tables remain the preferred form for inventory and record-heavy views. Mobile layouts collapse navigation and grids without changing the order of the user’s work.

## Motion and accessibility

The welcome screen owns the primary authored motion through the flask fill and a short fade. All decorative motion is disabled under `prefers-reduced-motion`, and existing focus, loading, empty, error, and disabled states remain part of the interface contract.
