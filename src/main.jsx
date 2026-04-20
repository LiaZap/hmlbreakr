import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ClerkProvider } from '@clerk/clerk-react'
import { dark } from '@clerk/themes'
import { ptBR } from '@clerk/localizations'
import './index.css'
import App from './App.jsx'
import { DashboardProvider } from './context/DashboardContext'

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ClerkProvider
      publishableKey={PUBLISHABLE_KEY || 'pk_dummy'}
      localization={ptBR}
      appearance={{
        baseTheme: dark,
        variables: {
          colorPrimary: '#F5A623',
          colorBackground: 'transparent',
          colorInputBackground: '#1E1E1E',
          colorInputText: '#ffffff',
          colorDanger: '#EF4444',
          borderRadius: '14px',
        },
        layout: {
          logoPlacement: 'none',
          showOptionalFields: false,
          socialButtonsVariant: 'blockButton',
        },
        elements: {
          rootBox: { width: '100%' },
          card: { backgroundColor: 'transparent', boxShadow: 'none', border: 'none', padding: 0, width: '100%' },
          main: { width: '100%' },
          header: { display: 'none' },
          footer: { display: 'none' },
          formButtonPrimary: {
            backgroundColor: '#F5A623',
            color: '#000000',
            fontWeight: '700',
            borderRadius: '14px',
            height: '52px',
            fontSize: '15px',
            width: '100%',
          },
          socialButtons: { width: '100%' },
          socialButtonsBlockButton: {
            width: '100%',
            maxWidth: '100%',
            minWidth: 0,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          },
          socialButtonsBlockButtonText: { fontSize: '14px' },
          formFieldInput: { width: '100%' },
          footerActionLink: { color: '#F5A623' },
          formFieldAction: { color: '#F5A623' },
          identityPreviewEditButton: { color: '#F5A623' },
        },
      }}
    >
      <DashboardProvider>
        <App />
      </DashboardProvider>
    </ClerkProvider>
  </StrictMode>,
)
