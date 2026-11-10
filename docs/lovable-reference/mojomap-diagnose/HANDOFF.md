# MojoMap · Diagnose flow + living map — implementation brief for Claude

Paste this whole file to Claude along with the `src/` folder in this ZIP. The source files are the reference implementation. Rebuild them inside the target codebase using its own router, styling setup and data layer, and keep the behavior and hierarchy described below.

## What this is
- **Home (`/`)**: a horizontally draggable "living map" with three zones. Past is a timeline on the left, Today (a card stack plus "In focus") sits in a softly inset panel in the middle, and Future (the "futures cone") is on the right. The MojoScore fills the full height of the bottom toolbar.
- **Diagnose flow (`/diagnose/:step`)**: 8 screens in this order: `send` → `welcome` → `base` → `goal` → `reframe` → `market` → `needs` → `mojomap`. Every screen shares one shell: a breadcrumb, a step-dot progress bar (top right, colored by the step's tone), and a sticky footer with ← Your map, ‹ previous, MojoScore, and the next step.
- Home links into the flow. The three Today-card CTAs open base / goal / market, the "See all" items map to steps, and the header has "Walk through Diagnose →".

## Design rules (the important part)
1. **One hero statement per screen.** Each screen has a 52px bold display headline ending in a green full stop (`.` in `--dot`). Under it goes at most one muted lede (18px). Everything else is supporting.
2. **Few boxes.** Use hairlines (`border-foreground/10`) and whitespace instead of cards. Only things you grab, drop or rearrange get a box: the file drop zone and the draggable market cards. Challengers and set-aside items may use a dashed outline.
3. **Tone colors carry meaning** (keep them consistent everywhere):
   - base = green `--tone-base #e3edd3` / ink `#6f9a3e`
   - goal = amber `--tone-goal #fbe3b8` / ink `#d98a12`
   - market = blue `--tone-market #dbe4f2` / ink `#4a6fa8`
4. **Palette:** paper `#f6f1e8` (page), surface `#fffdf8`, ink `#242323`, muted `#8a8580`, dot green `#9cbe6f`, disputed amber `#f6af3c`, track `#dedbd6`. Soft shadows only (see `--soft-shadow` / `--lift-shadow` in styles.css).
5. **Type:** Space Grotesk for display and body. JetBrains Mono, uppercase with 0.12em tracking, for 10–11px labels (`.label`).
6. **Shape:** rounded-full pills for buttons, rounded-2xl only on the few real cards. Dark pill = primary action, outlined pill = secondary.
7. **Motion:** a 150ms fade-up when screens enter, a staggered `rise` on list items, and 500–700ms transitions on value changes (dots sliding, bars filling). Respect `prefers-reduced-motion`.

## Screen behaviors
| Step | Hero idea | Interaction |
|---|---|---|
| send | "Send what Edgewood already has." | A dashed drop zone (drag-drop or click to choose). New files appear at the top of a hairline list marked "Received". |
| welcome | "Now the inside view sits beside the world's." | Three empty dashed rings on a connecting line (base / goal / market), still to be filled in. |
| base | "Solidify your base." | One row per part with a track showing two dots: the world's (filled) and yours (hollow). The distance between them shows the gap (agreed 0, split 45, outside 80, none 100). Clicking a row opens both texts side by side. Agreeing slides the dots together, turns them green, and raises the big "n/4 solid" counter. |
| goal | "You came with a focus. It gets tested, not replaced." | A sticky left column shows "What you came with". On the right is a numbered vertical path: 1 Sharpen, 2 Split "donors", 3 Challengers (dashed), then How it can end. |
| reframe | "Your problem, your goal, your market." | A segmented control switches Problem / Goal / Market (✓ once decided). The original wording is small and struck through, then "becomes", then the reframed sentence at 40px. Choices: Use this wording / Say it my way (edit the sentence inline) / Keep mine (the original returns and the reframe fades). Four "now it has" criteria are shown with green/amber dots. "Why it changed" reveals the checklist and the "Like this" example. |
| market | "Who could get you to your goal." | Three group cards you **drag to rank**. The #1 card is the pick: larger, blue, with a lifted shadow, and it shows "would have to be true". "Make it my pick" moves a card to the top. Each card shows needs served out of 14 as a bar. |
| needs | "What local donors need, step by step." | A segmented control picks the group. The full-width map has 8 job-step columns, starting from your base on the left toward your goal on the right. Dots mark the needs: filled = interviews, hollow = documents, amber = market. Clicking a dot shows the need as a large quote below. |
| mojomap | "One problem. One goal. One market." | Large statement rows for problem, goal and market, each with its tone dot. A compact line shows the base and the items set aside. An amber pill bar links to "Up next · Focus". |

## Data
All copy lives in `src/data/diagnose.ts` (the steps list, plus the content for each screen) and `src/data/home.ts`. Keep the copy out of the components. `[CURRENT]`, `[TARGET]`, `[DATE]` and the `[email]` address are deliberate placeholders, still to be signed off. The needs-dot wording is example content.

## Implementation notes
- The reference uses React 19, TanStack Router and Tailwind v4, with the tokens in `src/styles.css`. Map the tokens to the target's theme system and don't hardcode hex values in components.
- A single dynamic route drives the flow from the `STEPS` array. Prev/next and the progress dots come from that array, so reordering steps is a data change.
- Drag-and-drop uses native HTML5 drag events (`draggable`, `onDragOver` reorders live). Swap in dnd-kit if the target already uses it, and keep the "Make it my pick" button for keyboard and touch users.
- The state is local to each screen for now (picks, confirmations, wordings). If the target has a backend, persist it per client.
- Fonts: Google Fonts, Space Grotesk 400/500/700 and JetBrains Mono 400/500/700.

## Files in this ZIP
- `src/data/diagnose.ts`, `src/data/home.ts`: content
- `src/components/diagnose/Shell.tsx`: shared header, progress dots and footer
- `src/components/diagnose/Steps.tsx`: all 8 screens
- `src/components/home/CardStack.tsx`, `FutureCone.tsx`: Today cards and futures cone
- `src/routes/index.tsx`: the home map; `src/routes/diagnose.$step.tsx`: the flow route
- `src/styles.css`: tokens, utilities and animations
