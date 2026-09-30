CREATE TABLE post_groups (
  id TEXT PRIMARY KEY CHECK (length(id) = 36),
  slug TEXT NOT NULL COLLATE BINARY CHECK (
    length(slug) BETWEEN 1 AND 120
    AND slug NOT GLOB '*[^a-z0-9-]*'
    AND slug NOT LIKE '-%'
    AND slug NOT LIKE '%-'
    AND slug NOT LIKE '%--%'
  ),
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 80),
  description TEXT NOT NULL DEFAULT '' CHECK (length(description) <= 240),
  created_at TEXT NOT NULL CHECK (created_at GLOB '????-??-??T??:??:??.???Z'),
  updated_at TEXT NOT NULL CHECK (updated_at GLOB '????-??-??T??:??:??.???Z'),
  CHECK (updated_at >= created_at),
  UNIQUE (slug)
);

ALTER TABLE posts ADD COLUMN group_id TEXT REFERENCES post_groups(id) ON DELETE SET NULL;

CREATE INDEX idx_posts_group ON posts (group_id, published_at DESC, id DESC);
