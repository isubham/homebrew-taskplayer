// Supabase project config for Google Sign-In + cross-device sync.
//
// Both of these are safe to commit — the publishable key is designed to be
// embedded in distributed client apps (Row Level Security, not key secrecy,
// is what protects data). Never put the `service_role`/secret key or the
// database password here.

/// e.g. "https://abcdefghijklmnop.supabase.co" (no trailing slash)
pub const SUPABASE_URL: &str = "https://lxlpmodrzcsdshqearfb.supabase.co";

/// Project Settings → API Keys → "publishable" (starts with sb_publishable_)
pub const SUPABASE_PUBLISHABLE_KEY: &str = "sb_publishable_1I3cIfaDkHz_IkbHQFydEA_Lt2fMGhO";
