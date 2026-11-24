import confetti from 'canvas-confetti';

const FESTIVE_COLORS = [
  '#D97706', // Dourado / âmbar quente
  '#059669', // Verde-esmeralda
  '#EF4444', // Vermelho festivo
  '#3B82F6', // Azul vibrante
  '#EC4899', // Rosa alegre
  '#FACC15', // Amarelo brilhante
  '#8B5CF6'  // Roxo festivo
];

let activeTimers = [];

/**
 * Cancela disparos pendentes caso o usuário saia da tela de revelação rapidamente.
 */
export function stopConfetti() {
  for (const timerId of activeTimers) {
    window.clearTimeout(timerId);
  }
  activeTimers = [];

  if (typeof confetti.reset === 'function') {
    confetti.reset();
  }
}

/**
 * Dispara uma animação leve e festiva de confetes coloridos mantendo
 * o centro do cartão perfeitamente legível.
 */
export function launchCelebrationConfetti() {
  stopConfetti();

  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (prefersReducedMotion) {
    confetti({
      particleCount: 28,
      spread: 55,
      origin: { y: 0.65 },
      colors: FESTIVE_COLORS,
      disableForReducedMotion: false
    });
    return;
  }

  // Salva central inicial
  confetti({
    particleCount: 65,
    spread: 75,
    startVelocity: 38,
    origin: { x: 0.5, y: 0.62 },
    colors: FESTIVE_COLORS,
    zIndex: 50
  });

  // Salvas laterais sutis logo em seguida para efeito comemorativo sem poluir a leitura
  const leftTimer = window.setTimeout(() => {
    confetti({
      particleCount: 38,
      angle: 60,
      spread: 55,
      origin: { x: 0.05, y: 0.68 },
      colors: FESTIVE_COLORS,
      zIndex: 50
    });
  }, 220);

  const rightTimer = window.setTimeout(() => {
    confetti({
      particleCount: 38,
      angle: 120,
      spread: 55,
      origin: { x: 0.95, y: 0.68 },
      colors: FESTIVE_COLORS,
      zIndex: 50
    });
  }, 420);

  activeTimers.push(leftTimer, rightTimer);
}
