import { copyToClipboard, escapeHtml, formatDateTimeBr } from '../lib/dom.js';
import {
  MAX_PARTICIPANTS,
  MIN_PARTICIPANTS,
  cleanName,
  createHamiltonianDraw,
  normalizeNameKey,
  parseNamesFromText
} from '../lib/draw.js';
import {
  fetchAdminState,
  isSupabaseConfigured,
  resetOfficialDraw,
  saveOfficialDraw
} from '../lib/supabase.js';

const ADMIN_SESSION_KEY = 'amigo_oculto_admin_auth_v1';
const DRAFT_NAMES_KEY = 'amigo_oculto_draft_names_v1';

function getConfiguredAdminPassword() {
  return String(import.meta.env.VITE_ADMIN_PASSWORD ?? '');
}

function loadDraftNames() {
  try {
    const raw = window.localStorage.getItem(DRAFT_NAMES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((n) => typeof n === 'string' && n.trim()) : [];
  } catch {
    return [];
  }
}

function saveDraftNames(names) {
  try {
    window.localStorage.setItem(DRAFT_NAMES_KEY, JSON.stringify(names));
  } catch {
    // Ignora caso localStorage esteja indisponível
  }
}

function buildInviteMessage(participant) {
  const siteUrl = window.location.origin;
  return `Olá ${participant.nome}! 🎉 Acesse o link do nosso Amigo Oculto: ${siteUrl} e digite o seu número secreto *${participant.codigo}* para descobrir quem você tirou!`;
}

export function mountAdminView(container, { onNavigateHome }) {
  const configuredPassword = getConfiguredAdminPassword();
  const isPasswordConfigured = configuredPassword.length > 0;

  const state = {
    authenticated:
      isPasswordConfigured && window.sessionStorage.getItem(ADMIN_SESSION_KEY) === 'true',
    showPassword: false,
    loginError: '',
    loading: false,
    actionBusy: false,
    error: '',
    feedback: '',
    isDrawn: false,
    participants: [], // Contém APENAS { id, nome, codigo, visualizado_em } — ZERO SPOILER
    draftNames: loadDraftNames(),
    bulkText: '',
    singleName: '',
    copiedId: null,
    // Modais de proteção
    confirmDrawStep: 0, // 0 = fechado, 1 = primeira confirmação, 2 = segunda confirmação
    resetModalOpen: false,
    resetPasswordInput: '',
    resetError: ''
  };

  let copyTimeoutId = null;

  function setState(partial) {
    Object.assign(state, partial);
    render();
  }

  async function loadAdminData(showFeedback = false) {
    if (!isSupabaseConfigured) {
      setState({
        loading: false,
        error:
          'Configure as variáveis VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY para conectar ao Supabase.'
      });
      return;
    }

    setState({ loading: true, error: '' });

    try {
      const { participants, isDrawn } = await fetchAdminState();
      setState({
        loading: false,
        participants,
        isDrawn,
        feedback: showFeedback ? 'Status atualizado com sucesso!' : state.feedback
      });
    } catch (err) {
      setState({
        loading: false,
        error: err.message || 'Erro ao carregar dados do Supabase.'
      });
    }
  }

  function handleLoginSubmit(event) {
    event.preventDefault();
    const input = container.querySelector('#admin-password-input');
    const typed = input ? input.value : '';

    if (!isPasswordConfigured) {
      setState({
        loginError:
          'A variável VITE_ADMIN_PASSWORD não está definida. Configure-a no Render ou no arquivo .env.'
      });
      return;
    }

    if (typed !== configuredPassword) {
      setState({ loginError: 'Senha incorreta. Tente novamente.' });
      input?.focus();
      return;
    }

    window.sessionStorage.setItem(ADMIN_SESSION_KEY, 'true');
    setState({ authenticated: true, loginError: '', error: '', feedback: '' });
    loadAdminData(false);
  }

  function handleLogout() {
    window.sessionStorage.removeItem(ADMIN_SESSION_KEY);
    setState({
      authenticated: false,
      loginError: '',
      feedback: '',
      error: '',
      confirmDrawStep: 0,
      resetModalOpen: false
    });
  }

  function handleLoadBulkNames() {
    const { added, duplicates } = parseNamesFromText(state.bulkText, state.draftNames);

    if (added.length === 0 && duplicates.length === 0) {
      setState({
        error: 'Cole pelo menos um nome (um por linha) antes de carregar.',
        feedback: ''
      });
      return;
    }

    const updated = [...state.draftNames, ...added];
    if (updated.length > MAX_PARTICIPANTS) {
      setState({
        error: `O limite máximo é de ${MAX_PARTICIPANTS} participantes (códigos de 00 a 99).`,
        feedback: ''
      });
      return;
    }

    saveDraftNames(updated);

    const parts = [];
    if (added.length > 0) {
      parts.push(
        `${added.length} ${added.length === 1 ? 'nome adicionado' : 'nomes adicionados'}`
      );
    }
    if (duplicates.length > 0) {
      parts.push(
        `${duplicates.length} ${duplicates.length === 1 ? 'duplicado ignorado' : 'duplicados ignorados'}`
      );
    }

    setState({
      draftNames: updated,
      bulkText: '',
      error: '',
      feedback: `${parts.join(' • ')}.`
    });
  }

  function handleAddSingleName(event) {
    event.preventDefault();
    const cleaned = cleanName(state.singleName);
    if (!cleaned) {
      setState({ error: 'Digite um nome para adicionar.', feedback: '' });
      return;
    }

    const exists = state.draftNames.some(
      (existing) => normalizeNameKey(existing) === normalizeNameKey(cleaned)
    );
    if (exists) {
      setState({
        error: `"${cleaned}" já está na lista de participantes.`,
        feedback: ''
      });
      return;
    }

    if (state.draftNames.length >= MAX_PARTICIPANTS) {
      setState({
        error: `O limite máximo é de ${MAX_PARTICIPANTS} participantes.`,
        feedback: ''
      });
      return;
    }

    const updated = [...state.draftNames, cleaned];
    saveDraftNames(updated);
    setState({
      draftNames: updated,
      singleName: '',
      error: '',
      feedback: `"${cleaned}" adicionado à lista.`
    });

    window.requestAnimationFrame(() => {
      container.querySelector('#single-name-input')?.focus();
    });
  }

  function handleRemoveDraftName(indexToRemove) {
    const removed = state.draftNames[indexToRemove];
    const updated = state.draftNames.filter((_, idx) => idx !== indexToRemove);
    saveDraftNames(updated);
    setState({
      draftNames: updated,
      error: '',
      feedback: removed ? `"${removed}" removido da lista.` : ''
    });
  }

  function handleStartOfficialDraw() {
    if (state.draftNames.length < MIN_PARTICIPANTS) {
      setState({
        error: `Adicione pelo menos ${MIN_PARTICIPANTS} participantes antes de realizar o sorteio oficial.`,
        feedback: ''
      });
      return;
    }

    setState({ confirmDrawStep: 1, error: '', feedback: '' });
  }

  async function handleConfirmOfficialDraw() {
    if (state.actionBusy) return;
    setState({ actionBusy: true, error: '' });

    try {
      // Gera o Ciclo Hamiltoniano único (P1 -> P2 -> ... -> PN -> P1) e códigos 00-99
      const drawRecords = createHamiltonianDraw(state.draftNames);

      // Grava definitivamente no Supabase e recarrega o painel SEM SPOILER
      const { participants, isDrawn } = await saveOfficialDraw(drawRecords);

      saveDraftNames([]);
      setState({
        actionBusy: false,
        confirmDrawStep: 0,
        draftNames: [],
        participants,
        isDrawn,
        error: '',
        feedback:
          'Sorteio oficial realizado e salvo permanentemente! Agora envie o convite para cada participante.'
      });
    } catch (err) {
      setState({
        actionBusy: false,
        confirmDrawStep: 0,
        error: err.message || 'Não foi possível concluir o sorteio oficial.'
      });
    }
  }

  async function handleCopyInvite(participant) {
    const message = buildInviteMessage(participant);
    const success = await copyToClipboard(message);

    if (copyTimeoutId) {
      window.clearTimeout(copyTimeoutId);
    }

    if (success) {
      setState({ copiedId: participant.id, error: '' });
      copyTimeoutId = window.setTimeout(() => {
        setState({ copiedId: null });
      }, 2400);
    } else {
      setState({
        error: 'Não foi possível copiar automaticamente. Use o botão "Abrir no WhatsApp".'
      });
    }
  }

  async function handleConfirmReset(event) {
    event.preventDefault();
    if (state.actionBusy) return;

    if (state.resetPasswordInput !== configuredPassword) {
      setState({ resetError: 'Senha do organizador incorreta.' });
      return;
    }

    setState({ actionBusy: true, resetError: '' });

    try {
      await resetOfficialDraw();
      setState({
        actionBusy: false,
        resetModalOpen: false,
        resetPasswordInput: '',
        resetError: '',
        isDrawn: false,
        participants: [],
        feedback: 'Sorteio resetado com sucesso. Você já pode cadastrar uma nova lista.'
      });
    } catch (err) {
      setState({
        actionBusy: false,
        resetError: err.message || 'Erro ao resetar o sorteio.'
      });
    }
  }

  function renderLoginView() {
    return `
      <main class="app-shell">
        <section class="card card--admin" aria-labelledby="admin-login-title">
          <div class="admin-topbar">
            <span class="admin-tag">Área do Organizador</span>
            <button type="button" id="btn-back-home" class="admin-link">Voltar ao início</button>
          </div>

          <h1 id="admin-login-title" class="title">Painel do Sorteio</h1>
          <p class="subtitle">Digite a senha de organizador para gerenciar os participantes.</p>

          ${
            !isPasswordConfigured
              ? `<div class="alert alert--info" role="alert">
                   A variável <strong>VITE_ADMIN_PASSWORD</strong> ainda não foi configurada neste ambiente.
                 </div>`
              : ''
          }

          ${
            state.loginError
              ? `<div class="alert alert--error" role="alert">${escapeHtml(state.loginError)}</div>`
              : ''
          }

          <form id="admin-login-form" class="button-stack" novalidate>
            <div class="field-group">
              <label for="admin-password-input" class="field-label">Senha do organizador</label>
              <div class="password-row">
                <input
                  id="admin-password-input"
                  class="text-input"
                  type="${state.showPassword ? 'text' : 'password'}"
                  autocomplete="current-password"
                  placeholder="Digite a senha"
                  required
                />
                <button
                  type="button"
                  id="btn-toggle-password"
                  class="toggle-password-btn"
                  aria-label="${state.showPassword ? 'Ocultar senha' : 'Mostrar senha'}"
                >
                  ${state.showPassword ? 'Ocultar' : 'Mostrar'}
                </button>
              </div>
            </div>

            <button type="submit" class="btn btn--primary">Entrar no Painel</button>
          </form>
        </section>
      </main>
    `;
  }

  function renderPreDrawSection() {
    const count = state.draftNames.length;
    const canDraw = count >= MIN_PARTICIPANTS && !state.actionBusy;

    return `
      <section class="card card--admin" aria-labelledby="pre-draw-title">
        <div>
          <h2 id="pre-draw-title" class="title">1. Lista de Participantes</h2>
          <p class="field-hint">
            Cole todos os nomes (um por linha) ou adicione um por vez. Mínimo de ${MIN_PARTICIPANTS} pessoas.
          </p>
        </div>

        <div class="field-group">
          <label for="bulk-names-textarea" class="field-label">Colar lista de nomes (um por linha)</label>
          <textarea
            id="bulk-names-textarea"
            class="text-area"
            placeholder="Vovó Maria&#10;Tio João&#10;Tia Ana&#10;Carlos"
          >${escapeHtml(state.bulkText)}</textarea>
          <button type="button" id="btn-load-bulk" class="btn btn--secondary btn--compact">
            Carregar lista de uma vez
          </button>
        </div>

        <div class="divider"></div>

        <form id="single-name-form" class="field-group" novalidate>
          <label for="single-name-input" class="field-label">Adicionar nome individualmente</label>
          <div class="inline-add-row">
            <input
              id="single-name-input"
              class="text-input"
              type="text"
              placeholder="Nome do participante"
              value="${escapeHtml(state.singleName)}"
            />
            <button type="submit" class="btn btn--primary">Adicionar</button>
          </div>
        </form>

        <div class="divider"></div>

        <div class="field-group">
          <span class="field-label">
            Participantes prontos (${count})
          </span>
          ${
            count === 0
              ? `<p class="field-hint">Nenhum participante adicionado ainda.</p>`
              : `<ul class="draft-list">
                  ${state.draftNames
                    .map(
                      (name, index) => `
                        <li class="draft-item">
                          <span class="draft-item__name">${index + 1}. ${escapeHtml(name)}</span>
                          <button
                            type="button"
                            class="remove-btn"
                            data-remove-index="${index}"
                            aria-label="Remover ${escapeHtml(name)}"
                          >
                            Remover
                          </button>
                        </li>
                      `
                    )
                    .join('')}
                </ul>`
          }
        </div>

        <div class="divider"></div>

        <button
          type="button"
          id="btn-start-draw"
          class="btn btn--confirm"
          ${canDraw ? '' : 'disabled'}
        >
          Realizar Sorteio Oficial
        </button>
        ${
          count < MIN_PARTICIPANTS
            ? `<p class="field-hint">Adicione pelo menos ${MIN_PARTICIPANTS} nomes para garantir um ciclo único sem pares isolados.</p>`
            : ''
        }
      </section>
    `;
  }

  function renderPostDrawSection() {
    const total = state.participants.length;
    const seenCount = state.participants.filter((p) => Boolean(p.visualizado_em)).length;
    const pendingCount = total - seenCount;

    return `
      <section class="card card--admin" aria-labelledby="post-draw-title">
        <div>
          <h2 id="post-draw-title" class="title">Sorteio Oficial Realizado</h2>
          <p class="field-hint">
            Os nomes sorteados estão bloqueados e ocultos para que você também participe sem spoiler.
          </p>
        </div>

        <p class="no-spoiler-note">
          🔒 Modo Sem Spoiler ativo: nenhum resultado do sorteio é exibido nesta tela.
        </p>

        <div class="stats-grid" aria-label="Resumo de visualizações">
          <div class="stat-box stat-box--seen">
            <span class="stat-box__number">${seenCount}/${total}</span>
            <span class="stat-box__label">✅ Já viram</span>
          </div>
          <div class="stat-box stat-box--pending">
            <span class="stat-box__number">${pendingCount}</span>
            <span class="stat-box__label">⏳ Pendentes</span>
          </div>
        </div>

        <button
          type="button"
          id="btn-refresh-status"
          class="btn btn--secondary btn--compact"
          ${state.loading ? 'disabled' : ''}
        >
          ${state.loading ? 'Atualizando...' : 'Atualizar status'}
        </button>

        <div class="participant-list">
          ${state.participants
            .map((participant) => {
              const hasViewed = Boolean(participant.visualizado_em);
              const viewedLabel = hasViewed
                ? `✅ Já viu${formatDateTimeBr(participant.visualizado_em) ? ` (${formatDateTimeBr(participant.visualizado_em)})` : ''}`
                : '⏳ Pendente';
              const inviteMsg = buildInviteMessage(participant);
              const waUrl = `https://wa.me/?text=${encodeURIComponent(inviteMsg)}`;
              const isCopied = state.copiedId === participant.id;

              return `
                <article class="participant-card">
                  <div class="participant-card__top">
                    <h3 class="participant-card__name">${escapeHtml(participant.nome)}</h3>
                    <span class="code-pill" aria-label="Código ${escapeHtml(participant.codigo)}">
                      ${escapeHtml(participant.codigo)}
                    </span>
                  </div>

                  <div class="participant-card__meta">
                    <span class="status-pill ${hasViewed ? 'status-pill--seen' : 'status-pill--pending'}">
                      ${escapeHtml(viewedLabel)}
                    </span>
                  </div>

                  <div class="participant-card__actions">
                    <button
                      type="button"
                      class="btn btn--primary btn--compact"
                      data-copy-id="${escapeHtml(participant.id)}"
                    >
                      ${isCopied ? '✅ Convite copiado!' : 'Copiar convite WhatsApp'}
                    </button>

                    <a
                      class="btn btn--compact whatsapp-link-btn"
                      href="${waUrl}"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Enviar direto no WhatsApp
                    </a>
                  </div>
                </article>
              `;
            })
            .join('')}
        </div>

        <div class="emergency-zone">
          <p class="field-hint">
            Emergência: precisa refazer tudo do zero?
          </p>
          <button type="button" id="btn-open-reset" class="btn btn--ghost-danger">
            Resetar sorteio
          </button>
        </div>
      </section>
    `;
  }

  function renderDrawConfirmModal() {
    if (state.confirmDrawStep === 0) return '';

    const count = state.draftNames.length;

    if (state.confirmDrawStep === 1) {
      return `
        <div class="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="modal-draw-1">
          <div class="modal-card">
            <h2 id="modal-draw-1" class="modal-title">1ª Confirmação — Sorteio Definitivo</h2>
            <p class="modal-text">
              Você conferiu todos os <strong>${count} participantes</strong>? Após realizar o sorteio
              oficial, ele será salvo permanentemente no banco de dados e não poderá ser editado.
            </p>
            <div class="button-stack">
              <button type="button" id="btn-modal-step2" class="btn btn--primary">
                Sim, continuar
              </button>
              <button type="button" id="btn-modal-cancel" class="btn btn--secondary">
                Voltar e revisar nomes
              </button>
            </div>
          </div>
        </div>
      `;
    }

    return `
      <div class="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="modal-draw-2">
        <div class="modal-card">
          <h2 id="modal-draw-2" class="modal-title">2ª Confirmação — Travar Sorteio</h2>
          <p class="modal-text">
            Confirma o sorteio em <strong>ciclo único</strong> para ${count} pessoas agora?
            Ninguém tirará a si mesmo e não haverá subgrupos isolados.
          </p>
          <div class="button-stack">
            <button
              type="button"
              id="btn-modal-confirm-draw"
              class="btn btn--confirm"
              ${state.actionBusy ? 'disabled' : ''}
            >
              ${state.actionBusy ? 'Sorteando e salvando...' : 'Confirmar Sorteio Oficial'}
            </button>
            <button
              type="button"
              id="btn-modal-cancel"
              class="btn btn--secondary"
              ${state.actionBusy ? 'disabled' : ''}
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>
    `;
  }

  function renderResetModal() {
    if (!state.resetModalOpen) return '';

    return `
      <div class="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="modal-reset-title">
        <div class="modal-card">
          <h2 id="modal-reset-title" class="modal-title">Resetar Sorteio (Emergência)</h2>
          <p class="modal-text">
            Esta ação <strong>apaga permanentemente</strong> todos os códigos e o sorteio atual do
            banco de dados. Digite a senha do organizador para confirmar.
          </p>

          ${
            state.resetError
              ? `<div class="alert alert--error" role="alert">${escapeHtml(state.resetError)}</div>`
              : ''
          }

          <form id="reset-confirm-form" class="button-stack" novalidate>
            <div class="field-group">
              <label for="reset-password-input" class="field-label">Senha do organizador</label>
              <input
                id="reset-password-input"
                class="text-input"
                type="password"
                placeholder="Digite a senha"
                value="${escapeHtml(state.resetPasswordInput)}"
                ${state.actionBusy ? 'disabled' : ''}
              />
            </div>

            <button
              type="submit"
              class="btn btn--danger"
              ${state.actionBusy ? 'disabled' : ''}
            >
              ${state.actionBusy ? 'Apagando...' : 'Confirmar Reset'}
            </button>

            <button
              type="button"
              id="btn-cancel-reset"
              class="btn btn--secondary"
              ${state.actionBusy ? 'disabled' : ''}
            >
              Cancelar
            </button>
          </form>
        </div>
      </div>
    `;
  }

  function renderDashboardView() {
    return `
      <main class="app-shell app-shell--admin">
        <header class="admin-header">
          <div class="admin-topbar">
            <span class="admin-tag">Painel Organizador</span>
            <div>
              <button type="button" id="btn-back-home" class="admin-link">Tela pública</button>
              <button type="button" id="btn-logout" class="admin-link">Sair</button>
            </div>
          </div>
        </header>

        ${
          state.error
            ? `<div class="alert alert--error" style="margin-bottom: 14px;" role="alert">${escapeHtml(state.error)}</div>`
            : ''
        }

        ${
          state.feedback
            ? `<div class="alert alert--success" style="margin-bottom: 14px;" role="status">${escapeHtml(state.feedback)}</div>`
            : ''
        }

        ${
          state.loading && !state.isDrawn && state.participants.length === 0
            ? `<section class="card card--centered"><p class="subtitle">Carregando dados do sorteio...</p></section>`
            : state.isDrawn
              ? renderPostDrawSection()
              : renderPreDrawSection()
        }

        ${renderDrawConfirmModal()}
        ${renderResetModal()}
      </main>
    `;
  }

  function bindEvents() {
    container.querySelector('#btn-back-home')?.addEventListener('click', () => {
      onNavigateHome();
    });

    if (!state.authenticated) {
      container.querySelector('#admin-login-form')?.addEventListener('submit', handleLoginSubmit);
      container.querySelector('#btn-toggle-password')?.addEventListener('click', () => {
        const input = container.querySelector('#admin-password-input');
        const currentValue = input ? input.value : '';
        setState({ showPassword: !state.showPassword });
        const updatedInput = container.querySelector('#admin-password-input');
        if (updatedInput) {
          updatedInput.value = currentValue;
          updatedInput.focus();
        }
      });
      return;
    }

    container.querySelector('#btn-logout')?.addEventListener('click', handleLogout);

    if (!state.isDrawn) {
      const bulkTextarea = container.querySelector('#bulk-names-textarea');
      bulkTextarea?.addEventListener('input', (event) => {
        state.bulkText = event.target.value;
      });

      const singleInput = container.querySelector('#single-name-input');
      singleInput?.addEventListener('input', (event) => {
        state.singleName = event.target.value;
      });

      container.querySelector('#btn-load-bulk')?.addEventListener('click', handleLoadBulkNames);
      container.querySelector('#single-name-form')?.addEventListener('submit', handleAddSingleName);

      container.querySelectorAll('[data-remove-index]').forEach((button) => {
        button.addEventListener('click', () => {
          const index = Number(button.getAttribute('data-remove-index'));
          handleRemoveDraftName(index);
        });
      });

      container.querySelector('#btn-start-draw')?.addEventListener('click', handleStartOfficialDraw);
    } else {
      container
        .querySelector('#btn-refresh-status')
        ?.addEventListener('click', () => loadAdminData(true));

      container.querySelectorAll('[data-copy-id]').forEach((button) => {
        button.addEventListener('click', () => {
          const id = button.getAttribute('data-copy-id');
          const participant = state.participants.find((p) => p.id === id);
          if (participant) {
            handleCopyInvite(participant);
          }
        });
      });

      container.querySelector('#btn-open-reset')?.addEventListener('click', () => {
        setState({
          resetModalOpen: true,
          resetPasswordInput: '',
          resetError: ''
        });
      });
    }

    // Eventos do modal de confirmação dupla do sorteio
    container.querySelector('#btn-modal-step2')?.addEventListener('click', () => {
      setState({ confirmDrawStep: 2 });
    });
    container
      .querySelector('#btn-modal-confirm-draw')
      ?.addEventListener('click', handleConfirmOfficialDraw);
    container.querySelector('#btn-modal-cancel')?.addEventListener('click', () => {
      setState({ confirmDrawStep: 0 });
    });

    // Eventos do modal de reset de emergência
    const resetInput = container.querySelector('#reset-password-input');
    resetInput?.addEventListener('input', (event) => {
      state.resetPasswordInput = event.target.value;
    });
    container.querySelector('#reset-confirm-form')?.addEventListener('submit', handleConfirmReset);
    container.querySelector('#btn-cancel-reset')?.addEventListener('click', () => {
      setState({ resetModalOpen: false, resetPasswordInput: '', resetError: '' });
    });
  }

  function render() {
    container.innerHTML = state.authenticated ? renderDashboardView() : renderLoginView();
    bindEvents();
  }

  render();

  if (state.authenticated) {
    loadAdminData(false);
  }

  return () => {
    if (copyTimeoutId) {
      window.clearTimeout(copyTimeoutId);
    }
  };
}
