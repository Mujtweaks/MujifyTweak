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
    GetAdaptersInfo, GetNetworkParams, IcmpCreateFile, IcmpSendEcho, FIXED_INFO_W2KSP1,
    ICMP_ECHO_REPLY, IP_ADAPTER_INFO,
};

// GetAdaptersInfo / GetNetworkParams return a WIN32 error code as u32; 0 = success.
const WIN32_OK: u32 = 0;

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

/// Read-only adapter details for the Network page: adapter model, IP, gateway,
/// DNS, and link type. Uses GetAdaptersInfo/GetNetworkParams which hand back
/// pre-formatted IP strings (no sockaddr parsing). Nothing is changed.
#[derive(Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct NetworkInfo {
    pub adapter_name: Option<String>,
    pub ip_address: Option<String>,
    pub gateway: Option<String>,
    pub dns_server: Option<String>,
    pub connection_type: Option<String>,
}

unsafe fn ansi_arr(ptr: *const u8) -> Option<String> {
    if ptr.is_null() {
        return None;
    }
    let s = std::ffi::CStr::from_ptr(ptr as *const std::ffi::c_char)
        .to_string_lossy()
        .trim()
        .to_string();
    if s.is_empty() || s == "0.0.0.0" {
        None
    } else {
        Some(s)
    }
}

#[tauri::command]
pub fn get_network_info() -> NetworkInfo {
    let mut info = NetworkInfo::default();
    unsafe {
        // Adapters — pick the one that has a real default gateway (the active link).
        let mut size: u32 = 0;
        let _ = GetAdaptersInfo(None, &mut size);
        if size > 0 {
            let mut buf = vec![0u8; size as usize];
            let head = buf.as_mut_ptr() as *mut IP_ADAPTER_INFO;
            if GetAdaptersInfo(Some(head), &mut size) == WIN32_OK {
                let mut cur = head;
                while !cur.is_null() {
                    let a = &*cur;
                    let gw = ansi_arr(a.GatewayList.IpAddress.String.as_ptr() as *const u8);
                    if gw.is_some() {
                        info.gateway = gw;
                        info.ip_address =
                            ansi_arr(a.IpAddressList.IpAddress.String.as_ptr() as *const u8);
                        info.adapter_name = ansi_arr(a.Description.as_ptr() as *const u8);
                        info.connection_type = Some(match a.Type {
                            71 => "Wi-Fi".into(),
                            6 => "Wired".into(),
                            _ => "Other".into(),
                        });
                        break;
                    }
                    cur = a.Next;
                }
            }
        }
        // DNS server via GetNetworkParams.
        let mut size2: u32 = 0;
        let _ = GetNetworkParams(None, &mut size2);
        if size2 > 0 {
            let mut buf2 = vec![0u8; size2 as usize];
            let fp = buf2.as_mut_ptr() as *mut FIXED_INFO_W2KSP1;
            if GetNetworkParams(Some(fp), &mut size2).0 == WIN32_OK {
                let f = &*fp;
                info.dns_server = ansi_arr(f.DnsServerList.IpAddress.String.as_ptr() as *const u8);
            }
        }
    }
    info
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
