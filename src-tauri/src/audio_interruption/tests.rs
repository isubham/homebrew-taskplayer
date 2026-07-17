use super::*;
use std::time::Duration;

#[test]
fn interruption_pauses_on_first_detected_signal_and_delays_release() {
    let start = Instant::now();
    let mut policy = InterruptionDebouncer::new(start);
    assert_eq!(
        policy.update(AudioInterruptionKind::Media, start),
        Some(AudioInterruptionKind::Media)
    );
    assert_eq!(
        policy.update(AudioInterruptionKind::None, start + Duration::from_secs(1)),
        None
    );
    assert_eq!(
        policy.update(
            AudioInterruptionKind::None,
            start + Duration::from_secs(1) + AUDIO_INTERRUPTION_RELEASE_DELAY
        ),
        Some(AudioInterruptionKind::None)
    );
}

#[test]
fn meeting_supersedes_media_on_first_detected_signal() {
    let start = Instant::now();
    let mut policy = InterruptionDebouncer::new(start);
    policy.update(AudioInterruptionKind::Media, start);
    assert_eq!(
        policy.update(
            AudioInterruptionKind::Meeting,
            start + Duration::from_secs(1)
        ),
        Some(AudioInterruptionKind::Meeting)
    );
}
