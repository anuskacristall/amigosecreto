import { launchCelebrationConfetti, stopConfetti } from '../lib/confetti.js';
import { escapeHtml } from '../lib/dom.js';
import {
  findParticipantByCode,
  isSupabaseConfigured,
  markParticipantAsViewed
} from '../lib/supabase.js';

const GIFT_ICON_SVG = `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <rect x="3" y="8" width="18" height="4" rx="1"></rect>
    <path d="M12 8v13"></path>
    <path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"></path>
    <path d="M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8s1-5 4.5-5a2.5 2.5 0 0 1 0 5"></path>
  </svg>
`;

const USER_CHECK_ICON_SVG = `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <circle cx="12" cy="8" r="4"></circle>
    <path d="M5 20a7 7 0 0 1 14 0"></path>
  </svg>
`;

const SPARKLES_ICON_SVG = `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9L12 3z"></path>
    <path d="M5 17l.9 2.1L8 20l-2.1.9L5 23l-.9-2.1L2 20l2.1-.9L5 17z"></path>
    <path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15z"></path>
  </svg>
`;

export function mountParticipantView(container) {
  const state = {
    step: 'code', // 'code' | 'confirm' | 'reveal'
    code: '',
    loading: false,
    error: '',
    notice: '',
    participant: null
  };

  function setState(partial) {
    Object.assign(state, partial);
    render();
  }

  async function handleCodeSubmit(event) {
    event.preventDefault();
    if (state.loading) return;

    const cleanCode = state.code.replace(/\D/g, '').slice(0, 2);

    if (cleanCode.length !== 2) {
      setState({
        code: cleanCode,
        error: 'Digite os 2 números que você recebeu no WhatsApp (exemplo: 07 ou 42).',
        notice: ''
      });
      focusCodeInput();
      return;
    }

    if (!isSupabaseConfigured) {
      setState({
        error:
          'O sistema ainda está sendo configurado pelo organizador. Tente novamente em alguns instantes.',
        notice: ''
      });
      return;
    }

    setState({ loading: true, error: '', notice: '' });

    try {
      const participant = await findParticipantByCode(cleanCode);

      if (!participant) {
        setState({
          loading: false,
          error: `O número ${cleanCode} não foi encontrado. Confira no WhatsApp e digite novamente.`
        });
        focusCodeInput(true);
        return;
      }

      if (!participant.amigo_sorteado) {
        setState({
          loading: false,
          error: 'O sorteio ainda não foi finalizado pelo organizador. Aguarde o aviso no WhatsApp.'
        });
        return;
      }

      setState({
        loading: false,
        error: '',
        participant,
        step: 'confirm'
      });
    } catch (err) {
      setState({
        loading: false,
        error: err.message || 'Erro de conexão. Verifique sua internet e tente novamente.'
      });
    }
  }

  async function handleConfirmIdentity() {
    if (state.loading || !state.participant) return;

    setState({ loading: true, error: '' });

    try {
      if (!state.participant.visualizado_em) {
        const viewedAt = await markParticipantAsViewed(state.participant.id);
        state.participant = {
          ...state.participant,
          visualizado_em: viewedAt
        };
      }
    } catch {
      // Mesmo em caso de instabilidade ao gravar o horário, não bloqueamos o participante de ver seu resultado
    }

    setState({
      loading: false,
      step: 'reveal'
    });

    launchCelebrationConfetti();
  }

  function handleWrongPerson() {
    stopConfetti();
    setState({
      step: 'code',
      code: '',
      participant: null,
      error: '',
      notice: ''
    });
    focusCodeInput();
  }

  function handleHideResult() {
    stopConfetti();
    setState({
      step: 'code',
      code: '',
      participant: null,
      error: '',
      notice: 'Resultado ocultado com segurança. Se precisar ver de novo, basta digitar seu número.'
    });
    focusCodeInput();
  }

  function focusCodeInput(selectAll = false) {
    window.requestAnimationFrame(() => {
      const input = container.querySelector('#secret-code-input');
      if (!input) return;
      input.focus({ preventScroll: true });
      if (selectAll) {
        input.select();
      }
    });
  }

  function renderCodeStep() {
    return `
      <main class="app-shell">
        <section class="card card--centered" aria-labelledby="page-title">
          <div class="festive-badge">${GIFT_ICON_SVG}</div>

          <h1 id="page-title" class="title">Amigo Oculto da Família</h1>

          <p class="subtitle">
            Digite o número de 2 dígitos que você recebeu no WhatsApp
          </p>

          ${
            state.notice
              ? `<div class="alert alert--success" role="status">${escapeHtml(state.notice)}</div>`
              : ''
          }

          ${
            state.error
              ? `<div class="alert alert--error" role="alert">${escapeHtml(state.error)}</div>`
              : ''
          }

          <form id="code-form" class="code-form" novalidate>
            <label for="secret-code-input" class="sr-only">
              Número secreto de 2 dígitos
            </label>
            <input
              id="secret-code-input"
              class="code-input"
              type="text"
              inputmode="numeric"
              pattern="[0-9]*"
              maxlength="2"
              autocomplete="one-time-code"
              enterkeyhint="go"
              placeholder="00"
              value="${escapeHtml(state.code)}"
              aria-invalid="${state.error ? 'true' : 'false'}"
              ${state.loading ? 'disabled' : ''}
            />

            <button
              type="submit"
              class="btn btn--primary"
              ${state.loading ? 'disabled' : ''}
            >
              ${state.loading ? 'Consultando...' : 'Continuar'}
            </button>
          </form>
        </section>
      </main>
    `;
  }

  function renderConfirmStep() {
    const participantName = escapeHtml(state.participant?.nome ?? '');

    return `
      <main class="app-shell">
        <section class="card card--centered" aria-labelledby="confirm-title">
          <div class="festive-badge festive-badge--confirm">${USER_CHECK_ICON_SVG}</div>

          <p id="confirm-title" class="question-label">Você é</p>

          <h1 class="participant-name-highlight">${participantName}?</h1>

          <div class="button-stack">
            <button
              type="button"
              id="btn-confirm-yes"
              class="btn btn--confirm"
              ${state.loading ? 'disabled' : ''}
            >
              ${state.loading ? 'Abrindo...' : 'Sim, sou eu'}
            </button>

            <button
              type="button"
              id="btn-confirm-no"
              class="btn btn--secondary"
              ${state.loading ? 'disabled' : ''}
            >
              Não, digitar outro número
            </button>
          </div>
        </section>
      </main>
    `;
  }

  function renderRevealStep() {
    const drawnName = escapeHtml(state.participant?.amigo_sorteado ?? '');

    return `
      <main class="app-shell">
        <section class="card card--centered" aria-labelledby="reveal-title">
          <div class="festive-badge">${SPARKLES_ICON_SVG}</div>

          <div class="reveal-box" aria-live="polite">
            <p id="reveal-title" class="reveal-caption">Seu Amigo Oculto é:</p>
            <h1 class="reveal-name">${drawnName}</h1>
          </div>

          <p class="friendly-tip">
            Anote ou tire um print desta tela para não esquecer!
          </p>

          <button type="button" id="btn-hide-result" class="btn btn--secondary">
            Ocultar resultado
          </button>
        </section>
      </main>
    `;
  }

  function bindEvents() {
    if (state.step === 'code') {
      const form = container.querySelector('#code-form');
      const input = container.querySelector('#secret-code-input');

      input?.addEventListener('input', (event) => {
        const digitsOnly = event.target.value.replace(/\D/g, '').slice(0, 2);
        event.target.value = digitsOnly;
        state.code = digitsOnly;

        if (state.error || state.notice) {
          state.error = '';
          state.notice = '';
          const alerts = container.querySelectorAll('.alert');
          alerts.forEach((el) => el.remove());
          input.setAttribute('aria-invalid', 'false');
        }
      });

      form?.addEventListener('submit', handleCodeSubmit);
    } else if (state.step === 'confirm') {
      container.querySelector('#btn-confirm-yes')?.addEventListener('click', handleConfirmIdentity);
      container.querySelector('#btn-confirm-no')?.addEventListener('click', handleWrongPerson);
    } else if (state.step === 'reveal') {
      container.querySelector('#btn-hide-result')?.addEventListener('click', handleHideResult);
    }
  }

  function render() {
    if (state.step === 'code') {
      container.innerHTML = renderCodeStep();
    } else if (state.step === 'confirm') {
      container.innerHTML = renderConfirmStep();
    } else {
      container.innerHTML = renderRevealStep();
    }

    bindEvents();
  }

  render();
  focusCodeInput();

  return () => {
    stopConfetti();
  };
}
