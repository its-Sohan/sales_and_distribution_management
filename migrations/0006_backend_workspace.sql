-- Backend-owned drafts and optimistic concurrency for all workspace writes.
CREATE TABLE app_revision (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  revision INTEGER NOT NULL CHECK (revision >= 0)
);
INSERT INTO app_revision (id, revision) VALUES (1, 0);

CREATE TABLE terminal_drafts (
  terminal_id INTEGER PRIMARY KEY CHECK (terminal_id BETWEEN 1 AND 999),
  draft_json TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
