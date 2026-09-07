CREATE TABLE posts (
  id TEXT PRIMARY KEY CHECK (length(id) = 36),
  slug TEXT NOT NULL COLLATE BINARY CHECK (
    length(slug) BETWEEN 1 AND 120
    AND slug NOT GLOB '*[^a-z0-9-]*'
    AND slug NOT LIKE '-%'
    AND slug NOT LIKE '%-'
    AND slug NOT LIKE '%--%'
  ),
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 160),
  excerpt TEXT NOT NULL CHECK (length(trim(excerpt)) BETWEEN 1 AND 320),
  body_markdown TEXT NOT NULL CHECK (length(body_markdown) > 0),
  cover_image_url TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  created_at TEXT NOT NULL CHECK (created_at GLOB '????-??-??T??:??:??.???Z'),
  updated_at TEXT NOT NULL CHECK (updated_at GLOB '????-??-??T??:??:??.???Z'),
  published_at TEXT CHECK (published_at IS NULL OR published_at GLOB '????-??-??T??:??:??.???Z'),
  CHECK (updated_at >= created_at),
  CHECK (status <> 'published' OR published_at IS NOT NULL),
  UNIQUE (slug)
);

CREATE INDEX idx_posts_public_list
  ON posts (published_at DESC, id DESC)
  WHERE status = 'published';

CREATE TABLE projects (
  id TEXT PRIMARY KEY CHECK (length(id) = 36),
  slug TEXT NOT NULL COLLATE BINARY CHECK (
    length(slug) BETWEEN 1 AND 120
    AND slug NOT GLOB '*[^a-z0-9-]*'
    AND slug NOT LIKE '-%'
    AND slug NOT LIKE '%-'
    AND slug NOT LIKE '%--%'
  ),
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  summary TEXT NOT NULL CHECK (length(trim(summary)) BETWEEN 1 AND 240),
  body_markdown TEXT NOT NULL CHECK (length(body_markdown) > 0),
  tech_stack_json TEXT NOT NULL CHECK (json_valid(tech_stack_json) AND json_type(tech_stack_json) = 'array'),
  code_url TEXT,
  demo_url TEXT,
  cover_image_url TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order BETWEEN -2147483648 AND 2147483647),
  created_at TEXT NOT NULL CHECK (created_at GLOB '????-??-??T??:??:??.???Z'),
  updated_at TEXT NOT NULL CHECK (updated_at GLOB '????-??-??T??:??:??.???Z'),
  CHECK (updated_at >= created_at),
  UNIQUE (slug)
);

CREATE INDEX idx_projects_public_list
  ON projects (sort_order DESC, created_at DESC, id DESC);

CREATE TABLE idempotency_keys (
  scope TEXT NOT NULL CHECK (scope IN ('create_post', 'create_project')),
  key TEXT NOT NULL CHECK (length(key) BETWEEN 1 AND 128),
  request_hash TEXT NOT NULL CHECK (length(request_hash) = 64),
  response_status INTEGER NOT NULL CHECK (response_status = 201),
  response_body TEXT NOT NULL CHECK (json_valid(response_body)),
  resource_id TEXT NOT NULL CHECK (length(resource_id) = 36),
  created_at TEXT NOT NULL CHECK (created_at GLOB '????-??-??T??:??:??.???Z'),
  expires_at TEXT NOT NULL CHECK (expires_at GLOB '????-??-??T??:??:??.???Z'),
  PRIMARY KEY (scope, key)
);

CREATE INDEX idx_idempotency_keys_expiry ON idempotency_keys (expires_at);
