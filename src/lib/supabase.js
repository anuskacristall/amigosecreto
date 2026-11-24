import { createClient } from '@supabase/supabase-js';

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL ?? '').trim();
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim();

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    })
  : null;

function ensureClient() {
  if (!supabase) {
    throw new Error(
      'O banco de dados Supabase ainda não foi configurado. Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.'
    );
  }
  return supabase;
}

/**
 * Consulta um participante pelo código numérico de 2 dígitos ("00" a "99").
 * Usada exclusivamente no fluxo público (/).
 */
export async function findParticipantByCode(code) {
  const client = ensureClient();
  const normalizedCode = String(code ?? '').trim();

  const { data, error } = await client
    .from('participantes')
    .select('id, nome, codigo, amigo_sorteado, visualizado_em')
    .eq('codigo', normalizedCode)
    .maybeSingle();

  if (error) {
    throw new Error(`Não foi possível consultar o número agora. Tente novamente. (${error.message})`);
  }

  return data;
}

/**
 * Registra o primeiro acesso confirmado do participante ("Sim, sou eu").
 * Só grava quando `visualizado_em` ainda está vazio (NULL).
 */
export async function markParticipantAsViewed(participantId) {
  const client = ensureClient();
  const nowIso = new Date().toISOString();

  const { error } = await client
    .from('participantes')
    .update({ visualizado_em: nowIso })
    .eq('id', participantId)
    .is('visualizado_em', null);

  if (error) {
    throw new Error(`Erro ao registrar visualização: ${error.message}`);
  }

  return nowIso;
}

/**
 * Carrega o painel administrativo SEM SPOILER.
 * IMPORTANTE: A coluna `amigo_sorteado` NUNCA é selecionada ou trafegada aqui!
 * Para saber se o sorteio já foi executado, fazemos apenas uma contagem HEAD no banco.
 */
export async function fetchAdminState() {
  const client = ensureClient();

  const [participantsRes, drawnCountRes] = await Promise.all([
    client
      .from('participantes')
      .select('id, nome, codigo, visualizado_em')
      .order('nome', { ascending: true }),
    client
      .from('participantes')
      .select('id', { count: 'exact', head: true })
      .not('amigo_sorteado', 'is', null)
  ]);

  if (participantsRes.error) {
    throw new Error(`Erro ao carregar participantes: ${participantsRes.error.message}`);
  }

  if (drawnCountRes.error) {
    throw new Error(`Erro ao verificar status do sorteio: ${drawnCountRes.error.message}`);
  }

  const participants = participantsRes.data ?? [];
  const isDrawn = (drawnCountRes.count ?? 0) > 0;

  return {
    participants,
    isDrawn
  };
}

/**
 * Salva o sorteio oficial único e permanente no Supabase.
 * Verifica antes se já existe um sorteio gravado para impedir sobrescrita.
 */
export async function saveOfficialDraw(drawRecords) {
  const client = ensureClient();

  // Trava de segurança contra sorteio duplicado
  const { count: existingDrawnCount, error: checkError } = await client
    .from('participantes')
    .select('id', { count: 'exact', head: true })
    .not('amigo_sorteado', 'is', null);

  if (checkError) {
    throw new Error(`Erro ao verificar se o sorteio já existe: ${checkError.message}`);
  }

  if ((existingDrawnCount ?? 0) > 0) {
    throw new Error('O sorteio oficial já foi realizado e está travado no banco de dados.');
  }

  // Remove eventuais registros preliminares sem sorteio antes de inserir o sorteio oficial
  const { error: cleanupError } = await client
    .from('participantes')
    .delete()
    .is('amigo_sorteado', null);

  if (cleanupError) {
    throw new Error(`Erro ao preparar tabela para o sorteio: ${cleanupError.message}`);
  }

  // Insere todos os participantes com seus códigos e amigos sorteados em lote
  const { error: insertError } = await client
    .from('participantes')
    .insert(drawRecords);

  if (insertError) {
    throw new Error(`Erro ao salvar o sorteio oficial: ${insertError.message}`);
  }

  // Retorna o estado atualizado SEM SPOILER (sem amigo_sorteado)
  return fetchAdminState();
}

/**
 * Reset de emergência (protegido por senha e confirmação dupla na tela /admin).
 * Apaga todos os registros para permitir um novo sorteio do zero.
 */
export async function resetOfficialDraw() {
  const client = ensureClient();

  const { error } = await client
    .from('participantes')
    .delete()
    .not('id', 'is', null);

  if (error) {
    throw new Error(`Erro ao resetar o sorteio: ${error.message}`);
  }
}
