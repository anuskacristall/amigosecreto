/**
 * Algoritmo Matemático do Sorteio ("Sem Marmelada" / Ciclo Hamiltoniano Único)
 *
 * Regras garantidas:
 * 1. Todos os participantes formam UMA ÚNICA corrente fechada:
 *    P1 -> P2 -> P3 -> ... -> PN -> P1
 * 2. Nunca existem subciclos isolados (ex: A tira B e B tira A).
 * 3. Ninguém tira a si mesmo.
 * 4. Cada participante recebe um código aleatório único de 2 dígitos ("00" a "99").
 * 5. O resultado é retornado em ordem alfabética (independente da ordem do ciclo)
 *    para que a sequência de registros não dê pistas sobre quem tirou quem.
 */

export const MIN_PARTICIPANTS = 3;
export const MAX_PARTICIPANTS = 100;

/**
 * Gera um inteiro aleatório uniforme em [0, max) usando Web Crypto API
 * com rejection sampling para eliminar viés de módulo.
 */
function secureRandomInt(max) {
  if (max <= 1) return 0;

  if (typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.getRandomValues === 'function') {
    const array = new Uint32Array(1);
    const maxUint32 = 0xffffffff;
    const limit = maxUint32 - ((maxUint32 + 1) % max);

    let value;
    do {
      globalThis.crypto.getRandomValues(array);
      value = array[0];
    } while (value > limit);

    return value % max;
  }

  return Math.floor(Math.random() * max);
}

/**
 * Embaralhamento Fisher-Yates (sem mutar o array original).
 */
export function shuffleArray(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = secureRandomInt(i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * Normaliza uma chave de comparação para evitar nomes duplicados
 * (ignora maiúsculas/minúsculas e espaços extras).
 */
export function normalizeNameKey(name) {
  return String(name ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('pt-BR');
}

/**
 * Limpa um nome removendo espaços redundantes.
 */
export function cleanName(name) {
  return String(name ?? '')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Extrai nomes válidos de um texto (um por linha), mantendo apenas entradas únicas.
 */
export function parseNamesFromText(rawText, existingNames = []) {
  const seen = new Set(existingNames.map(normalizeNameKey));
  const added = [];
  const duplicates = [];

  const lines = String(rawText ?? '').split(/\r?\n/);

  for (const line of lines) {
    const cleaned = cleanName(line);
    if (!cleaned) continue;

    const key = normalizeNameKey(cleaned);
    if (seen.has(key)) {
      duplicates.push(cleaned);
      continue;
    }

    seen.add(key);
    added.push(cleaned);
  }

  return { added, duplicates };
}

/**
 * Gera `count` códigos únicos e aleatórios de 2 dígitos ("00" a "99").
 */
export function generateUniqueCodes(count) {
  if (!Number.isInteger(count) || count < 1 || count > MAX_PARTICIPANTS) {
    throw new Error(`A quantidade de participantes deve estar entre 1 e ${MAX_PARTICIPANTS}.`);
  }

  const allCodes = Array.from({ length: 100 }, (_, index) => String(index).padStart(2, '0'));
  return shuffleArray(allCodes).slice(0, count);
}

/**
 * Valida matematicamente que o sorteio forma um único Ciclo Hamiltoniano completo
 * e que todos os códigos são válidos e únicos.
 */
export function verifySingleHamiltonianCycle(drawRecords) {
  if (!Array.isArray(drawRecords) || drawRecords.length < MIN_PARTICIPANTS) {
    throw new Error(`O sorteio precisa de pelo menos ${MIN_PARTICIPANTS} participantes.`);
  }

  const total = drawRecords.length;
  const mapByGiver = new Map();
  const seenCodes = new Set();

  for (const record of drawRecords) {
    const nome = cleanName(record.nome);
    const amigo = cleanName(record.amigo_sorteado);
    const codigo = String(record.codigo ?? '');

    if (!/^[0-9]{2}$/.test(codigo)) {
      throw new Error(`Código inválido gerado: "${codigo}".`);
    }
    if (seenCodes.has(codigo)) {
      throw new Error(`Código duplicado detectado: "${codigo}".`);
    }
    seenCodes.add(codigo);

    if (!nome || !amigo) {
      throw new Error('Participante ou amigo sorteado inválido.');
    }
    if (normalizeNameKey(nome) === normalizeNameKey(amigo)) {
      throw new Error(`Erro de integridade: ${nome} tirou a si mesmo.`);
    }
    if (mapByGiver.has(nome)) {
      throw new Error(`Participante duplicado no sorteio: ${nome}.`);
    }

    mapByGiver.set(nome, amigo);
  }

  // Percorre a corrente a partir do primeiro participante e verifica ciclo único de tamanho N
  const start = drawRecords[0].nome;
  const visited = new Set();
  let current = start;

  for (let step = 0; step < total; step += 1) {
    if (visited.has(current)) {
      throw new Error('Subciclo isolado detectado na verificação do sorteio.');
    }
    visited.add(current);
    current = mapByGiver.get(current);
    if (!current) {
      throw new Error('Corrente quebrada na verificação do sorteio.');
    }
  }

  if (visited.size !== total || current !== start) {
    throw new Error('O sorteio não fechou um único ciclo completo.');
  }

  return true;
}

/**
 * Executa o sorteio oficial em Ciclo Hamiltoniano Único:
 * P1 -> P2 -> P3 -> ... -> PN -> P1
 */
export function createHamiltonianDraw(rawNames) {
  const uniqueNames = [];
  const seen = new Set();

  for (const raw of rawNames ?? []) {
    const cleaned = cleanName(raw);
    if (!cleaned) continue;

    const key = normalizeNameKey(cleaned);
    if (seen.has(key)) {
      throw new Error(`O nome "${cleaned}" está duplicado na lista. Remova duplicatas antes de sortear.`);
    }

    seen.add(key);
    uniqueNames.push(cleaned);
  }

  if (uniqueNames.length < MIN_PARTICIPANTS) {
    throw new Error(
      `Adicione pelo menos ${MIN_PARTICIPANTS} participantes para formar um ciclo único sem pares isolados.`
    );
  }

  if (uniqueNames.length > MAX_PARTICIPANTS) {
    throw new Error(
      `O limite máximo é de ${MAX_PARTICIPANTS} participantes (códigos de 00 a 99).`
    );
  }

  // 1. Embaralha todos os participantes formando a ordem secreta do ciclo
  const cycleOrder = shuffleArray(uniqueNames);

  // 2. Gera códigos aleatórios únicos de 2 dígitos ("00" a "99")
  const codes = generateUniqueCodes(cycleOrder.length);

  // 3. Conecta cada participante ao próximo na corrente fechada (PN -> P1)
  const drawRecords = cycleOrder.map((nome, index) => {
    const nextIndex = (index + 1) % cycleOrder.length;
    return {
      nome,
      codigo: codes[index],
      amigo_sorteado: cycleOrder[nextIndex],
      visualizado_em: null
    };
  });

  // 4. Verificação matemática obrigatória antes de retornar
  verifySingleHamiltonianCycle(drawRecords);

  // 5. Ordena alfabeticamente pelo nome para que a ordem de salvamento
  //    no banco de dados não entregue a sequência do ciclo
  return drawRecords.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }));
}
