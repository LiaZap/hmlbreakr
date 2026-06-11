/* eslint-disable react-hooks/set-state-in-effect */
import React, { useState, useEffect, useRef } from 'react';
import { useAuth, useClerk } from '@clerk/clerk-react';
import SplashScreen from './components/SplashScreen';
import LandingPage from './components/LandingPage';
import Dashboard from './components/Dashboard';
import ClientLogin from './components/ClientLogin';
import AdminPanel from './components/admin/AdminPanel';
import DemoPage from './components/DemoPage';
import AgencyPanel from './components/agency/AgencyPanel';
import PoliticaPrivacidade from './components/PoliticaPrivacidade';
import EditingConflictModal from './components/EditingConflictModal';
import { useDashboard } from './context/DashboardContext';
import { useEditingConflictDetector } from './hooks/useEditingConflictDetector';

const API_URL = import.meta.env.VITE_API_URL || '';

// Rotas publicas (renderizadas ANTES de qualquer check de auth/clerk) —
// paginas legais/institucionais que precisam ser acessiveis a qualquer
// um, indexaveis e linkaveis externamente.
const PUBLIC_ROUTES = {
  '/privacidade': PoliticaPrivacidade,
  '/politica-de-privacidade': PoliticaPrivacidade, // alias amigavel
};

function App() {
  // Hooks SEMPRE rodam na mesma ordem (regra do React). Decisao de
  // renderizar publico vs autenticado vem APOS todos os hooks.
  const pathname = typeof window !== 'undefined' ? window.location.pathname : '/';
  const PublicComponent = PUBLIC_ROUTES[pathname];

  const { dashboardData, clientDataError, clientDataLoaded } = useDashboard();
  const { isLoaded: clerkLoaded, isSignedIn, getToken } = useAuth();
  const { signOut } = useClerk();
  const [currentPage, setCurrentPage] = useState('loading');
  const [splashDone, setSplashDone] = useState(false);
  const [agencyHash, setAgencyHash] = useState(null);
  const [routingDone, setRoutingDone] = useState(false);
  const clerkResolveFailed = useRef(false);

  // Detector de edicao concorrente — so ativa quando estamos no
  // dashboard (cliente logado). Pollea /api/client/:hash/version cada 30s
  // e dispara modal se outra sessao tiver salvo no meio.
  const currentHash = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).get('hash')
    : null;
  const localVersion = Number(dashboardData?._dataVersion) || 0;
  const conflictHash = currentPage === 'dashboard' ? currentHash : null;
  const { conflict, dismiss: dismissConflict, reload: reloadFromConflict } =
    useEditingConflictDetector(conflictHash, localVersion);

  const doRouting = (signedIn) => {
    if (routingDone) return;
    const params = new URLSearchParams(window.location.search);
    const hash = params.get('hash');
    const agency = params.get('agency');
    const demo = params.get('demo');
    // Admin-view mode via URL: quando admin clica "Acessar" no painel, abre com ?adminView=1
    // Essa aba nova não tem o sessionStorage da aba admin (isolado), então precisamos setar aqui
    const adminView = params.get('adminView');
    const adminRoleParam = params.get('adminRole');
    const adminNameParam = params.get('adminName');
    if (adminView === '1' && hash) {
      sessionStorage.setItem('breaker-admin', 'true');
      if (adminRoleParam) sessionStorage.setItem('breaker-admin-role', adminRoleParam);
      if (adminNameParam) sessionStorage.setItem('breaker-admin-name', adminNameParam);
      // Limpar params da URL pra não poluir o histórico (mantém só o hash)
      const cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete('adminView');
      cleanUrl.searchParams.delete('adminRole');
      cleanUrl.searchParams.delete('adminName');
      window.history.replaceState({}, '', cleanUrl.toString());
    }
    const adminSession = sessionStorage.getItem('breaker-admin');
    const agencySession = sessionStorage.getItem('breaker-agency');

    if (demo === 'true') {
      setCurrentPage('demo');
    } else if (agency) {
      setAgencyHash(agency);
      setCurrentPage('agency-panel');
    } else if (hash) {
      setCurrentPage('splash');
    } else if (adminSession) {
      setCurrentPage('admin-panel');
    } else if (agencySession) {
      setAgencyHash(agencySession);
      setCurrentPage('agency-panel');
    } else if (signedIn) {
      setCurrentPage('resolving-clerk');
    } else {
      setCurrentPage('client-login');
    }
    setRoutingDone(true);
  };

  // When Clerk loads, route normally
  useEffect(() => {
    if (clerkLoaded) doRouting(isSignedIn);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clerkLoaded]);

  // Safety timeout: if Clerk doesn't load within 3s, route without it
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!routingDone) {
        console.warn('Clerk timeout — routing without auth');
        doRouting(false);
      }
    }, 3000);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When user signs in via Clerk while on the login page
  useEffect(() => {
    if (!clerkLoaded || !isSignedIn || clerkResolveFailed.current) return;
    if (currentPage === 'client-login' || currentPage === 'resolving-clerk') {
      resolveClerkHash();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clerkLoaded, isSignedIn, currentPage]);

  const resolveClerkHash = async () => {
    if (clerkResolveFailed.current) return;
    setCurrentPage('resolving-clerk');
    try {
      const token = await getToken();
      if (!token) {
        console.error('Clerk: no token available');
        clerkResolveFailed.current = true;
        await signOut();
        setCurrentPage('client-login');
        return;
      }
      const res = await fetch(`${API_URL}/api/clerk/me`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const { hash } = await res.json();
        window.location.href = `${window.location.pathname}?hash=${hash}`;
      } else {
        const errData = await res.json().catch(() => ({}));
        console.error('Clerk /me failed:', res.status, errData);
        clerkResolveFailed.current = true;
        await signOut();
        setCurrentPage('client-login');
      }
    } catch (err) {
      console.error('Clerk resolve error:', err);
      clerkResolveFailed.current = true;
      await signOut();
      setCurrentPage('client-login');
    }
  };

  // If API returns error for the hash, redirect to login
  useEffect(() => {
    if (clientDataError && currentPage === 'splash') {
      window.location.href = window.location.pathname;
    }
  }, [clientDataError, currentPage]);

  const handleSplashComplete = () => setSplashDone(true);

  useEffect(() => {
    if (splashDone && clientDataLoaded && currentPage !== 'landing') {
      const fd = dashboardData?.formData;
      const finished = fd?.onboarding_completed || (fd?.revenue_history && fd.revenue_history.length > 0);
      setCurrentPage(finished ? 'dashboard' : 'landing');
    }
  }, [splashDone, clientDataLoaded, dashboardData]);

  const handleOnboardingComplete = () => setCurrentPage('dashboard');

  const handleClientLogin = (hash) => {
    window.location.href = `${window.location.pathname}?hash=${hash}`;
  };

  const handleAdminLogin = (adminRole) => {
    sessionStorage.setItem('breaker-admin', 'true');
    sessionStorage.setItem('breaker-admin-role', adminRole || 'admin');
    setCurrentPage('admin-panel');
  };

  const handleAgencyLogin = (hash) => {
    sessionStorage.setItem('breaker-agency', hash);
    setAgencyHash(hash);
    setCurrentPage('agency-panel');
  };

  const handleAgencyLogout = () => {
    sessionStorage.removeItem('breaker-agency');
    setAgencyHash(null);
    const url = new URL(window.location.href);
    url.searchParams.delete('agency');
    window.history.replaceState({}, '', url.toString());
    setCurrentPage('client-login');
  };

  // Rotas publicas (Politica de Privacidade, etc) — short-circuit apos hooks.
  // Apenas detectadas pela pathname; nao dependem de auth.
  if (PublicComponent) {
    return <PublicComponent />;
  }

  // Loading spinner
  if (currentPage === 'loading' || currentPage === 'resolving-clerk') {
    return (
      <div className="fixed inset-0 bg-[#1D1D1D] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#F5A623]/30 border-t-[#F5A623] rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <>
      {currentPage === 'demo' && <DemoPage />}
      {currentPage === 'client-login' && (
        <ClientLogin onLogin={handleClientLogin} onAdminLogin={handleAdminLogin} onAgencyLogin={handleAgencyLogin} />
      )}
      {currentPage === 'agency-panel' && agencyHash && (
        <AgencyPanel agencyHash={agencyHash} onLogout={handleAgencyLogout} />
      )}
      {currentPage === 'admin-panel' && <AdminPanel />}
      {currentPage === 'splash' && <SplashScreen onComplete={handleSplashComplete} />}
      {currentPage === 'landing' && <LandingPage onComplete={handleOnboardingComplete} />}
      {currentPage === 'dashboard' && <Dashboard />}
      {/* Modal de aviso: edicao concorrente — fica em z-200 sobre tudo */}
      <EditingConflictModal
        conflict={conflict}
        onDismiss={dismissConflict}
        onReload={reloadFromConflict}
      />
    </>
  );
}

export default App;
