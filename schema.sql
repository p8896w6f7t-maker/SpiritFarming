CREATE TABLE IF NOT EXISTS player_profiles (
  id TEXT PRIMARY KEY,
  nickname VARCHAR(12) NOT NULL,
  outfit_color VARCHAR(20) NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS game_saves (
  player_id TEXT NOT NULL,
  slot INTEGER NOT NULL,
  save_data JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (player_id, slot)
);
