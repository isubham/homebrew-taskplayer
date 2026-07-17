use super::{AudioActivity, AudioInterruptionKind};

#[cfg(target_os = "macos")]
mod macos {
    use super::super::core_audio::*;
    use super::{AudioActivity, AudioInterruptionKind};
    use crate::constants::{APPLE_MUSIC_BUNDLE_ID, SPOTIFY_BUNDLE_ID};
    use std::ffi::{c_char, c_void, CStr};

    #[link(name = "CoreFoundation", kind = "framework")]
    extern "C" {
        fn CFStringGetCString(
            value: *const c_void,
            buffer: *mut c_char,
            buffer_size: isize,
            encoding: u32,
        ) -> u8;
        fn CFRelease(value: *const c_void);
    }

    const CF_STRING_UTF8: u32 = 0x0800_0100;
    const BUNDLE_ID_BUFFER_SIZE: usize = 256;

    unsafe fn bundle_id(object: AudioObjectId) -> Option<String> {
        let value = object_pointer(object, PROCESS_BUNDLE_ID).ok()?;
        let mut buffer = [0_i8; BUNDLE_ID_BUFFER_SIZE];
        let converted = CFStringGetCString(
            value,
            buffer.as_mut_ptr(),
            buffer.len() as isize,
            CF_STRING_UTF8,
        ) != 0;
        CFRelease(value);
        converted.then(|| {
            CStr::from_ptr(buffer.as_ptr())
                .to_string_lossy()
                .into_owned()
        })
    }

    pub(crate) fn scan(music_playing: bool) -> Result<AudioActivity, OsStatus> {
        let own_pid = std::process::id();
        let mut external_input = false;
        let mut external_output_count = 0_u32;
        let mut own_output = false;
        let mut apple_music_output = false;
        let mut spotify_output = false;
        let mut supported_output_count = 0_u32;
        for process in unsafe { process_ids()? } {
            let pid = unsafe { scalar(process, PROCESS_PID) }.unwrap_or_default();
            let input = unsafe { scalar(process, RUNNING_INPUT) }.unwrap_or_default() != 0;
            let output = unsafe { scalar(process, RUNNING_OUTPUT) }.unwrap_or_default() != 0;
            if pid == own_pid {
                own_output |= output;
            } else {
                external_input |= input;
                external_output_count += u32::from(output);
                if output {
                    match unsafe { bundle_id(process) }.as_deref() {
                        Some(APPLE_MUSIC_BUNDLE_ID) => {
                            apple_music_output = true;
                            supported_output_count += 1;
                        }
                        Some(SPOTIFY_BUNDLE_ID) => {
                            spotify_output = true;
                            supported_output_count += 1;
                        }
                        _ => {}
                    }
                }
            }
        }
        let assumed_webview_outputs = u32::from(music_playing && !own_output);
        let kind = if external_input {
            AudioInterruptionKind::Meeting
        } else if external_output_count > assumed_webview_outputs {
            AudioInterruptionKind::Media
        } else {
            AudioInterruptionKind::None
        };
        Ok(AudioActivity {
            kind,
            apple_music_output,
            spotify_output,
            unsupported_output: external_output_count
                > assumed_webview_outputs + supported_output_count,
        })
    }
}

#[cfg(target_os = "macos")]
pub(super) use macos::scan;

#[cfg(not(target_os = "macos"))]
pub(super) fn scan(_: bool) -> Result<AudioActivity, i32> {
    Err(-1)
}
