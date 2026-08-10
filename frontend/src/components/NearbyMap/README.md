# NearbyMap

Multi-pin OpenStreetMap viewer used by the customer Home screen. Renders
an array of seller markers and surfaces taps to React via `onMarkerTap`.

## Source layout

```
src/components/NearbyMap/
├── index.tsx     # React Native wrapper
├── bridge.ts     # Typed contract (READY / MARKER_TAP / ERROR)
└── README.md
```

The page-side bridge lives in `assets/map-picker.html` alongside the
single-pin picker contract used by `MapPickerSheet` and `ShopMapPreview`.
Both layers coexist on the same page; only the multi-pin one is wired by
this component.

## Regeneration

If you edit `assets/map-picker.html`, `assets/map-picker/leaflet.css`, or
`assets/map-picker/leaflet.script` — including the new `__setMarkers` /
`__selectMarker` / `MARKER_TAP` block under the "Multi-pin viewer"
heading in `map-picker.html` — run:

```
node scripts/build-map-picker-inline.js --write
```

The build script is wired as a `pre` hook on `start`, `build`,
`android`, `ios`, `web`, `lint`, and `typecheck` so dev and CI loops
will fail loudly if the inline bundle is stale.

## Bridge contract

Inbound (`window.__…` on the page):

- `__setMarkers(JSON.stringify({ markers: { id, lat, lng, label? }[] }))` —
  replaces the current marker layer. If 2+ markers, the page fit-bounds
  to them; 1 marker centres with zoom 14. The function may be called
  before `READY` and is replayed from `boot()` in that case.
- `__selectMarker(id | null)` — toggles the `.nm-pin-selected` class
  on the matching marker's icon. Cheap, no re-emit.
- `__setView(lat, lng, zoom)` — reuses the single-pin contract.

Outbound (`postMessage` to RN):

- `{ type: "READY" }` — fires once after `boot()` succeeds; do not
  inject before this.
- `{ type: "MARKER_TAP", id }` — fired when the user taps a marker
  inside the WebView. A 200 ms debounce is applied inside the React
  wrapper so a double-tap does not push two routes.
- `{ type: "ERROR", message, code? }` — emits `TILE_ERROR` on tile load
  failure (latched) and `SCRIPT_ERROR` from the global `window.onerror`
  reporter at the top of `map-picker.html`.

## Pointer events

Default `auto` — taps must reach Leaflet to fire `MARKER_TAP`. This is
the opposite of `ShopMapPreview`, which sets `pointerEvents="none"`
because it is read-only.
