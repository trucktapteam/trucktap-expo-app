-- Reconstructed verbatim from production supabase_migrations.schema_migrations
-- (version 20260815044331). Already applied to production; history-alignment only.

alter table private.hands_free_live_settings
  add column early_adopt_enabled boolean not null default false,
  add column early_adopt_window interval not null default '00:30:00',
  add column early_adopt_max_distance_meters integer default 3200;
