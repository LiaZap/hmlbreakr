/* eslint-disable react-hooks/set-state-in-effect */
import React, { useState, useEffect } from 'react';
import SplashScreen from './components/SplashScreen';
import LandingPage from './components/LandingPage';
import Dashboard from './components/Dashboard';
import ClientLogin from './components/ClientLogin';
import AdminPanel from './components/admin/AdminPanel';
import { useDashboard } from './context/DashboardContext';

function App() {
  const { dashboardData, clientDataError, clientDataLoaded } = useDashboard();
  const [currentPage, setCurrentPage] = useState('loading');
  const [splashDone, setSplashDone] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const hash = params.get('hash');
    const adminSession = sessionStorage.getItem('breaker-admin');

    if (hash) {
      setCurrentPage('splash');
    } else if (adminSession) {
      setCurrentPage('admin-panel');
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
      if (dashboardData?.formData && Object.keys(dashboardData.formData).length > 0) {
        setCurrentPage('dashboard');
      } else {
        setCurrentPage('landing');
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

  if (currentPage === 'loading') return null;

  return (
    <>
      {/* UNIFIED LOGIN */}
      {currentPage === 'client-login' && (
        <ClientLogin onLogin={handleClientLogin} onAdminLogin={handleAdminLogin} />
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
