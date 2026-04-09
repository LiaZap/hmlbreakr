import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App, { AuthBridge } from './App.jsx'
import { DashboardProvider } from './context/DashboardContext'

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

function Root() {
  if (PUBLISHABLE_KEY) {
    const { ClerkProvider } = require('@clerk/clerk-react')
    const { ptBR } = require('@clerk/localizations')

    return (
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
            logoPlacement: 'none',
            showOptionalFields: false,
            socialButtonsVariant: 'blockButton',
          },
        }}
      >
        <DashboardProvider>
          <AuthBridge>
            <App />
          </AuthBridge>
        </DashboardProvider>
      </ClerkProvider>
    )
  }

  // No Clerk key — run without Clerk (old login still works)
  return (
    <DashboardProvider>
      <AuthBridge>
        <App />
      </AuthBridge>
    </DashboardProvider>
  )
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
