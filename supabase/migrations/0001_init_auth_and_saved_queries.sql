-- Login próprio (sem Supabase Auth): usuários e sessões em tabelas
-- próprias. RLS habilitado em todas as tabelas, sem nenhuma policy —
-- o cliente nunca tem chave anônima nem chama o Supabase diretamente;
-- só a Service Role Key (sempre no servidor, sempre ignora RLS) acessa
-- estas tabelas. RLS sem policies = deny-all por padrão para qualquer
-- outra chave (defesa em profundidade caso uma chave anon seja emitida
-- por engano no futuro).

create extension if not exists pgcrypto;

create table public.users (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  email text not null unique,
  password_hash text not null,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index sessions_user_id_idx on public.sessions(user_id);
create index sessions_expires_at_idx on public.sessions(expires_at);

create table public.saved_queries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  titulo text,
  cnpj_raiz text not null,
  snapshot jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index saved_queries_user_id_idx on public.saved_queries(user_id);

create table public.saved_query_images (
  id uuid primary key default gen_random_uuid(),
  saved_query_id uuid not null references public.saved_queries(id) on delete cascade,
  person_id text not null,
  storage_path text not null,
  mime_type text not null,
  file_hash text not null,
  created_at timestamptz not null default now()
);
create index saved_query_images_saved_query_id_idx on public.saved_query_images(saved_query_id);
-- Dedupe: mesma imagem (mesmo hash) não é enviada duas vezes para a mesma consulta.
create unique index saved_query_images_dedupe_idx
  on public.saved_query_images(saved_query_id, file_hash);

alter table public.users enable row level security;
alter table public.sessions enable row level security;
alter table public.saved_queries enable row level security;
alter table public.saved_query_images enable row level security;
-- Nenhuma policy criada de propósito (ver comentário no topo do arquivo).
