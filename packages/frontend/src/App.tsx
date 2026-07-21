import { Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Landing from './pages/Landing';
import TrialSignup from './pages/TrialSignup';
import { Navigate as RouterNavigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import { homeRouteFor } from './lib/homeRoute';
import NotFound from './pages/NotFound';

import AdminLayout from './pages/admin/Layout';
import AdminDashboard from './pages/admin/Dashboard';
import AdminDocuments from './pages/admin/Documents';
import AdminUsers from './pages/admin/Users';
import AdminQuestions from './pages/admin/QuestionAnalytics';
import InsertKnowledge from './pages/admin/InsertKnowledge';
import AdminSettings from './pages/admin/AdminSettings';
import Institutions from './pages/admin/Institutions';

import SchoolLayout from './pages/school/Layout';
import SchoolDashboard from './pages/school/Dashboard';
import SchoolDocuments from './pages/school/Documents';
import SchoolUsers from './pages/school/Users';
import SchoolApiKeys from './pages/school/ApiKeys';
import SchoolProfile from './pages/school/Profile';
import SchoolAnalytics from './pages/school/Analytics';
import ImpersonationBanner from './components/ImpersonationBanner';

import ClientLayout from './pages/client/Layout';
import ClientKnowledge from './pages/client/KnowledgeAssistant';
import ClientSettings from './pages/client/ClientSettings';
import Settings from './pages/Settings';

/**
 * The root path serves two audiences. A visitor gets the landing page; someone already
 * signed in gets their own dashboard, because being bounced to a marketing page you have
 * already bought is a small insult.
 */
function Home() {
  const { user, isAuthenticated } = useAuthStore();
  if (isAuthenticated && user) return <RouterNavigate to={homeRouteFor(user)} replace />;
  return <Landing />;
}

export default function App() {
  return (
    <>
      {/* Outside <Routes> on purpose: while the platform owner is viewing an institution,
          that fact has to stay visible on every page, not just the one they entered from. */}
      <ImpersonationBanner />
    <Routes>
      <Route path="/login" element={<Login />} />

      {/* Super Admin routes */}
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<AdminDashboard />} />
        <Route path="institutions" element={<Institutions />} />
        <Route path="documents" element={<AdminDocuments />} />
        <Route path="users" element={<AdminUsers />} />
        <Route path="questions" element={<AdminQuestions />} />
        <Route path="insert-knowledge" element={<InsertKnowledge />} />
        <Route path="settings" element={<AdminSettings />} />
      </Route>

      {/* Institution Admin (School Portal) routes */}
      <Route path="/school" element={<SchoolLayout />}>
        <Route index element={<SchoolDashboard />} />
        <Route path="documents" element={<SchoolDocuments />} />
        <Route path="users" element={<SchoolUsers />} />
        <Route path="analytics" element={<SchoolAnalytics />} />
        <Route path="api-keys" element={<SchoolApiKeys />} />
        <Route path="profile" element={<SchoolProfile />} />
      </Route>

      {/* Client routes */}
      <Route path="/knowledge" element={<ClientLayout />}>
        <Route index element={<ClientKnowledge />} />
        <Route path="chat/:sessionId" element={<ClientKnowledge />} />
        <Route path="settings" element={<ClientSettings />} />
      </Route>

      {/* Public marketing entry. Signed-in visitors never see it — they are sent to
          whichever dashboard their role belongs to. */}
      <Route path="/" element={<Home />} />
      <Route path="/signup" element={<TrialSignup />} />

      {/* 404 */}
      <Route path="*" element={<NotFound />} />
    </Routes>
    </>
  );
}
