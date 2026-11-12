import { lazy } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout, PublicLayout } from '@/components/Layout'
import { DraftProvider } from '@/hooks/useDraft'
import Landing from '@/pages/Landing'

// Every page except the landing page loads on demand, so a visitor only downloads the code of the pages they open.
const About = lazy(() => import('@/pages/About'))
const Activity = lazy(() => import('@/pages/Activity'))
const Bridge = lazy(() => import('@/pages/Bridge'))
const CampaignDetails = lazy(() => import('@/pages/CampaignDetails'))
const Campaigns = lazy(() => import('@/pages/Campaigns'))
const Claim = lazy(() => import('@/pages/Claim'))
const Create = lazy(() => import('@/pages/Create'))
const Dashboard = lazy(() => import('@/pages/Dashboard'))
const Feedback = lazy(() => import('@/pages/Feedback'))
const GiftCreate = lazy(() => import('@/pages/GiftCreate'))
const Gifts = lazy(() => import('@/pages/Gifts'))
const Payroll = lazy(() => import('@/pages/Payroll'))
const Privacy = lazy(() => import('@/pages/Privacy'))
const Recipients = lazy(() => import('@/pages/Recipients'))
const Rewards = lazy(() => import('@/pages/Rewards'))
const SendPayment = lazy(() => import('@/pages/SendPayment'))
const Settings = lazy(() => import('@/pages/Settings'))
const Support = lazy(() => import('@/pages/Support'))
const Swap = lazy(() => import('@/pages/Swap'))
const Transactions = lazy(() => import('@/pages/Transactions'))
const Verify = lazy(() => import('@/pages/Verify'))

export default function App() {
  return (
    <BrowserRouter>
      <DraftProvider>
        <Routes>
          {/* Public site: marketing and the pages recipients and auditors open from a link. */}
          <Route element={<PublicLayout />}>
            <Route path="/" element={<Landing />} />
            <Route path="/about" element={<About />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/support" element={<Support />} />
            <Route path="/feedback" element={<Feedback />} />
            <Route path="/claim" element={<Claim />} />
            <Route path="/claim/:id" element={<Claim />} />
            <Route path="/verify" element={<Verify />} />
            <Route path="/verify/:id" element={<Verify />} />
          </Route>

          {/* The product: sidebar shell for organizers. */}
          <Route element={<AppLayout />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/gifts" element={<Gifts />} />
            <Route path="/gifts/new" element={<GiftCreate />} />
            <Route path="/send" element={<SendPayment />} />
            <Route path="/payroll" element={<Payroll />} />
            <Route path="/rewards" element={<Rewards />} />
            <Route path="/transactions" element={<Transactions />} />
            <Route path="/swap" element={<Swap />} />
            <Route path="/bridge" element={<Bridge />} />
            <Route path="/campaigns" element={<Campaigns />} />
            <Route path="/campaigns/new" element={<Create />} />
            <Route path="/campaigns/:id" element={<CampaignDetails />} />
            <Route path="/campaigns/:id/recipients" element={<Recipients />} />
            <Route path="/activity" element={<Activity />} />
            <Route path="/settings" element={<Settings />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </DraftProvider>
    </BrowserRouter>
  )
}
