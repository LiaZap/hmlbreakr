/* eslint-disable react-hooks/set-state-in-effect */
import React, { useState, useEffect } from 'react';
import SplashScreen from './components/SplashScreen';
import LandingPage from './components/LandingPage';
import Dashboard from './components/Dashboard';
import ClientLogin from './components/ClientLogin';
import AdminPanel from './components/admin/AdminPanel';
import DemoPage from './components/DemoPage';
import AgencyPanel from './components/agency/AgencyPanel';
import { useDashboard } from './context/DashboardContext';

function App() {
  const { dashboardData, clientDataError, clientDataLoaded } = useDashboard();
  const [currentPage, setCurrentPage] = useState('loading');
  const [splashDone, setSplashDone] = useState(false);
  const [agencyHash, setAgencyHash] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const hash = params.get('hash');
    const agency = params.get('agency');
    const demo = params.get('demo');
    const adminSession = sessionStorage.getItem('breaker-admin');
    const agencySession = sessionStorage.getItem('breaker-agency');

    if (demo === 'true') {
      setCurrentPage('demo');
    } else if (agency) {
      // Agency panel via URL param (e.g. after Stripe redirect)
      setAgencyHash(agency);
      setCurrentPage('agency-panel');
    } else if (hash) {
      setCurrentPage('splash');
    } else if (adminSession) {
      setCurrentPage('admin-panel');
    } else if (agencySession) {
      setAgencyHash(agencySession);
      setCurrentPage('agency-panel');
    } else {
      setCurrentPage('client-login');
    }
  }, []);

  // If API returns error for the hash, redirect to login
  useEffect(() => {
    if (clientDataError && currentPage === 'splash') {
      window.location.href = window.location.pathname;
    }
  }, [clientDataError, currentPage]);

  const handleSplashComplete = () => {
    setSplashDone(true);
  };

  // Wait for BOTH splash animation AND data to load before deciding route
  // Also re-evaluates if data changes (e.g. client returns after partial onboarding)
  // but never redirects while client is actively filling the onboarding form
  useEffect(() => {
    if (splashDone && clientDataLoaded && currentPage !== 'landing') {
      const fd = dashboardData?.formData;
      const finished = fd?.onboarding_completed || (fd?.revenue_history && fd.revenue_history.length > 0);
      if (finished) {
        setCurrentPage('dashboard');
      } else {
        setCurrentPage('landing'); // no data or incomplete → show/continue onboarding
      }
    }
  }, [splashDone, clientDataLoaded, dashboardData]);

  const handleOnboardingComplete = () => {
    setCurrentPage('dashboard');
  };

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
    // Clear ?agency= param if present
    const url = new URL(window.location.href);
    url.searchParams.delete('agency');
    window.history.replaceState({}, '', url.toString());
    setCurrentPage('client-login');
  };

  if (currentPage === 'loading') return null;

  return (
    <>
      {/* DEMO MODE — public, no auth */}
      {currentPage === 'demo' && <DemoPage />}

      {/* UNIFIED LOGIN */}
      {currentPage === 'client-login' && (
        <ClientLogin onLogin={handleClientLogin} onAdminLogin={handleAdminLogin} onAgencyLogin={handleAgencyLogin} />
      )}

      {/* AGENCY PANEL */}
      {currentPage === 'agency-panel' && agencyHash && (
        <AgencyPanel agencyHash={agencyHash} onLogout={handleAgencyLogout} />
      )}

      {/* ADMIN PANEL */}
      {currentPage === 'admin-panel' && (
        <AdminPanel />
      )}

      {/* CLIENT FLOW */}
      {currentPage === 'splash' && (
        <SplashScreen onComplete={handleSplashComplete} />
      )}
      {currentPage === 'landing' && (
        <LandingPage onComplete={handleOnboardingComplete} />
      )}
      {currentPage === 'dashboard' && (
        <Dashboard />
      )}
    </>
  );
}

export default App;
