-- Migration 002 — Adiciona coluna de tags para lançamentos
-- Exemplo de como adicionar features sem quebrar o banco existente.
-- Para adicionar uma nova migration: crie 003_nome.sql, 004_nome.sql, etc.
-- O sistema aplica apenas as migrations ainda não executadas.

ALTER TABLE lancamentos ADD COLUMN tags TEXT DEFAULT '';
