-- ===========================================================
-- EbookPro — schema (Supabase)
-- Ferramenta de retenção: quem compra um ebook seu na Hotmart
-- ganha acesso automático a uma "estante digital" com progresso,
-- bônus e direcionamento pra comprar os outros.
--
-- Roda no MESMO projeto Supabase compartilhado das outras apps,
-- mas em tabelas próprias (prefixo eb_) e SEM reaproveitar a
-- tabela "businesses" — como o EbookPro hoje é de uso único (seu),
-- criar uma tabela de produtor separada evita qualquer colisão
-- com contas que você já usa em AgendaPro/LaudoPro/etc. Se um dia
-- vender pra outros produtores, dá pra migrar pra multi-tenant.
-- ===========================================================

create table if not exists eb_produtores (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references auth.users(id) on delete cascade,
  nome text not null default 'Meu EbookPro',
  brand_color text default '#2E86FF',
  created_at timestamptz default now()
);
alter table eb_produtores enable row level security;
create policy "dono gerencia o proprio produtor" on eb_produtores
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create table if not exists eb_produtos (
  id uuid primary key default gen_random_uuid(),
  produtor_id uuid not null references eb_produtores(id) on delete cascade,
  hotmart_product_id text, -- ID do produto na Hotmart, pra casar com o webhook de compra
  nome text not null,
  capa_url text,
  arquivo_url text, -- PDF do ebook em si (liberado só pra quem tem acesso)
  descricao text,
  bonus_descricao text,
  bonus_url text, -- link/arquivo liberado quando o leitor conclui a leitura
  ordem int not null default 0, -- posição sugerida na trilha (1, 2, 3, 4...)
  preco_exclusivo numeric(10,2), -- preço especial mostrado só pra quem já é leitor (cross-sell)
  link_compra text, -- link de checkout da Hotmart pra esse ebook
  ativo boolean not null default true,
  created_at timestamptz default now()
);
create index if not exists idx_eb_produtos_produtor on eb_produtos(produtor_id);
alter table eb_produtos enable row level security;
create policy "dono gerencia produtos" on eb_produtos
  for all using (exists (select 1 from eb_produtores p where p.id = eb_produtos.produtor_id and p.owner_id = auth.uid()))
  with check (exists (select 1 from eb_produtores p where p.id = eb_produtos.produtor_id and p.owner_id = auth.uid()));
create table if not exists eb_leitores (
  id uuid primary key default gen_random_uuid(),
  produtor_id uuid not null references eb_produtores(id) on delete cascade,
  auth_user_id uuid references auth.users(id) on delete set null,
  email text not null,
  nome text,
  telefone text,
  origem text default 'hotmart', -- 'hotmart' | 'importado' (base antiga)
  created_at timestamptz default now(),
  unique(produtor_id, email)
);
create index if not exists idx_eb_leitores_email on eb_leitores(produtor_id, email);
alter table eb_leitores enable row level security;
create policy "dono gerencia leitores" on eb_leitores
  for all using (exists (select 1 from eb_produtores p where p.id = eb_leitores.produtor_id and p.owner_id = auth.uid()))
  with check (exists (select 1 from eb_produtores p where p.id = eb_leitores.produtor_id and p.owner_id = auth.uid()));
create policy "leitor ve o proprio cadastro" on eb_leitores
  for select using (auth_user_id = auth.uid());

create table if not exists eb_acessos (
  id uuid primary key default gen_random_uuid(),
  leitor_id uuid not null references eb_leitores(id) on delete cascade,
  produto_id uuid not null references eb_produtos(id) on delete cascade,
  origem text default 'hotmart', -- 'hotmart' | 'manual' | 'importado'
  transacao_hotmart text,
  progresso_pagina int not null default 0,
  progresso_percentual numeric(5,2) not null default 0,
  concluido boolean not null default false,
  concluido_em timestamptz,
  ultimo_acesso timestamptz default now(),
  created_at timestamptz default now(),
  unique(leitor_id, produto_id)
);
create index if not exists idx_eb_acessos_leitor on eb_acessos(leitor_id);
alter table eb_acessos enable row level security;
create policy "dono ve acessos" on eb_acessos
  for all using (exists (
    select 1 from eb_leitores l join eb_produtores p on p.id = l.produtor_id
    where l.id = eb_acessos.leitor_id and p.owner_id = auth.uid()
  ))
  with check (exists (
    select 1 from eb_leitores l join eb_produtores p on p.id = l.produtor_id
    where l.id = eb_acessos.leitor_id and p.owner_id = auth.uid()
  ));
create policy "leitor ve os proprios acessos" on eb_acessos
  for select using (exists (select 1 from eb_leitores l where l.id = eb_acessos.leitor_id and l.auth_user_id = auth.uid()));
create policy "leitor atualiza o proprio progresso" on eb_acessos
  for update using (exists (select 1 from eb_leitores l where l.id = eb_acessos.leitor_id and l.auth_user_id = auth.uid()))
  with check (exists (select 1 from eb_leitores l where l.id = eb_acessos.leitor_id and l.auth_user_id = auth.uid()));

-- Só agora eb_acessos já existe, então esta política (que depende dela) pode ser criada.
-- IMPORTANTE: a tabela base NÃO é liberada geral pra "ativo = true", porque isso deixaria
-- qualquer pessoa logada ler arquivo_url/bonus_url de ebooks que ela não comprou.
-- Só quem tem um eb_acessos pra aquele produto pode ler a linha inteira (com o PDF).
create policy "leitor ve produtos que possui" on eb_produtos
  for select using (exists (
    select 1 from eb_acessos a join eb_leitores l on l.id = a.leitor_id
    where a.produto_id = eb_produtos.id and l.auth_user_id = auth.uid()
  ));

-- Vitrine pública (só metadados de venda, sem arquivo_url/bonus_url) — usada
-- pra mostrar os ebooks que o leitor AINDA NÃO tem, como oferta de cross-sell.
create or replace view eb_vitrine as
  select id, produtor_id, nome, capa_url, descricao, preco_exclusivo, link_compra, ordem
  from eb_produtos
  where ativo = true;
grant select on eb_vitrine to anon, authenticated;

-- Log cru de todo evento recebido da Hotmart, pra depuração/auditoria.
create table if not exists eb_eventos_hotmart (
  id uuid primary key default gen_random_uuid(),
  evento text,
  transacao text,
  payload jsonb,
  processado_em timestamptz default now()
);
alter table eb_eventos_hotmart enable row level security;
create policy "dono ve eventos" on eb_eventos_hotmart
  for select using (exists (select 1 from eb_produtores where owner_id = auth.uid()));

-- Roda uma vez, logo após o leitor fazer login pelo link mágico:
-- liga a conta de autenticação (auth.uid()) ao cadastro de leitor já
-- pré-criado pelo webhook (que só conhece o e-mail, não o auth_user_id).
create or replace function eb_vincular_por_email()
returns void
language plpgsql
security definer
as $$
begin
  update eb_leitores
  set auth_user_id = auth.uid()
  where auth_user_id is null
    and lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''));
end;
$$;

-- ===========================================================
-- SEED — rode isso só DEPOIS de criar sua conta de administrador
-- pelo admin/login.html (ela cria a linha em eb_produtores sozinha).
-- Já vem completo: capa, arquivo (Google Drive), link de compra e
-- ID da Hotmart dos 6 ebooks — o webhook já sabe casar cada compra
-- aprovada com o ebook certo assim que você rodar isso.
-- ===========================================================
insert into eb_produtos (produtor_id, nome, capa_url, arquivo_url, link_compra, ordem, hotmart_product_id) values
  ((select id from eb_produtores limit 1), 'BOX7 Premium — Mecânica de Alta Performance pra MotoGP', 'capas/01-box7-premium.webp', 'https://drive.google.com/file/d/1Bx6qWry7ICKFLY4shgrpKvJ_uyLGOWIO/preview', 'https://go.hotmart.com/G106242407E', 1, '8482567'),
  ((select id from eb_produtores limit 1), 'De Técnico a Gestor de Oficina de Motos', 'capas/02-tecnico-a-gestor.jpg', 'https://drive.google.com/file/d/1TSF15iXE05w3CqwfQrt-B92rwdssj4yN/preview', 'https://go.hotmart.com/M106240523O', 2, '8110714'),
  ((select id from eb_produtores limit 1), 'Oficina Lucrativa em 7 Dias', 'capas/03-oficina-lucrativa-7-dias.webp', 'https://drive.google.com/file/d/1tZC-dF1CGVZgT73N08cTERMim53i4q8B/preview', 'https://go.hotmart.com/K106467358R', 3, '8049185'),
  ((select id from eb_produtores limit 1), 'Trilogia do Conceito Box 7 — Gestão de Oficinas', 'capas/04-conceito-box7-vol3.webp', 'https://drive.google.com/file/d/1t0FMjdWPU3AljLMu44YGDpYRXZQ5mGQV/preview', 'https://go.hotmart.com/R106574720N', 4, '7995024'),
  ((select id from eb_produtores limit 1), 'Da Bancada para a Gestão: Construa a Oficina dos Seus Sonhos (Volume 2)', 'capas/05-conceito-box7-vol2.jpg', 'https://drive.google.com/file/d/1-SOerkem1ieeeEZfjWnUZFCipIh-Wpxi/preview', 'https://go.hotmart.com/A106707193V', 5, '7906802'),
  ((select id from eb_produtores limit 1), 'Conceito Box 7 — Começando a Oficina do Zero (Volume 1)', 'capas/06-conceito-box7-comecando-do-zero.jpg', 'https://drive.google.com/file/d/10t51u7ScItDjLi-NUgwUxjI0_JTofFZx/preview', 'https://go.hotmart.com/R107528168Y', 6, '7907249');
