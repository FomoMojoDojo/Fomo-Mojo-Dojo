# Current Signal Map Prototype Spec

This describes the experimental map concept currently being tested on the prototype route.

## Intent

Replace heavy score emphasis with a directional signal model:

- where we are now
- next move
- path to desired outcome

## Zoomed Out behavior

- One master path from current state to desired outcome.
- Route options represented as sequential stop dots on that single path.
- Dot count matches number of available route options.
- No text labels attached to dots on the map.
- Hover a stop to reveal route details in a detail panel below.
- Default detail panel shows top/highest-priority stop.

## Next Turn behavior

- Left “You Are Here” card includes:
  - current signal node
  - compact next-leg mini map (small)
  - moving dot along the short next-leg path
  - distance to next waypoint in signal points
- Right guidance card is text-only (no embedded path visual).

## Motion

- Dot movement is slow and calm.
- Pulse is subtle and should convey state, not decoration.

## Data source behavior

- Use real route options when available.
- If route options are missing, use clearly marked fallback/demo options.
- Must remain safe when no company is selected.

## Route availability

Prototype page route:

- `/map-signal-prototype`

Current trigger:

- clicking the Mojo logo opens this prototype route.
