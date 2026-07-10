//! Curated known-games table: lowercase exe stem → display name. Seed set of
//! popular titles; GameDetector matches running processes and scanned libraries
//! against it. Grows over time; unknown games can still be added manually.

pub const KNOWN_GAMES: &[(&str, &str)] = &[
    ("cs2", "Counter-Strike 2"),
    ("csgo", "Counter-Strike: GO"),
    ("valorant", "VALORANT"),
    ("valorant-win64-shipping", "VALORANT"),
    ("r5apex", "Apex Legends"),
    ("fortniteclient-win64-shipping", "Fortnite"),
    ("gta5", "Grand Theft Auto V"),
    ("gta5_enhanced", "Grand Theft Auto V"),
    ("rainbowsix", "Rainbow Six Siege"),
    ("rainbowsix_vulkan", "Rainbow Six Siege"),
    ("cyberpunk2077", "Cyberpunk 2077"),
    ("eldenring", "Elden Ring"),
    ("witcher3", "The Witcher 3"),
    ("re8", "Resident Evil Village"),
    ("bg3", "Baldur's Gate 3"),
    ("bg3_dx11", "Baldur's Gate 3"),
    ("dota2", "Dota 2"),
    ("leagueoflegends", "League of Legends"),
    ("league of legends", "League of Legends"),
    ("overwatch", "Overwatch 2"),
    ("modernwarfare", "Call of Duty: MW"),
    ("cod", "Call of Duty"),
    ("bf2042", "Battlefield 2042"),
    ("destiny2", "Destiny 2"),
    ("palworld-win64-shipping", "Palworld"),
    ("helldivers2", "Helldivers 2"),
    ("marvelrivals", "Marvel Rivals"),
    ("marvel-win64-shipping", "Marvel Rivals"),
    ("thefinals", "The Finals"),
    ("discovery", "The Finals"),
    ("starfield", "Starfield"),
    ("hogwartslegacy", "Hogwarts Legacy"),
    ("minecraft", "Minecraft"),
    ("javaw", "Minecraft (Java)"),
    ("rocketleague", "Rocket League"),
    ("deltaforce", "Delta Force"),
    ("pubg", "PUBG: Battlegrounds"),
    ("tslgame", "PUBG: Battlegrounds"),
    // Battle.net
    ("wow", "World of Warcraft"),
    ("wowclassic", "World of Warcraft Classic"),
    ("diablo iv", "Diablo IV"),
    ("hearthstone", "Hearthstone"),
    ("heroesofthestorm_x64", "Heroes of the Storm"),
    // Rockstar / Take-Two
    ("rdr2", "Red Dead Redemption 2"),
    ("gta6", "Grand Theft Auto VI"),
    // EA
    ("eafc24", "EA Sports FC 24"),
    ("eafc25", "EA Sports FC 25"),
    ("starwarsjedisurvivor", "Star Wars Jedi: Survivor"),
    // Amazon Games
    ("newworld", "New World"),
    ("lostark", "Lost Ark"),
];

/// Match a lowercased exe stem (no ".exe") to a display name.
pub fn lookup(stem: &str) -> Option<&'static str> {
    KNOWN_GAMES
        .iter()
        .find(|(exe, _)| *exe == stem)
        .map(|(_, name)| *name)
}
