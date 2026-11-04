import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { Layout } from '@/components/Layout'
import { DraftProvider } from '@/hooks/useDraft'
import About from '@/pages/About'
import Activity from '@/pages/Activity'
import CampaignDetails from '@/pages/CampaignDetails'
import Campaigns from '@/pages/Campaigns'
import Claim from '@/pages/Claim'
import Create from '@/pages/Create'
import Dashboard from '@/pages/Dashboard'
import Landing from '@/pages/Landing'
import Privacy from '@/pages/Privacy'
import Recipients from '@/pages/Recipients'
import Settings from '@/pages/Settings'
import Verify from '@/pages/Verify'

export default function App() {
  return (
    <BrowserRouter>
      <DraftProvider>
        <Layout>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/campaigns" element={<Campaigns />} />
            <Route path="/campaigns/new" element={<Create />} />
            <Route path="/campaigns/:id" element={<CampaignDetails />} />
            <Route path="/campaigns/:id/recipients" element={<Recipients />} />
            <Route path="/claim" element={<Claim />} />
            <Route path="/claim/:id" element={<Claim />} />
            <Route path="/verify" element={<Verify />} />
            <Route path="/verify/:id" element={<Verify />} />
            <Route path="/activity" element={<Activity />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/about" element={<About />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="*" element={<Landing />} />
          </Routes>
        </Layout>
      </DraftProvider>
    </BrowserRouter>
  )
}
