//! Thin, crash-proof helpers over the `wmi` crate (0.18 API).
//!
//! wmi 0.18 manages COM per-thread internally, so we just build a
//! `WMIConnection` where needed (reused across a monitor thread's tick, or
//! created per-call in a Tauri command). Every value comes back as a `Variant`
//! — CIM uint64 arrives as a *string*, and perf counters vary between
//! UI4/UI8/R8/String — so we query into `HashMap<String, Variant>` and pull
//! fields through these lenient extractors. A missing/odd field yields `None`,
//! never a panic. "Never fake, but never fall over."

use std::collections::HashMap;
use wmi::{Variant, WMIConnection};

pub type Row = HashMap<String, Variant>;

/// A connection in ROOT\CIMV2. `None` if COM/WMI init fails.
pub fn connect() -> Option<WMIConnection> {
    WMIConnection::new().ok()
}

/// Run a WQL query on an existing connection. Empty vec on failure.
pub fn query(conn: &WMIConnection, wql: &str) -> Vec<Row> {
    conn.raw_query(wql).unwrap_or_default()
}

/// One-shot query in a custom namespace (creates its own short-lived connection).
pub fn query_ns(namespace: &str, wql: &str) -> Vec<Row> {
    match WMIConnection::with_namespace_path(namespace) {
        Ok(conn) => conn.raw_query(wql).unwrap_or_default(),
        Err(_) => Vec::new(),
    }
}

pub fn get_string(row: &Row, key: &str) -> Option<String> {
    match row.get(key)? {
        Variant::String(s) => {
            let t = s.trim();
            if t.is_empty() {
                None
            } else {
                Some(t.to_string())
            }
        }
        other => variant_to_f64(other).map(|n| n.to_string()),
    }
}

pub fn get_f64(row: &Row, key: &str) -> Option<f64> {
    variant_to_f64(row.get(key)?)
}

pub fn get_u64(row: &Row, key: &str) -> Option<u64> {
    get_f64(row, key).map(|f| f as u64)
}

/// Coerce any numeric-ish Variant (including stringified uint64) to f64.
pub fn variant_to_f64(v: &Variant) -> Option<f64> {
    match v {
        Variant::UI1(n) => Some(*n as f64),
        Variant::UI2(n) => Some(*n as f64),
        Variant::UI4(n) => Some(*n as f64),
        Variant::UI8(n) => Some(*n as f64),
        Variant::I1(n) => Some(*n as f64),
        Variant::I2(n) => Some(*n as f64),
        Variant::I4(n) => Some(*n as f64),
        Variant::I8(n) => Some(*n as f64),
        Variant::R4(n) => Some(*n as f64),
        Variant::R8(n) => Some(*n),
        Variant::String(s) => s.trim().parse::<f64>().ok(),
        _ => None,
    }
}

/// Pull a `Vec<u16>` out of a Variant array (e.g. ChassisTypes). Best-effort.
pub fn get_u16_array(row: &Row, key: &str) -> Vec<u16> {
    match row.get(key) {
        Some(Variant::Array(items)) => items
            .iter()
            .filter_map(variant_to_f64)
            .map(|f| f as u16)
            .collect(),
        _ => Vec::new(),
    }
}
