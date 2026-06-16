-- Migration 003 - Metas mensais por categoria

CREATE TABLE IF NOT EXISTS metas_categoria (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id    TEXT    NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  categoria     TEXT    NOT NULL,
  valor_limite  REAL    NOT NULL,
  periodo_mes   INTEGER NOT NULL CHECK(periodo_mes BETWEEN 1 AND 12),
  periodo_ano   INTEGER NOT NULL,
  criado_em     INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  atualizado_em INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  UNIQUE(usuario_id, categoria, periodo_mes, periodo_ano)
);

CREATE INDEX IF NOT EXISTS idx_meta_categoria_usuario_periodo
  ON metas_categoria(usuario_id, periodo_mes, periodo_ano);
