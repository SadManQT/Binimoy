import "@/App.css";
import React from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { LanguageProvider } from "@/i18n";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import Layout from "@/components/Layout";
import AuthCallback from "@/components/AuthCallback";
import { Loading } from "@/components/StatusBits";

import Landing from "@/pages/Landing";
import Login from "@/pages/Login";
import Home from "@/pages/Home";
import Research from "@/pages/Research";
import SubjectProfile from "@/pages/SubjectProfile";
import Compare from "@/pages/Compare";
import ReportEditor from "@/pages/ReportEditor";
import Moderation from "@/pages/Moderation";
import Deals from "@/pages/Deals";
import DealRoom from "@/pages/DealRoom";

function Protected({ children }) {
  const { user } = useAuth();
  if (user === null) return <div className="min-h-screen grid place-items-center bg-surface-base"><Loading /></div>;
  if (user === false) return <Navigate to="/login" replace />;
  return <Layout>{children}</Layout>;
}

function AppRouter() {
  const location = useLocation();
  if (location.hash?.includes("session_id=")) return <AuthCallback />;
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/home" element={<Protected><Home /></Protected>} />
      <Route path="/research" element={<Protected><Research /></Protected>} />
      <Route path="/subjects/:id" element={<Protected><SubjectProfile /></Protected>} />
      <Route path="/compare" element={<Protected><Compare /></Protected>} />
      <Route path="/reports" element={<Protected><ReportEditor /></Protected>} />
      <Route path="/reports/new" element={<Protected><ReportEditor /></Protected>} />
      <Route path="/moderation" element={<Protected><Moderation /></Protected>} />
      <Route path="/deals" element={<Protected><Deals /></Protected>} />
      <Route path="/deals/:id" element={<Protected><DealRoom /></Protected>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <BrowserRouter>
          <AppRouter />
          <Toaster position="top-center" richColors />
        </BrowserRouter>
      </AuthProvider>
    </LanguageProvider>
  );
}
