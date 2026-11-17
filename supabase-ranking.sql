-- Ranking semanal de G'day. Pegalo una vez en Supabase → SQL Editor → Run.
-- Solo el servidor de G'day (con la clave service_role) lee y escribe esta tabla: el navegador nunca habla con Supabase.
create table if not exists rank_week (
  uid        text        not null,          -- código anónimo de la cuenta de Google (no es el mail)
  week       date        not null,          -- lunes de la semana
  nick       text        not null,          -- apodo que eligió la persona
  minutes    integer     not null default 0,
  updated_at timestamptz not null default now(),
  primary key (uid, week)
);
create index if not exists rank_week_top on rank_week (week, minutes desc);
-- sin políticas: con RLS activado, nadie puede leerla con la clave pública
alter table rank_week enable row level security;
