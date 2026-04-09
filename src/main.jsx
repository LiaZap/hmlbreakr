import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ClerkProvider } from '@clerk/clerk-react'
import { ptBR } from '@clerk/localizations'
import './index.css'
import App from './App.jsx'
import { DashboardProvider } from './context/DashboardContext'

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ClerkProvider
      publishableKey={PUBLISHABLE_KEY}
      localization={ptBR}
      appearance={{
        variables: {
          colorPrimary: '#F5A623',
          colorBackground: '#111111',
          colorText: '#ffffff',
          colorTextSecondary: '#868686',
          colorInputBackground: '#1E1E1E',
          colorInputText: '#ffffff',
          colorDanger: '#EF4444',
          borderRadius: '12px',
        },
        layout: {
          logoImageUrl: '/bolt.svg',
          logoPlacement: 'none',
          showOptionalFields: false,
          socialButtonsVariant: 'blockButton',
        },
      }}
    >
      <DashboardProvider>
        <App />
      </DashboardProvider>
    </ClerkProvider>
  </StrictMode>,
)
