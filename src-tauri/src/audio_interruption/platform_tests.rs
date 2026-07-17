use super::platform::scan;

#[test]
fn process_activity_probe_works_when_the_host_supports_it() {
    let version = std::process::Command::new("/usr/bin/sw_vers")
        .args(["-productVersion"])
        .output()
        .ok()
        .and_then(|output| String::from_utf8(output.stdout).ok())
        .unwrap_or_default();
    let mut parts = version.trim().split('.');
    let supported = parts
        .next()
        .and_then(|part| part.parse::<u32>().ok())
        .zip(parts.next().and_then(|part| part.parse::<u32>().ok()))
        .is_some_and(|(major, minor)| major > 14 || (major == 14 && minor >= 2));
    if supported {
        assert!(scan(false).is_ok());
    }
}
