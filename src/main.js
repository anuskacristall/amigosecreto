import './styles/main.css';
import { mountAdminView } from './views/adminView.js';
import { mountParticipantView } from './views/participantView.js';

const appRoot = document.getElementById('app');
let cleanupCurrentView = null;

function isAdminRoute() {
  const pathname = window.location.pathname.replace(/\/+$/, '') || '/';
  return pathname === '/admin' || window.location.hash === '#/admin';
}

function navigate(path) {
  if (window.location.pathname !== path) {
    window.history.pushState({}, '', path);
  }
  renderRoute();
}

function renderRoute() {
  if (typeof cleanupCurrentView === 'function') {
    cleanupCurrentView();
    cleanupCurrentView = null;
  }

  if (isAdminRoute()) {
    document.title = 'Painel Organizador — Amigo Oculto';
    cleanupCurrentView = mountAdminView(appRoot, {
      onNavigateHome: () => navigate('/')
    });
  } else {
    document.title = 'Amigo Oculto da Família';
    cleanupCurrentView = mountParticipantView(appRoot);
  }
}

window.addEventListener('popstate', renderRoute);
renderRoute();
