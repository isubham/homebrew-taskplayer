# 0010 — Use hybrid local and Audius sourcing for focus vibes

- Status: Accepted
- Date: 2026-07-17
- Owners: Jarvis
- Related: [`../features.md`](../features.md), [`../../CHANGELOG.md`](../../CHANGELOG.md)

## Context

TaskPlayer originally treated every player option as one Audius genre. The desired focus sounds
include both real catalog genres and concepts such as white noise, nature, coffee-house ambience,
singing bowls, and game soundtracks. Audius has broad genre, mood, BPM, tag, and search metadata,
but most of these concepts are not official genres and raw text searches return unrelated songs.
Continuous white noise also does not need a remote catalog or track changes.

Research does not support one universal ADHD soundtrack. Noise or music can help some people and
tasks while distracting others, so the app must present these as optional vibes rather than a
treatment claim or an automatic judgment about what a user needs.

## Decision

- Keep one compact vibe selector at the point of playback.
- Generate white noise locally as a continuous, predictable loop.
- Use Audius official genre feeds for real genres and focused search only for concepts that need
  it, with explicit genre and keyword filters.
- Build each vibe from centralized source and mood configuration rather than branching fetch logic
  throughout the player.
- Reject unavailable, gated, deleted, and very short catalog tracks; deduplicate and rank remaining
  candidates deterministically by preferred mood and catalog play count.
- Remember the last selected vibe, without storing performance judgments or failure history.

## ADHD and gamification check

The selector lives in the bottom player where listening happens, satisfying point of performance.
Eight bounded choices keep the interaction glanceable. Audio preferences are user-controlled and
remembered rather than inferred. This is not a reward mechanic and uses no scarcity, loss framing,
variable reward, shame tally, or engagement-only incentive.

## Alternatives considered

- Treat every option as an Audius genre — unavailable for noise and most nature/setting concepts.
- Use raw Audius text search for every vibe — live results contain semantically unrelated tracks.
- Stream white-noise tracks from Audius — introduces network dependence, mislabeled songs, track
  transitions, and inconsistent loudness for a sound that can be generated locally.
- Add a separate selector for every sound — creates a longer, more deliberative choice surface.

## Consequences

- Noise remains available offline and does not unexpectedly change tracks.
- Audius-backed queues better match their visible labels but still depend on creator metadata.
- Nature subtypes and singing bowls stay grouped into broader vibes to keep the player compact.
- The generated noise is a focus preference, not medical advice, and no option is presented as
  universally appropriate for ADHD.
