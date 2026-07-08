//! Game Server Ping Tester (read-only).
//!
//! Pings a curated set of per-region reference nodes (see
//! resources/game_servers.json) using the same unelevated ICMP echo as the live
//! network monitor. Every value is a real round-trip time; an unreachable host
//! reports null (never a fabricated number). This measures latency only — it
//! changes nothing on the PC.

use std::net::ToSocketAddrs;

use serde::{Deserialize, Serialize};

use super::network_monitor::ping_ipv4;

// The server list is bundled at compile time — a data file, never hardcoded in
// the React bundle. Edit resources/game_servers.json to add games/regions.
const GAME_SERVERS_JSON: &str = include_str!("../../resources/game_servers.json");

#[derive(Deserialize)]
struct ServerDb {
    games: Vec<GameServersDef>,
}

#[derive(Deserialize)]
struct GameServersDef {
    id: String,
    name: String,
    #[serde(rename = "appId", default)]
    app_id: Option<String>,
    regions: Vec<RegionDef>,
}

#[derive(Deserialize, Clone)]
struct RegionDef {
    region: String,
    host: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RegionPing {
    pub region: String,
    pub host: String,
    /// Round-trip milliseconds, or null if the host didn't answer in time.
    pub ping_ms: Option<u32>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GameServersResult {
    pub id: String,
    pub name: String,
    pub app_id: Option<String>,
    pub regions: Vec<RegionPing>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GameCatalogEntry {
    pub id: String,
    pub name: String,
    pub app_id: Option<String>,
}

/// The list of games we can ping (id/name/art), without pinging anything — used
/// to render the Ping Optimizer grid instantly. Read-only.
#[tauri::command]
pub fn list_game_catalog() -> Vec<GameCatalogEntry> {
    serde_json::from_str::<ServerDb>(GAME_SERVERS_JSON)
        .map(|db| {
            db.games
                .into_iter()
                .map(|g| GameCatalogEntry {
                    id: g.id,
                    name: g.name,
                    app_id: g.app_id,
                })
                .collect()
        })
        .unwrap_or_default()
}

/// Resolve a hostname (or parse an IP literal) to its first IPv4, then ICMP it.
fn resolve_and_ping(host: &str) -> Option<u32> {
    let v4 = (host, 0u16)
        .to_socket_addrs()
        .ok()?
        .find_map(|s| match s.ip() {
            std::net::IpAddr::V4(v4) => Some(v4),
            std::net::IpAddr::V6(_) => None,
        })?;
    ping_ipv4(v4.octets(), 1500)
}

/// Ping every region concurrently and return grouped results. Pass `game_id` to
/// ping just one game (used by the Ping Optimizer), or None for all (the tester).
/// Read-only; called only when the user opens/refreshes it.
#[tauri::command]
pub async fn ping_game_servers(game_id: Option<String>) -> Result<Vec<GameServersResult>, String> {
    let db: ServerDb =
        serde_json::from_str(GAME_SERVERS_JSON).map_err(|e| format!("bad server list: {e}"))?;

    let selected: Vec<&GameServersDef> = match &game_id {
        Some(id) => db.games.iter().filter(|g| &g.id == id).collect(),
        None => db.games.iter().collect(),
    };

    // Fan out one blocking ICMP task per (game, region) so all pings run at once.
    struct Pending {
        game_idx: usize,
        region: String,
        host: String,
        handle: tokio::task::JoinHandle<Option<u32>>,
    }

    let mut pending: Vec<Pending> = Vec::new();
    let mut games: Vec<GameServersResult> = Vec::with_capacity(selected.len());
    for (gi, g) in selected.iter().enumerate() {
        games.push(GameServersResult {
            id: g.id.clone(),
            name: g.name.clone(),
            app_id: g.app_id.clone(),
            regions: Vec::with_capacity(g.regions.len()),
        });
        for r in &g.regions {
            let host = r.host.clone();
            pending.push(Pending {
                game_idx: gi,
                region: r.region.clone(),
                host: host.clone(),
                handle: tokio::task::spawn_blocking(move || resolve_and_ping(&host)),
            });
        }
    }

    for p in pending {
        let ping_ms = p.handle.await.unwrap_or(None);
        games[p.game_idx].regions.push(RegionPing {
            region: p.region,
            host: p.host,
            ping_ms,
        });
    }

    Ok(games)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bundled_server_list_parses_and_is_populated() {
        let db: ServerDb =
            serde_json::from_str(GAME_SERVERS_JSON).expect("bundled server list must parse");
        assert!(db.games.len() >= 6, "expected at least 6 games");
        for g in &db.games {
            assert!(!g.regions.is_empty(), "game {} has no regions", g.id);
            for r in &g.regions {
                assert!(!r.host.is_empty(), "empty host in {}", g.id);
                assert!(!r.region.is_empty(), "empty region label in {}", g.id);
            }
        }
    }
}
