/* eslint-disable react-hooks/set-state-in-effect */
import React, { useState, useEffect } from 'react';
import { useAuth } from '@clerk/clerk-react';
import SplashScreen from './components/SplashScreen';
import LandingPage from './components/LandingPage';
import Dashboard from './components/Dashboard';
import ClientLogin from './components/ClientLogin';
import AdminPanel from './components/admin/AdminPanel';
import DemoPage from './components/DemoPage';
import AgencyPanel from './components/agency/AgencyPanel';
import { useDashboard } from './context/DashboardContext';

const API_URL = import.meta.env.VITE_API_URL || '';

function App() {
  const { dashboardData, clientDataError, clientDataLoaded } = useDashboard();
  const { isLoaded: clerkLoaded, isSignedIn, getToken } = useAuth();
  const [currentPage, setCurrentPage] = useState('loading');
  const [splashDone, setSplashDone] = useState(false);
  const [agencyHash, setAgencyHash] = useState(null);

  useEffect(() => {
    if (!clerkLoaded) return;

    const params = new URLSearchParams(window.location.search);
    const hash = params.get('hash');
    const agency = params.get('agency');
    const demo = params.get('demo');
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
    } else if (isSignedIn) {
      // Clerk user is signed in — resolve their hash
      setCurrentPage('resolving-clerk');
    } else {
      setCurrentPage('client-login');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clerkLoaded]);

  // When Clerk sign-in happens while already on the login page
  useEffect(() => {
    if (!clerkLoaded || !isSignedIn) return;
    if (currentPage === 'client-login' || currentPage === 'resolving-clerk') {
      resolveClerkHash();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clerkLoaded, isSignedIn]);

  const resolveClerkHash = async () => {
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/api/clerk/me`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const { hash } = await res.json();
        window.location.href = `${window.location.pathname}?hash=${hash}`;
      } else {
        setCurrentPage('client-login');
      }
    } catch {
      setCurrentPage('client-login');
    }
  };

  // If API returns error for the hash, redirect to login
  useEffect(() => {
    if (clientDataError && currentPage === 'splash') {
      window.location.href = window.location.pathname;
    }
  }, [clientDataError, currentPage]);

  const handleSplashComplete = () => {
    setSplashDone(true);
  };

  useEffect(() => {
    if (splashDone && clientDataLoaded && currentPage !== 'landing') {
      const fd = dashboardData?.formData;
      const finished = fd?.onboarding_completed || (fd?.revenue_history && fd.revenue_history.length > 0);
      if (finished) {
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

      {currentPage === 'admin-panel' && (
        <AdminPanel />
      )}

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
