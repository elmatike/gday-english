-- Sala de chat en pixel art de G'day. Pegalo una vez en Supabase → SQL Editor → Run.
-- Igual que el ranking: solo el servidor de G'day (clave service_role) lee y escribe; el navegador nunca habla con Supabase.
create table if not exists lobby_users (
  uid   text        primary key,            -- código anónimo de la cuenta de Google (no es el mail)
  room  text        not null,
  nick  text        not null,
  look  jsonb       not null default '{}',  -- piel, pelo, ropa del muñequito
  x     integer     not null default 0,
  y     integer     not null default 0,
  seen  timestamptz not null default now()
);
create index if not exists lobby_users_room on lobby_users (room, seen);

create table if not exists lobby_msgs (
  id    bigint      generated always as identity primary key,
  room  text        not null,
  uid   text        not null,
  nick  text        not null,
  body  text        not null check (char_length(body) <= 140),
  at    timestamptz not null default now()
);
create index if not exists lobby_msgs_room on lobby_msgs (room, id);

alter table lobby_users enable row level security;
alter table lobby_msgs  enable row level security;
