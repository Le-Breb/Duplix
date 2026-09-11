# Duplix

Duplix is a cross-platform desktop app that finds **byte-identical** duplicate
files under a folder you pick, and lets you send the extra copies to the OS
trash while keeping one copy of each. It's a Tauri v2 app: a Rust backend
does the file-system work, a React + Tailwind frontend renders the UI.

This document is a map of the codebase for anyone (human or agent) picking
this project up cold.

## What it does (v1 scope)

- **Local filesystem only.** No cloud connectors.
- **Files tab: exact duplicates.** Files are grouped by BLAKE3 content hash —
  same hash means byte-identical content.
- **Images tab: near-duplicates.** Images are additionally grouped by visual
  similarity (a DCT-based perceptual hash, clustered by Hamming distance), so
  resized, recompressed, or lightly edited copies show up too — see
  "Near-duplicate image detection" below.
- **File types:** images, text files, PDFs (see the extension allowlist in
  `src-tauri/src/scanner.rs::classify_ext`). Everything else is skipped.
- **Manual scan only.** No scheduling, no persisted folder list. Each scan is
  triggered by "Choose a folder to scan…" on the Home screen.
- **Deletes go to OS trash**, never permanent delete (via the `trash` crate).
- Not built (deliberately out of scope for v1): video support, cloud sync,
  scan scheduling/history, any undo mechanism beyond what the OS trash
  already gives you for free.

## Tech stack

| Layer    | Tech                                                                  |
|----------|-------------------------------------------------------------------------|
| Shell    | Tauri v2 (Rust backend + native webview window)                       |
| Backend  | Rust — `rusqlite` (bundled SQLite), `blake3`, `walkdir`, `trash`, `image`, `base64`, `rayon` |
| Frontend | React 19 + TypeScript, Vite, Tailwind CSS v3, `@tanstack/react-virtual` |
| Bridge   | `@tauri-apps/api` (`invoke` for commands, `listen` for events)        |

## Directory structure

```
src-tauri/                     Rust backend (the Tauri "core")
  src/
    lib.rs                     App entry point: wires up plugins, opens the
                                SQLite cache, registers Tauri commands.
    main.rs                    Thin binary entry point, calls lib.rs::run().
    db.rs                      SQLite schema + connection setup (WAL mode).
    scanner.rs                 The scan pipeline: walk, hash, phash, cache,
                                prune. Has its own unit tests (`cargo test`).
    commands.rs                Tauri commands exposed to the frontend
                                (folder picker, scan control, queries, trash,
                                near-duplicate image clustering, thumbnails).
  capabilities/default.json    Tauri v2 permission grants (dialog plugin).
  tauri.conf.json              App metadata, window size, build hooks.

src/                            React frontend
  App.tsx                       Top-level state: `activeTab` (Files/Images)
                                 plus the Files screen state machine, scan
                                 progress, duplicate groups, and a parallel
                                 set of state for the Images tab.
  components/
    Sidebar.tsx                 Left rail: Files tab, Images tab, dark-mode
                                 toggle, Settings.
    HomeScreen.tsx               "Choose a folder to scan…" entry screen.
    ScanningScreen.tsx           Live progress (files scanned, current path,
                                 cancel-with-confirmation).
    ResultsScreen.tsx            Header (totals, "Move to Trash…") + the list
                                 of duplicate groups. (Files tab)
    GroupCard.tsx                One duplicate group: expand/collapse, pick
                                 which copy to keep, per-file trash/keep pill.
                                 (Files tab)
    ImagesScreen.tsx             Header (totals, sensitivity slider, "Move to
                                 Trash…") + the list of similar-photo groups.
                                 (Images tab)
    ImageGroupCard.tsx           A similar-photo group's summary row (fixed
                                 height — no inline expand): thumbnail,
                                 filename, count/similarity, reclaim size.
                                 Clicking it opens ImageCompareModal — there's
                                 exactly one place to look at a group's
                                 photos, not a small inline grid plus a
                                 separate bigger one. (Images tab)
    ImageCompareModal.tsx         Full-screen comparison view for one group,
                                 portaled to `document.body` (see the comment
                                 on the component — it has to be, since it's
                                 mounted from inside a `transform`-positioned
                                 virtualized row): an adaptive grid (2 photos
                                 → two big panes, more → a denser grid), true
                                 aspect ratio, no cropping, keep/skip controls
                                 in the header; click a tile to zoom into a
                                 single full-size photo with prev/next
                                 navigation.
    ImageThumb.tsx                Loads one preview on demand via the
                                 `get_image_thumbnail` command and renders it
                                 as an `<img>` (data URI), with a loading/
                                 failure placeholder. Takes `maxSize` (small
                                 for the group row's icon, large for the
                                 compare view) and `fit` ('cover' to
                                 crop-fill a square, 'contain' to show the
                                 whole image).
    ConfirmModal.tsx             "Move N files to Trash" confirmation dialog
                                 (shared by both tabs).
    DoneScreen.tsx                Result summary, any files that failed to
                                 trash, and a way back to Home. (Files tab —
                                 the Images tab shows an inline dismissible
                                 banner instead, since it isn't a linear flow.)
    EmptyScreen.tsx / ErrorScreen.tsx   No-duplicates and scan-failure states.
    SettingsModal.tsx             Currently just "Clear scan cache".
  lib/
    api.ts                       Thin wrappers around `invoke`/`listen` for
                                 every Tauri command and event — the only
                                 file that should know the IPC names.
    groups.ts                    Pure helpers: default "keep" selection,
                                 reclaimable-bytes math. Shared by App.tsx,
                                 GroupCard.tsx, and ImageGroupCard.tsx so all
                                 three agree on the rule.
    format.ts                    Byte/date/filename formatting helpers, plus
                                 `commonDirPrefix`/`relativePath` — Duplix's
                                 cache spans every folder ever scanned, so
                                 there's no single "source folder" globally;
                                 each similar-photo group's shared ancestor
                                 folder is used as the "relative to" root
                                 instead.
    thumbnailQueue.ts             Concurrency-limited queue in front of
                                 `get_image_thumbnail`, used by ImageThumb.tsx
                                 so many thumbnails mounting at once don't
                                 fire dozens of concurrent decode requests.
    visibilityObserver.ts         One shared `IntersectionObserver` for every
                                 ImageThumb, instead of one instance per
                                 thumbnail — with hundreds of thumbnails on
                                 screen, one-per-element was itself a real
                                 source of scroll jank, separate from (and on
                                 top of) the decode-request flood
                                 thumbnailQueue.ts solves.
  index.css                      Design tokens (CSS vars for light/dark
                                 theme) + Tailwind base.
```

## How a scan works, end to end

1. **Home** — user clicks "Choose a folder to scan…" → frontend calls the
   `pick_folder` command, which opens a native folder picker (Tauri dialog
   plugin) and returns the chosen path (or `null` if canceled).
2. **Scanning** — frontend calls `start_scan(root)`. The command validates
   the path synchronously (exists, is a directory) and returns immediately;
   the actual walk runs on a spawned background thread so the UI stays
   responsive. While it runs, the frontend is listening for two events:
   - `scan-progress` — `{ scanned, current_path }`, throttled to ~20/sec.
   - `scan-complete` — `{ scanned, skipped_dirs, canceled }`, fired once.
   Cancelling calls the `cancel_scan` command, which just flips an
   `AtomicBool` the scan loop checks each iteration.
3. **The walk itself** (`scanner::scan_folder`) — recurses with `walkdir`,
   skipping hidden files/dirs and not following symlinks. For each file with
   an allowed extension and non-zero size: look up `(path)` in the SQLite
   cache; if `size` and `mtime` still match the cached row, reuse the cached
   `content_hash` (skip re-hashing); otherwise hash it with BLAKE3 and
   upsert the row. After the walk, any cached row under the scanned folder
   whose path wasn't seen this time (deleted/moved file) is pruned.
4. **Results** — once `scan-complete` fires, the frontend calls
   `get_duplicate_groups`, which runs `GROUP BY content_hash HAVING
   COUNT(*) > 1` **against the whole cache, not just the just-scanned
   folder** (a deliberate choice — see "Cache scope" below), sorted by
   reclaimable space (`size * (count - 1)`) descending. If there are no
   groups, the frontend shows the Empty screen instead.
5. **Review** — for each group, `defaultKeepIndex` (in `lib/groups.ts`)
   picks the file to keep: shortest path string, then oldest `mtime` as a
   tiebreaker. The user can click any file to override which one is kept,
   or mark a whole group "keep all" (excluded from trashing).
6. **Commit** — the Confirm modal shows the total file count and space to
   reclaim; on confirm, the frontend builds the list of every non-kept path
   across all non-skipped groups and calls `trash_files(paths)`. The Rust
   side sends each to the OS trash individually (via the `trash` crate) and
   deletes its cache row on success, returning which paths succeeded and
   which failed (with the error).
7. **Done** — shows how many files were trashed, space reclaimed, and any
   failures, then a way back to Home to scan again.

## Near-duplicate image detection (Images tab)

The Images tab doesn't scan on its own — it works off images the Files tab
has already indexed — but computing *and clustering* perceptual hashes is a
deliberately separate pipeline from the Files-tab scan, triggered only when
the Images tab is opened:

1. **Perceptual hashing is never done during a Files-tab scan.** Decoding
   and resizing an image to hash it is roughly 90x slower than the BLAKE3
   streaming hash a regular scan does (measured: ~1.6ms vs ~135ms on a 12MP
   photo). Folding it into `scan_folder` made every scan of a photo-heavy
   folder feel dramatically slower — including a one-time full re-decode of
   every already-cached photo the first time you scanned after this feature
   shipped. Instead, `scan_folder` only ever leaves `phash` as `NULL` (for a
   new file) or resets it to `NULL` (if a file's `content_hash` changed —
   see the comment above the upsert in `scanner.rs`).
2. **Opening the Images tab** calls `start_image_indexing`, which finds every
   `image`-type row with `phash IS NULL`, computes it on a background thread
   spread across all CPU cores (`rayon`), and reports progress via
   `image-index-progress`/`image-index-complete` events so the UI shows a
   real progress bar instead of appearing to hang. This is normally a
   one-time cost per photo — indexing 10,000 photos will take a while and
   will use every core doing it (which can make a laptop feel warm, or even
   throttle its clocks a little on sustained runs — that's the OS protecting
   the CPU, not a bug), but a photo already indexed stays indexed until its
   content changes.
3. **The hash itself is a DCT-based perceptual hash (pHash)**, computed by
   `scanner::compute_phash`: shrink to 32×32 grayscale, run a 2D DCT, keep
   the top-left 8×8 block of low-frequency coefficients (dropping the single
   DC coefficient, which is just overall brightness), and set one bit per
   remaining coefficient based on whether it's above the block's mean → a
   63-bit hash. This replaced an earlier dHash (adjacent-pixel-comparison)
   implementation after it collapsed very different low-detail images (a
   mostly-dark photo, a near-blank scan, a flat-color icon) toward similar
   hashes — dHash only looks at local pixel-to-pixel gradients, which are
   nearly uniform across a plain image; the DCT's low frequencies capture
   overall structure instead, which stays discriminative even for low-detail
   images. `PHASH_ALGO_VERSION` in `db.rs` tracks which algorithm produced
   the hashes on disk — bump it whenever `compute_phash` changes, and
   `db::open` will reset every cached `phash` to `NULL` so the next indexing
   pass recomputes with the new algorithm instead of silently comparing
   hashes that mean different things.
4. **Clustering is two phases, not plain single-linkage.** Opening the
   Images tab (or dragging the sensitivity slider) calls
   `get_similar_image_groups(max_distance)`, which first finds *candidate*
   connected components via union-find (any two
   images within `max_distance` bits join the same component) — but taken
   alone, that lets similarity chain transitively (A~B and B~C would pull A
   and C into one group even if A and C aren't alike at all, which is
   exactly what let real libraries produce 90-photo groups of unrelated
   images). `split_into_cliques` then breaks each candidate component into
   subgroups where *every* pair is actually within `max_distance` — a greedy
   heuristic (not guaranteed-optimal clique cover, which is NP-hard, but
   cheap and good enough at the sizes these components come in), so "N
   similar photos" always means all N are mutually similar. The slider
   (0–16 in the UI) controls `max_distance`.
5. **Previews are never pre-generated or cached on disk** — `ImageThumb`
   calls `get_image_thumbnail(path, max_size)` per image, which decodes the
   file, resizes to at most `max_size` on its longest side, and returns a
   JPEG data URI (quality 88), so the frontend never needs raw filesystem
   read access. The same command backs both the small 220px grid tiles and
   the much larger comparison-view previews (900–2000px) — resizing further
   down is cheap, so one command with a size parameter covers both instead
   of needing a separate "thumbnail" vs "preview" command. Three things keep
   this from freezing or janking the UI when a big group list renders or
   scrolls: the group list itself is virtualized (`@tanstack/react-virtual`
   in `ImagesScreen.tsx` — only rows near the viewport are ever mounted, not
   every group at once); `ImageThumb` only requests its preview once
   scrolled near the viewport, via **one shared** `IntersectionObserver`
   (`lib/visibilityObserver.ts` — a separate observer instance per thumbnail
   was itself a measurable source of scroll jank once there were hundreds of
   them, independent of how much decode work was happening); and every
   preview request goes through `lib/thumbnailQueue.ts`, which caps how many
   decodes run at once (4) instead of firing dozens of concurrent IPC calls
   that saturate every core simultaneously.
6. **Comparing photos**: clicking a group row opens `ImageCompareModal` — the
   *only* view of a group's photos (an earlier version also had a small
   inline square-cropped grid for picking which copy to keep, duplicating
   the same job at a worse size; it's gone). The modal is an adaptive grid
   sized to the group's photo count (2 photos → two big side-by-side panes;
   more → progressively denser) with each photo at its true aspect ratio
   (`fit="contain"`, no cropping). Clicking a tile zooms into a single
   full-size photo with prev/next navigation (arrow buttons, arrow keys).
   Every photo's "Keep"/"→ Trash" pill toggles independently (checkbox
   semantics, not radio) — the user can keep an arbitrary subset of a
   group's photos, not just exactly one or all of them. "Keep newest" and
   "Keep shortest path" replace the whole kept set with a single index (the
   common case, one click); "Keep all in this set" toggles between
   everything and nothing kept.
7. **Paths are shown relative to each group's common folder, not
   absolute** — `format.ts::commonDirPrefix` finds the deepest folder shared
   by every photo in one group (there's no single global "source folder"
   to be relative to, since the cache spans every folder ever scanned), and
   `relativePath` strips it for display.
8. **Trashing** reuses the exact same `trash_files` command as the Files
   tab — an image group's "kept" file defaults to `defaultKeepIndex` (same
   shortest-path/oldest-mtime rule), same as exact-duplicate groups. There
   are two ways to trigger it: the header's "Move to Trash…" commits every
   non-skipped group across the whole list at once (the Files-tab pattern);
   `ImageCompareModal`'s "Trash this set now" commits just the one group
   being reviewed, immediately, without touching any other group's
   selections — for working through a large scan incrementally (review a
   few groups, trash them, close the app, come back later) rather than
   needing to get through the entire list in one sitting before anything
   can be committed. Both call `App.tsx`'s `loadImageGroups` afterward to
   refresh the list from the cache, so a committed group simply disappears
   (its "kept" photo usually no longer matches anything, or the group drops
   below 2 members) rather than needing bespoke local list surgery.

## SQLite cache

Schema (`db.rs`):

```
files(id, path UNIQUE, file_type, size, mtime, content_hash, phash, last_scanned)
meta(key UNIQUE, value)
```

`phash` is nullable — `NULL` for non-image files, for images the `image`
crate couldn't decode, and for any image not yet visited by the Images-tab
indexing pass. DBs created before this column existed are migrated in place
(`db::open` checks `PRAGMA table_info` and runs `ALTER TABLE ADD COLUMN` if
needed) — no reset or re-scan required.

`meta` is a small key/value table for schema-independent settings that
aren't per-file. Right now it holds exactly one row: `phash_algo_version`,
compared on every `db::open` against `PHASH_ALGO_VERSION` in `db.rs`. A
mismatch (including the first time this row doesn't exist yet) resets every
`phash` to `NULL`, so a change to `scanner::compute_phash` can't silently
compare hashes computed by two different algorithm versions against each
other.

It's a **cache**, not scan history: it exists purely so re-scanning a folder
doesn't re-hash files that haven't changed (`path` + `size` + `mtime` match
→ reuse `content_hash`). `SettingsModal` exposes `clear_cache` to wipe it
(e.g. if the user is paranoid about stale hashes or just wants to reclaim
the DB file's disk space via `VACUUM`).

**Cache scope is global, by design.** Rows from every folder ever scanned
stay in the cache, and `get_duplicate_groups` queries across all of them —
so scanning `Downloads` today can surface a duplicate against `Pictures`
scanned last week. Re-scanning a folder only refreshes/prunes rows under
that folder's prefix; it never touches rows from other folders. This was an
explicit decision (see git history / conversation log) over the alternative
of scoping duplicates to only the most-recently-scanned folder.

## Frontend state shape

`App.tsx` is the only stateful component; everything under `components/` is
close to presentational, driven by props and callbacks. The two pieces of
state worth knowing about:

- `activeTab: 'files' | 'images'` — which sidebar tab is showing. Switching
  tabs doesn't reset the other tab's state; both are kept in memory.
- `screen: 'home' | 'scanning' | 'results' | 'empty' | 'error' | 'done'` —
  drives which Files-tab screen renders. There's no router; it's just a big
  conditional in the JSX.
- `groupUi: Record<content_hash, { keepIndex, skipped, open }>` (Files tab)
  — per-group UI overrides, keyed by `content_hash` so they survive group
  list re-renders. `keepIndex: null` means "use the computed default"
  (`defaultKeepIndex`), not "no file is kept." The Files tab always keeps
  exactly one copy — files in an exact-duplicate group are byte-identical,
  so there's rarely a reason to keep more than one.
- `imageGroupUi: Record<id, { keptIndices }>` (Images tab, `lib/groups.ts`)
  — a deliberately different, simpler shape than the Files tab's, since
  Images groups are only *visually* similar and a user might legitimately
  want to keep an arbitrary subset (2 of 5 near-duplicates, say), not just
  one or all. `keptIndices: null` means "use the computed default" (exactly
  one photo, same `defaultKeepIndex` rule); once touched it's a concrete
  `Set<number>`, which can be empty (trash the whole group) or the full set
  (keep everything) — both are valid, explicit choices, not edge cases.
  `resolveKeptIndices(files, ui)` is the one place that materializes the
  default, used consistently by the commit handlers, the header's totals,
  and every component that renders a keep/trash state, so they can't drift
  out of sync with each other. The cluster `id` is a BLAKE3 hash of its
  sorted member paths (computed in `get_similar_image_groups`), so it stays
  stable across re-clustering as long as the same files end up together.
- `imagesLoaded` — sticky "does the Images tab need to refetch" flag. It's
  cleared to `false` whenever a Files-tab scan completes, so the next time
  the user opens the Images tab it picks up newly-indexed photos.

## Tauri commands & events reference

| Command                        | Args            | Returns                          |
|---------------------------------|------------------|-----------------------------------|
| `pick_folder`                   | —                | `string \| null`                  |
| `start_scan`                    | `root: string`   | `void` (throws if path invalid)   |
| `cancel_scan`                   | —                | `void`                            |
| `get_duplicate_groups`          | —                | `DuplicateGroup[]`                |
| `trash_files`                   | `paths: string[]`| `{ trashed, failed }`             |
| `clear_cache`                   | —                | `number` (rows deleted)           |
| `get_similar_image_groups`      | `maxDistance: number` | `{ groups: SimilarImageGroup[], indexed_count }` |
| `start_image_indexing`          | —                | `void` (progress via events)      |
| `get_image_thumbnail`           | `path: string, maxSize: number` | `string` (JPEG data URI) |

| Event                    | Payload                                       |
|--------------------------|------------------------------------------------|
| `scan-progress`          | `{ scanned: number, current_path: string }`     |
| `scan-complete`          | `{ scanned, skipped_dirs, canceled }`           |
| `image-index-progress`   | `{ indexed: number, total: number }`            |
| `image-index-complete`   | `{ indexed: number, total: number }`            |

`src/lib/api.ts` is the single source of truth for these signatures on the
frontend side — if you add or change a command, update it there too.

## Running it

```bash
npm install
npm run tauri dev     # launches the real desktop app (Rust + webview)
npm run dev            # frontend only, in a browser — invoke() calls will
                        # fail without the Tauri runtime, so this is only
                        # useful for pure UI/CSS iteration
```

Linux needs the WebKitGTK dev packages to compile the Rust side:
`libwebkit2gtk-4.1-dev libjavascriptcoregtk-4.1-dev libsoup-3.0-dev
libayatana-appindicator3-dev librsvg2-dev build-essential libssl-dev
libxdo-dev`.

```bash
npm run build          # tsc + vite build (frontend only)
npm run lint            # oxlint
cd src-tauri && cargo test   # scanner unit tests (walk/hash/cache/prune
                              # logic, using tempdir fixtures — no Tauri
                              # runtime needed)
cd src-tauri && cargo check   # type-check the Rust side
```

## Non-obvious decisions, in one place

- **File type allowlist** lives in `scanner.rs::classify_ext` — extend it
  there if a new image/text/PDF extension needs support.
- **Zero-byte files are skipped entirely** (never hashed, never stored) —
  otherwise every empty file in the scanned tree would show up as one giant
  false-positive duplicate group.
- **Hidden files/dirs (dotfiles) are skipped**, and symlinks aren't
  followed, to avoid noise and infinite loops.
- **Default "keep" file** = shortest path string, then oldest `mtime` on a
  tie. This is a UX default, not a correctness requirement — the user can
  always override it per group.
- **A duplicate group's `size`/`file_type` apply to every file in it** —
  that's implied by having the same content hash, so the frontend doesn't
  need to look at individual files for that.
- **pHash (DCT-based) over dHash** — the first implementation used dHash
  (compare adjacent pixels) for its simplicity, but real photo libraries
  showed it collapsing very different low-detail images (dark photos, blank
  scans, flat icons) toward similar hashes, letting the clustering below
  merge unrelated photos. A direct 2D DCT (no FFT — a 32-point transform is
  small enough to do the naive O(N²) way per row/column, and decode time
  dominates the hash cost either way) fixed it: low-frequency DCT
  coefficients summarize overall structure, not local gradients, so they
  stay discriminative for plain/low-detail images too.
- **Clique-splitting on top of union-find, not plain single-linkage** — a
  first version clustered by connected components alone, which lets
  similarity chain transitively (A~B~C even when A and C aren't alike) and
  in practice produced groups of dozens of unrelated photos out of a large
  library. `commands::split_into_cliques` enforces that every pair inside a
  reported group is actually within the sensitivity threshold, at the cost
  of a greedy (not provably optimal — exact max-clique is NP-hard) heuristic
  instead of a single union-find pass.
- **Perceptual hashing is a separate on-demand pass, not part of `scan_folder`**
  — see "Near-duplicate image detection" above; decoding+resizing every
  image during a regular scan measured ~90x slower per file than the BLAKE3
  hash a scan otherwise does, which made ordinary Files-tab scans feel
  dramatically slower.
- **Thumbnail requests are lazy (`IntersectionObserver`) and
  concurrency-limited (`lib/thumbnailQueue.ts`), never cached to disk** — a
  first version fired one `get_image_thumbnail` IPC call per photo the
  moment its component mounted, so opening the Images tab (or expanding a
  large group) could fire dozens of concurrent full-image decodes at once
  and stall the UI until they all finished. Loading only what's near the
  viewport, a handful at a time, keeps the app responsive; a disk cache
  wasn't needed once that was fixed.
- **One shared `IntersectionObserver`, not one per thumbnail** — the first
  lazy-loading version above still `new IntersectionObserver(...)`'d inside
  every `ImageThumb`. That fixed the initial load spike but not scrolling
  itself: hundreds of independent observer instances all reacting to every
  scroll frame (plus a React re-render each time one crossed the threshold)
  is real, spread-out overhead, distinct from — and not fixed by — capping
  decode concurrency. `lib/visibilityObserver.ts` shares one observer
  instance across every thumbnail instead.
- **The group list is virtualized (`@tanstack/react-virtual`)** — for the
  same reason as the shared observer above: even with every thumbnail
  request deferred and throttled, a long list still meant hundreds of live
  DOM nodes that the browser has to lay out and paint on every scroll frame,
  image loading aside entirely. Only rows actually near the viewport are
  mounted. Every row is a fixed-height summary (comparing a group's photos
  opens a full-screen modal, not an inline expand — see below), so
  `estimateSize` is exact; `measureElement` is kept anyway as a cheap
  defensive correction in case that ever stops being true.
- **Scroll-triggered re-renders must not do real work** — `useVirtualizer`
  re-renders `ImagesScreen` on every scroll frame (that's how it knows which
  rows are newly visible). A first version computed the header's totals
  (`trashCount`/`keptCount`/`reclaimBytes`) with a plain `for` loop over
  every group directly in the render body, so that loop — its cost scaling
  with the *entire* library, not just what's visible — reran on every single
  scroll tick. That's a real, synchronous, main-thread cost with nothing to
  do with thumbnail loading, and was a genuine remaining cause of scroll
  jank after the loading-related fixes above. It's wrapped in `useMemo` now,
  keyed on `[groups, groupUi]`, so it only reruns when the data actually
  changes. The lesson generalizes: with a scroll-driven re-render in the
  mix, *any* per-render work whose cost scales with total data rather than
  visible data is worth checking, not just the obvious image-loading path.
- **`ImageGroupCard` is wrapped in `React.memo`, and `ImagesScreen` is
  written to make that actually work** — the `useMemo` fix above stopped
  `ImagesScreen`'s own per-render cost, but every *visible* row's
  `ImageGroupCard` (full subtree, `ImageThumb` included) was still fully
  re-rendering and reconciling on every scroll frame regardless, since
  nothing told React those rows hadn't actually changed. `React.memo` is
  only as good as its props' referential stability, so this required two
  companion fixes in `ImagesScreen`: a single shared `EMPTY_UI` constant
  instead of a function that allocated a fresh fallback object per row per
  render, and passing `onToggleSkip`/`onSetKeepIndex` straight through
  unwrapped (raw, id-aware signatures the child curries with its own
  `group.id`) instead of wrapping each in a new per-row closure inside the
  `.map()`. Both defeat `React.memo`'s shallow prop comparison on their own
  if left in place — the object literal and the closures look different by
  reference on every render even when nothing meaningful changed.
- **Comparing a group's photos is a single unified view, not an inline
  pick-grid plus a separate "compare" modal** — an earlier version had both:
  a small square-cropped inline grid in `ImageGroupCard` for picking which
  copy to keep, and a separate, bigger `ImageCompareModal` (behind a
  "Compare full size" button) for actually looking at them. Two views doing
  the same underlying job (look at the group's photos, decide which to
  keep) at two different sizes was confusing and redundant. Clicking a
  group row now opens `ImageCompareModal` directly, with the pick-which-
  to-keep controls (`Keep newest` / `Keep shortest path` / `Keep all in this
  set`) moved into its header — one place to look, one place to decide.
- **`ImageCompareModal` renders through a React portal to `document.body`,
  not in place** — it's mounted from inside a group row, and `ImagesScreen`
  positions virtualized rows with `transform: translateY(...)`. A CSS
  `transform` on an ancestor makes that ancestor the containing block for
  any `position: fixed` descendant, instead of the viewport — so without the
  portal, this "full-screen" overlay only ever covered its own row's box on
  screen, not the actual window. Easy to miss until you actually look at it
  rendered; if you're adding another `position: fixed` overlay anywhere
  downstream of a transformed/virtualized ancestor, it needs the same
  treatment.
- **Images-tab keep state is a `Set<number>` of kept indices, not the Files
  tab's single `keepIndex` + `skipped` boolean pair** — deliberately a
  separate type (`ImageGroupUiState` vs. `GroupUiState`), scoped to the
  Images tab only. The Files tab's model (keep exactly one, or keep all)
  fits exact duplicates fine; Images groups are only visually similar, so a
  user might legitimately want an arbitrary subset kept. Unifying the two
  models was considered and rejected for now — it would touch the Files
  tab's `GroupCard.tsx`/`ResultsScreen.tsx`, which aren't broken and weren't
  part of what this was solving.
