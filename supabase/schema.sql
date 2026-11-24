-- =============================================================================
-- Script SQL — Sistema Web de Sorteio de Amigo Oculto (Confraternização)
-- Execute este script no SQL Editor do seu projeto Supabase.
-- =============================================================================

-- 1. Garante a extensão pgcrypto para gen_random_uuid() (geralmente já ativa)
create extension if not exists pgcrypto;

-- 2. Criação da tabela principal de participantes
create table if not exists public.participantes (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (char_length(trim(nome)) > 0),
  codigo text not null unique check (codigo ~ '^[0-9]{2}$'),
  amigo_sorteado text null,
  visualizado_em timestamptz null,

  -- Garantia no banco de dados: ninguém pode tirar a si mesmo
  constraint participantes_nao_tira_si_mesmo
    check (amigo_sorteado is null or lower(trim(amigo_sorteado)) <> lower(trim(nome)))
);

-- Índice auxiliar para busca rápida pelo código de 2 dígitos e ordenação alfabética
create index if not exists idx_participantes_codigo on public.participantes (codigo);
create index if not exists idx_participantes_nome on public.participantes (nome);

-- 3. Proteção de imutabilidade no banco após o sorteio
-- Uma vez que amigo_sorteado foi gravado, impede que um UPDATE altere o resultado
-- ou apague visualizado_em. O sorteio só pode ser refeito após um reset explícito (DELETE).
create or replace function public.proteger_sorteio_oficial()
returns trigger
language plpgsql
as $$
begin
  if old.amigo_sorteado is not null then
    if new.amigo_sorteado is distinct from old.amigo_sorteado then
      raise exception 'O sorteio oficial já foi realizado e não pode ser alterado.';
    end if;

    if new.codigo is distinct from old.codigo or new.nome is distinct from old.nome then
      raise exception 'Os dados do participante não podem ser alterados após o sorteio.';
    end if;
  end if;

  -- Preserva a primeira data/hora em que o participante visualizou o resultado
  if old.visualizado_em is not null and new.visualizado_em is distinct from old.visualizado_em then
    new.visualizado_em := old.visualizado_em;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_proteger_sorteio_oficial on public.participantes;
create trigger trg_proteger_sorteio_oficial
before update on public.participantes
for each row
execute function public.proteger_sorteio_oficial();

-- 4. Configuração de Row Level Security (RLS)
alter table public.participantes enable row level security;

-- Remove políticas antigas caso o script seja executado novamente
drop policy if exists "Permitir leitura de participantes" on public.participantes;
drop policy if exists "Permitir insercao de participantes" on public.participantes;
drop policy if exists "Permitir marcar visualizacao" on public.participantes;
drop policy if exists "Permitir reset de emergencia" on public.participantes;

-- Leitura (usada pelo participante via código e pelo painel /admin sem a coluna amigo_sorteado)
create policy "Permitir leitura de participantes"
on public.participantes
for select
to anon, authenticated
using (true);

-- Inserção (usada pela tela /admin ao gravar o sorteio oficial único)
create policy "Permitir insercao de participantes"
on public.participantes
for insert
to anon, authenticated
with check (true);

-- Atualização (usada para registrar visualizado_em quando o participante confirma "Sim, sou eu")
create policy "Permitir marcar visualizacao"
on public.participantes
for update
to anon, authenticated
using (true)
with check (true);

-- Exclusão (usada exclusivamente no botão de emergência "Resetar sorteio" na tela /admin)
create policy "Permitir reset de emergencia"
on public.participantes
for delete
to anon, authenticated
using (true);

-- Permissões de tabela para a role pública anon do Supabase
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on table public.participantes to anon, authenticated;
