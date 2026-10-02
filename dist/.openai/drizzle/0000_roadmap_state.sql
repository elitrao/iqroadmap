CREATE TABLE IF NOT EXISTS roadmap_state (
  id INTEGER PRIMARY KEY CHECK (id IN (1, 2)),
  data TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL
);
