# UI architecture assessment — is it time for a framework?

_Written 2026-07-12. Scope: `src/app/render.js`, `bootstrap.js`, and the manual-DOM
surface across the frontend. Question: should TaskPlayer move to React (or similar)?_

> **Implementation update — 2026-07-15:** ADR
> [0004](decisions/0004-lit-html-component-model.md) accepted the one-module-per-component model.
> Topbar, pinned navigation, grouped sidebar, task-list page, task rows, sticky task header, and
> Daily Jam now live in `src/app/components/` and render through `lit-html`. Home, Insights,
> Settings, dialogs, and secondary surfaces remain on the documented incremental migration path.

## TL;DR

**Not React. But the render layer does have a real, structural problem worth fixing —
and the fix is to use the diffing library you already ship (`lit-html`) everywhere,
optionally graduating to Lit components.** A React rewrite would replace the view
layer wholesale to solve a problem a much smaller change already addresses.

## Correction to the first read

An earlier glance said "you already use lit-html declarative rendering." The audit
shows that's only ~30% true, and the gap is the whole story:

| Rendering style in `render.js` | Count | What it is |
| --- | --- | --- |
| `el.innerHTML = \`...\`` | 21 | Nuke-and-repave: rebuild a whole panel as an HTML string, throw away the old DOM |
| `litRender(html\`...\`, el)` | 10 | Real lit-html diffing |
| `esc(...)` manual escape calls | 65 | Hand-rolled XSS protection inside those strings |

So the actual architecture is: **on every `render()`, rebuild the topbar, sidebar,
main panel, and modals as HTML strings and slam them into `innerHTML`.** `lit-html`
was brought in later, only for the ~10 spots where nuke-and-repave visibly breaks
(the live clock/progress bar that updates every tick; at the time, the now-playing rail). It's a
patch over the pattern, not the pattern itself.

## Why that pattern generates the pain you're feeling

Every symptom below traces back to "rebuild as a string, replace the DOM":

1. **Event listeners can't survive a re-render.** Replacing `innerHTML` destroys every
   node and its listeners, so the app is forced into 100% event delegation via
   `data-action` attributes on `document`. That works, but it means every interactive
   element's behavior lives far from its markup, wired by string matching.

2. **Focus, scroll, selection, and cursor position are wiped on every render.** This is
   why there's a cluster of hacks that deliberately *bypass* `render()`:
   - The topbar search input writes straight to `#searchResults` on each keystroke
     (`performSearch`), because going through `render()` would rebuild the `<input>`
     and fight the browser over cursor position mid-type.
   - Keyboard-nav focus is a transient `.kb-focus` class that `render()` is expected to
     wipe, with `kbApply`/`kbClear`/`kbRows` re-deriving it from the DOM each time.
   - `initStickyHeader`, accent-color `style.setProperty`, marquee sizing, and the
     album-art fallback all reach back into the DOM imperatively after the string is in.

3. **65 manual `esc()` calls are a standing XSS liability.** Every interpolated value is
   protected only if a human remembered to wrap it. One missed `esc()` on a task name is
   an injection. lit-html escapes by construction — that entire class of bug disappears.

4. **`render.js` is 2,362 lines and can't be split cleanly**, because a "component" here
   is just a helper that returns a string, with no encapsulated state or lifecycle. The
   `taskRow` builder (lines 260–323) is a 60-line string template with logic threaded
   through it; there's no natural seam to lift it out as an independently testable unit.

None of these are lit-html's fault — they're the cost of only using it in 10 of 31
render sites. They're also **not React-specific problems.** They're "we don't diff"
problems.

## What a framework would and wouldn't buy you

Would buy you: diffing (keep focus/scroll/selection across renders → delete the bypass
hacks), escape-by-construction (delete 65 `esc()` calls), component encapsulation
(split `render.js`), and local component state (kill the transient-class + module-var
juggling).

Would **not** buy you: a new state model. You already have the good part — a single
state atom in `state.js`, mutated only through `dispatchAction`, followed by `render()`.
That's the unidirectional loop React is famous for, and it's fine. React would make you
rewrite the view layer to get back to an architecture you already have.

## Recommendation: finish the lit-html migration, don't switch to React

You shipped `lit-html`. Use it for all 31 sites instead of 10. This is incremental —
convert one `innerHTML =` site at a time, each conversion is independently shippable,
and every conversion lets you delete a bypass hack rather than add framework ceremony.

### Proposed component seams for `render.js`

Break the file along the render functions that already exist, converting each from
`innerHTML =` to a `litRender` (or a Lit `LitElement` if you want encapsulated state):

```
render()                     → orchestrator (stays)
  renderTopbar               → <tp-topbar>      (search input keeps its own DOM → kills the performSearch bypass)
  renderPinnedNav            → <tp-pinned-nav>
  renderSidebar              → <tp-sidebar>     (list rows; kb-focus becomes real focus state)
  renderMain                 → <tp-task-list>
    taskRow (260–323)        → <tp-task-row>    (the big win: isolated, testable, escape-safe)
  renderPlayer / NowPlaying  → already lit-html — the model to copy
  modals (detail/lyrics/trk) → <tp-modal>       (each currently an innerHTML site)
```

### Before / after: `taskRow`

Today (raw string + manual escaping, lines 313–322, abridged):

```js
return `<tr class="${active ? "playing" : ""}" data-drag-id="${task.id}" ...>
  <td class="tname">${esc(task.name)}${jewelHtml}</td>
  <td class="menu-cell"><button data-action="openRowMenu" data-id="${task.id}">⋯</button></td>
</tr>`;
```

With lit-html (escape-by-construction, real event binding, no `data-action` string-matching):

```js
return html`<tr class=${active ? "playing" : ""} data-drag-id=${task.id} ...>
  <td class="tname">${task.name}${jewelPart}</td>
  <td class="menu-cell"><button @click=${() => dispatch("openRowMenu", { id: task.id })}>⋯</button></td>
</tr>`;
```

`task.name` is auto-escaped. The click handler is bound to the node and survives
re-renders, so it no longer needs the delegated `data-action` bus. Focus and scroll on
the surrounding list are preserved because lit-html patches only what changed.

## When React _would_ actually be the answer

Reassess if any of these become true — none are today:
- The app grows well past its current ~5k frontend lines and you want an off-the-shelf
  component/library ecosystem rather than hand-building.
- You bring on contributors for whom a bespoke setup is a real onboarding tax vs. a
  standard one.
- You hit routing/data-fetching complexity that a framework's ecosystem solves and Lit
  doesn't.

For a solo-ish, single-view Tauri desktop app, none of that outweighs the cost of a
full view-layer rewrite plus a heavier bundle and build step.

## Migration order (low-risk first)

1. `taskRow` → `litRender`. Highest churn surface, biggest `esc()` payoff, self-contained.
2. The three modals (detail / lyrics / track) — each is one `innerHTML` site.
3. `renderSidebar` — converting this lets `kb-focus` become real component state.
4. `renderTopbar` — converting the search input kills the `performSearch` bypass hack.
5. `renderMain` wrapper + `renderPinnedNav`.

Each step is shippable on its own and removes more code than it adds.
