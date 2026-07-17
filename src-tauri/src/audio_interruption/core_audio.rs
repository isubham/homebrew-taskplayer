use std::ffi::c_void;

pub(super) type AudioObjectId = u32;
pub(super) type OsStatus = i32;
pub(super) const SYSTEM_OBJECT: AudioObjectId = 1;
pub(super) const PROCESS_LIST: u32 = fourcc(*b"prs#");
pub(super) const PROCESS_PID: u32 = fourcc(*b"ppid");
pub(super) const PROCESS_BUNDLE_ID: u32 = fourcc(*b"pbid");
pub(super) const RUNNING_INPUT: u32 = fourcc(*b"piri");
pub(super) const RUNNING_OUTPUT: u32 = fourcc(*b"piro");
const GLOBAL_SCOPE: u32 = fourcc(*b"glob");
const MAIN_ELEMENT: u32 = 0;

#[repr(C)]
#[derive(Clone, Copy)]
pub(super) struct PropertyAddress {
    pub(super) selector: u32,
    scope: u32,
    element: u32,
}

#[link(name = "CoreAudio", kind = "framework")]
extern "C" {
    fn AudioObjectGetPropertyDataSize(
        object: AudioObjectId,
        address: *const PropertyAddress,
        qualifier_size: u32,
        qualifier: *const c_void,
        size: *mut u32,
    ) -> OsStatus;
    fn AudioObjectGetPropertyData(
        object: AudioObjectId,
        address: *const PropertyAddress,
        qualifier_size: u32,
        qualifier: *const c_void,
        size: *mut u32,
        data: *mut c_void,
    ) -> OsStatus;
}

const fn fourcc(bytes: [u8; 4]) -> u32 {
    u32::from_be_bytes(bytes)
}

pub(super) fn address(selector: u32) -> PropertyAddress {
    PropertyAddress {
        selector,
        scope: GLOBAL_SCOPE,
        element: MAIN_ELEMENT,
    }
}

pub(super) unsafe fn scalar(object: AudioObjectId, selector: u32) -> Result<u32, OsStatus> {
    let mut value = 0_u32;
    let mut size = std::mem::size_of::<u32>() as u32;
    let status = AudioObjectGetPropertyData(
        object,
        &address(selector),
        0,
        std::ptr::null(),
        &mut size,
        (&mut value as *mut u32).cast(),
    );
    (status == 0).then_some(value).ok_or(status)
}

pub(super) unsafe fn object_pointer(
    object: AudioObjectId,
    selector: u32,
) -> Result<*const c_void, OsStatus> {
    let mut value: *const c_void = std::ptr::null();
    let mut size = std::mem::size_of::<*const c_void>() as u32;
    let status = AudioObjectGetPropertyData(
        object,
        &address(selector),
        0,
        std::ptr::null(),
        &mut size,
        (&mut value as *mut *const c_void).cast(),
    );
    (status == 0 && !value.is_null())
        .then_some(value)
        .ok_or(status)
}

pub(super) unsafe fn process_ids() -> Result<Vec<AudioObjectId>, OsStatus> {
    let property = address(PROCESS_LIST);
    let mut size = 0_u32;
    let status =
        AudioObjectGetPropertyDataSize(SYSTEM_OBJECT, &property, 0, std::ptr::null(), &mut size);
    if status != 0 {
        return Err(status);
    }
    let mut ids = vec![0; size as usize / std::mem::size_of::<AudioObjectId>()];
    let status = AudioObjectGetPropertyData(
        SYSTEM_OBJECT,
        &property,
        0,
        std::ptr::null(),
        &mut size,
        ids.as_mut_ptr().cast(),
    );
    (status == 0).then_some(ids).ok_or(status)
}
