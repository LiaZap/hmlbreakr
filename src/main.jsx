import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ClerkProvider } from '@clerk/clerk-react'
import { ptBR } from '@clerk/localizations'
import './index.css'
import App from './App.jsx'
import { DashboardProvider } from './context/DashboardContext'

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

const clerkAppearance = {
  variables: {
    colorPrimary: '#F5A623',
    colorBackground: 'transparent',
    colorText: '#ffffff',
    colorTextSecondary: '#868686',
    colorInputBackground: '#1E1E1E',
    colorInputText: '#ffffff',
    colorDanger: '#EF4444',
    borderRadius: '14px',
    colorNeutral: '#868686',
  },
  layout: {
    logoPlacement: 'none',
    showOptionalFields: false,
    socialButtonsVariant: 'blockButton',
  },
  elements: {
    card: 'bg-transparent shadow-none border-0 p-0',
    headerTitle: 'hidden',
    headerSubtitle: 'hidden',
    header: 'hidden',
    footer: 'hidden',
    socialButtonsBlockButton: 'bg-[#1E1E1E] border border-[#2A2A2C] text-white hover:bg-[#252527]',
    formButtonPrimary: 'bg-[#F5A623] text-black font-bold rounded-[14px] h-[52px] text-[15px] hover:bg-[#E5961E]',
    formFieldInput: 'bg-[#1E1E1E] border border-[#2A2A2C] text-white rounded-[14px]',
    formFieldLabel: 'text-[#868686] text-[12px] font-semibold uppercase tracking-wider',
    dividerLine: 'bg-[#2A2A2C]',
    dividerText: 'text-[#555]',
    footerActionLink: 'text-[#F5A623]',
    formFieldAction: 'text-[#F5A623]',
    identityPreviewEditButton: 'text-[#F5A623]',
    formFieldInputShowPasswordButton: 'text-[#868686]',
    otpCodeFieldInput: 'bg-[#1E1E1E] border border-[#2A2A2C] text-white',
    alertText: 'text-[#EF4444]',
  },
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ClerkProvider
      publishableKey={PUBLISHABLE_KEY || 'pk_dummy'}
      localization={ptBR}
      appearance={clerkAppearance}
    >
      <DashboardProvider>
        <App />
      </DashboardProvider>
    </ClerkProvider>
  </StrictMode>,
)
