-- Migration 004 - Feedback estruturado do beta controlado

CREATE TABLE IF NOT EXISTS feedback_beta (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id TEXT    NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  tipo       TEXT    NOT NULL CHECK(tipo IN ('feedback', 'bug', 'avaliacao')),
  texto      TEXT    NOT NULL DEFAULT '',
  nota       INTEGER CHECK(nota BETWEEN 0 AND 10),
  status     TEXT    NOT NULL DEFAULT 'novo'
             CHECK(status IN ('novo', 'lido', 'resolvido')),
  contexto   TEXT    NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE INDEX IF NOT EXISTS idx_feedback_beta_tipo_status
  ON feedback_beta(tipo, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_feedback_beta_usuario
  ON feedback_beta(usuario_id, created_at DESC);
