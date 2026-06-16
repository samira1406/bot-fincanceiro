-- Migration 001 — Schema inicial
-- Aplicada automaticamente pelo sistema de migrations na primeira execução.

CREATE TABLE IF NOT EXISTS usuarios (
  id                          TEXT    PRIMARY KEY,
  nome                        TEXT,
  aguardando_nome             INTEGER NOT NULL DEFAULT 1,
  aguardando_caixinha         INTEGER NOT NULL DEFAULT 0,
  valor_sugerido_caixinha     REAL    NOT NULL DEFAULT 0,
  estado_expira_em            INTEGER,
  ultimo_msg_id               TEXT,
  meta_mensal                 REAL,
  criado_em                   INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE TABLE IF NOT EXISTS lancamentos (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id  TEXT    NOT NULL REFERENCES usuarios(id),
  tipo        TEXT    NOT NULL CHECK(tipo IN ('entrada','gasto')),
  nome        TEXT    NOT NULL,
  categoria   TEXT    NOT NULL DEFAULT 'geral',
  valor       REAL    NOT NULL,
  mes         TEXT    NOT NULL,
  criado_em   INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE INDEX IF NOT EXISTS idx_lanc_usuario_mes  ON lancamentos(usuario_id, mes);
CREATE INDEX IF NOT EXISTS idx_lanc_usuario_tipo ON lancamentos(usuario_id, tipo);
CREATE INDEX IF NOT EXISTS idx_lanc_criado_em    ON lancamentos(criado_em);
