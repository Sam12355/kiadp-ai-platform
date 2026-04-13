import { Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import NotFound from './pages/NotFound';

// Placeholder pages — will be replaced in Phases 6 & 7
import AdminLayout from './pages/admin/Layout';
import AdminDashboard from './pages/admin/Dashboard';
import AdminDocuments from './pages/admin/Documents';
import AdminUsers from './pages/admin/Users';
import AdminQuestions from './pages/admin/QuestionAnalytics';

import ClientLayout from './pages/client/Layout';
import ClientKnowledge from './pages/client/KnowledgeAssistant';
import ClientSettings from './pages/client/ClientSettings';
import Settings from './pages/Settings';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      {/* Admin routes (Protected Layout) */}
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<AdminDashboard />} />
        <Route path="documents" element={<AdminDocuments />} />
        <Route path="users" element={<AdminUsers />} />
        <Route path="questions" element={<AdminQuestions />} />
        <Route path="settings" element={<Settings />} />
      </Route>

      {/* Client routes (Protected Layout) */}
      <Route path="/knowledge" element={<ClientLayout />}>
        <Route index element={<ClientKnowledge />} />
        <Route path="chat/:sessionId" element={<ClientKnowledge />} />
        <Route path="settings" element={<ClientSettings />} />
      </Route>

      {/* Default redirect */}
      <Route path="/" element={<Navigate to="/login" replace />} />

      {/* 404 */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
