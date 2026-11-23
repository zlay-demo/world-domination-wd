PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS players (
  telegram_id TEXT PRIMARY KEY,
  username TEXT,
  first_name TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS rooms (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  host_id TEXT NOT NULL,
  epoch_id TEXT NOT NULL DEFAULT 'ww2_1936',
  scenario_id TEXT NOT NULL DEFAULT 'historical',
  max_players INTEGER NOT NULL DEFAULT 8,
  status TEXT NOT NULL DEFAULT 'lobby',
  game_speed TEXT NOT NULL DEFAULT 'normal',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(host_id) REFERENCES players(telegram_id)
);

CREATE TABLE IF NOT EXISTS room_players (
  room_id TEXT NOT NULL,
  telegram_id TEXT NOT NULL,
  country_id TEXT,
  is_ready INTEGER NOT NULL DEFAULT 0,
  role TEXT NOT NULL DEFAULT 'player',
  joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(room_id, telegram_id),
  FOREIGN KEY(room_id) REFERENCES rooms(id) ON DELETE CASCADE,
  FOREIGN KEY(telegram_id) REFERENCES players(telegram_id)
);

CREATE TABLE IF NOT EXISTS room_state (
  room_id TEXT PRIMARY KEY,
  day INTEGER NOT NULL DEFAULT 1,
  month INTEGER NOT NULL DEFAULT 1,
  year INTEGER NOT NULL DEFAULT 1936,
  tick INTEGER NOT NULL DEFAULT 0,
  state_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(room_id) REFERENCES rooms(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS country_state (
  room_id TEXT NOT NULL,
  country_id TEXT NOT NULL,
  owner_player_id TEXT,
  political_power INTEGER NOT NULL DEFAULT 50,
  stability INTEGER NOT NULL DEFAULT 70,
  civilian_factories INTEGER NOT NULL DEFAULT 10,
  military_factories INTEGER NOT NULL DEFAULT 8,
  dockyards INTEGER NOT NULL DEFAULT 2,
  manpower INTEGER NOT NULL DEFAULT 250000,
  equipment INTEGER NOT NULL DEFAULT 120,
  ideology TEXT NOT NULL DEFAULT 'neutral',
  focus_id TEXT NOT NULL DEFAULT 'industrial_effort',
  focus_progress INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(room_id, country_id),
  FOREIGN KEY(room_id) REFERENCES rooms(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS room_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(room_id) REFERENCES rooms(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_rooms_status ON rooms(status);
CREATE INDEX IF NOT EXISTS idx_room_players_player ON room_players(telegram_id);
CREATE INDEX IF NOT EXISTS idx_room_events_room ON room_events(room_id, id);


-- Демократическое изменение настроек комнаты до старта кампании
CREATE TABLE IF NOT EXISTS room_setting_proposals (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  proposer_id TEXT NOT NULL,
  epoch_id TEXT,
  scenario_id TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(room_id) REFERENCES rooms(id) ON DELETE CASCADE,
  FOREIGN KEY(proposer_id) REFERENCES players(telegram_id)
);

CREATE TABLE IF NOT EXISTS room_setting_votes (
  proposal_id TEXT NOT NULL,
  telegram_id TEXT NOT NULL,
  vote INTEGER NOT NULL CHECK(vote IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(proposal_id, telegram_id),
  FOREIGN KEY(proposal_id) REFERENCES room_setting_proposals(id) ON DELETE CASCADE,
  FOREIGN KEY(telegram_id) REFERENCES players(telegram_id)
);

CREATE INDEX IF NOT EXISTS idx_setting_proposals_room ON room_setting_proposals(room_id, status);
