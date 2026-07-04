//! Checkpoint 7 — NetworkMonitor.
//!
//! Real ICMP echo to 1.1.1.1 (via the Windows IpHelper `IcmpSendEcho`, which
//! works unelevated), plus jitter/packet-loss over a rolling 20-sample window
//! and live throughput from `sysinfo` network byte deltas. Emits `network_stats`
//! every 2 seconds. Any probe failure degrades to `null`, never a fake ping.

use std::collections::VecDeque;
use std::thread;
use std::time::Duration;

use serde::Serialize;
use sysinfo::Networks;
use tauri::{AppHandle, Emitter};

use windows::Win32::Foundation::CloseHandle;
use windows::Win32::NetworkManagement::IpHelper::{
    IcmpCreateFile, IcmpSendEcho, ICMP_ECHO_REPLY,
};

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct NetworkStats {
    pub ping_ms: Option<f32>,
    pub jitter_ms: Option<f32>,
    pub packet_loss_percent: f32,
    pub down_mbps: Option<f32>,
    pub up_mbps: Option<f32>,
}

/// One ICMP echo to `1.1.1.1`. Returns round-trip ms, or None on timeout/failure.
fn ping_once() -> Option<f32> {
    unsafe {
        let handle = IcmpCreateFile().ok()?;
        if handle.is_invalid() {
            return None;
        }

        // 1.1.1.1 in network byte order (little-endian u32 = 1.1.1.1).
        let dest: u32 = u32::from_ne_bytes([1, 1, 1, 1]);
        let send_data = [0u8; 32];
        // Reply buffer: one ICMP_ECHO_REPLY + data + slack, per API guidance.
        let reply_size = std::mem::size_of::<ICMP_ECHO_REPLY>() + send_data.len() + 8;
        let mut reply_buf = vec![0u8; reply_size];

        let ret = IcmpSendEcho(
            handle,
            dest,
            send_data.as_ptr() as *const _,
            send_data.len() as u16,
            None,
            reply_buf.as_mut_ptr() as *mut _,
            reply_size as u32,
            1000, // 1s timeout
        );

        let result = if ret > 0 {
            let reply = &*(reply_buf.as_ptr() as *const ICMP_ECHO_REPLY);
            if reply.Status == 0 {
                Some(reply.RoundTripTime as f32)
            } else {
                None
            }
        } else {
            None
        };

        let _ = CloseHandle(handle);
        result
    }
}

fn stddev(samples: &[f32]) -> f32 {
    if samples.len() < 2 {
        return 0.0;
    }
    let mean = samples.iter().sum::<f32>() / samples.len() as f32;
    let var = samples.iter().map(|v| (v - mean).powi(2)).sum::<f32>() / samples.len() as f32;
    var.sqrt()
}

pub fn start(app: AppHandle) {
    thread::spawn(move || {
        let mut window: VecDeque<Option<f32>> = VecDeque::with_capacity(20);
        let mut networks = Networks::new_with_refreshed_list();
        // Prime a baseline so the first delta is meaningful.
        thread::sleep(Duration::from_millis(500));

        loop {
            let ping = ping_once();
            if window.len() == 20 {
                window.pop_front();
            }
            window.push_back(ping);

            let successes: Vec<f32> = window.iter().filter_map(|p| *p).collect();
            let loss = if window.is_empty() {
                0.0
            } else {
                let failed = window.iter().filter(|p| p.is_none()).count();
                (failed as f32 / window.len() as f32) * 100.0
            };
            let jitter = if successes.len() >= 2 {
                Some(stddev(&successes))
            } else {
                None
            };

            // Throughput — bytes since last refresh, over the ~2s interval.
            networks.refresh(true);
            let mut down_bytes = 0u64;
            let mut up_bytes = 0u64;
            for (_iface, data) in networks.iter() {
                down_bytes += data.received();
                up_bytes += data.transmitted();
            }
            let interval_s = 2.0;
            let down_mbps = Some((down_bytes as f32 * 8.0) / 1_000_000.0 / interval_s);
            let up_mbps = Some((up_bytes as f32 * 8.0) / 1_000_000.0 / interval_s);

            let stats = NetworkStats {
                ping_ms: ping,
                jitter_ms: jitter,
                packet_loss_percent: loss,
                down_mbps,
                up_mbps,
            };
            let _ = app.emit("network_stats", &stats);

            thread::sleep(Duration::from_millis(1500));
        }
    });
}
