import React, { Suspense, lazy } from "react";
import { BrowserRouter, Link, Navigate, Route, Routes } from "react-router-dom";
import { LoadingScreen } from "./components/ui";
import { AppShell } from "./components/layout/AppShell";
import { AuthProvider } from "./contexts/AuthContext";
import { ToastProvider } from "./contexts/ToastContext";
import { WorkspaceProvider } from "./contexts/WorkspaceContext";
import { ErrorBoundary } from "./components/layout/ErrorBoundary";
import { env } from "./config/env";
import { PublicOnly, RequireAuth } from "./features/auth/guards";
import { AuthLayout } from "./features/auth/AuthLayout";

// Route-level code splitting: auth pages stay small; the planner loads after sign-in.
const SignInPage = lazy(() => import("./features/auth/SignInPage"));
const SignUpPage = lazy(() => import("./features/auth/SignUpPage"));
const ForgotPasswordPage = lazy(() => import("./features/auth/PasswordPages").then((m) => ({ default: m.ForgotPasswordPage })));
const ResetPasswordPage = lazy(() => import("./features/auth/PasswordPages").then((m) => ({ default: m.ResetPasswordPage })));
const HomeRedirect = lazy(() => import("./features/profiles/HomeRedirect"));
const OnboardingPage = lazy(() => import("./features/profiles/OnboardingPage"));
const ProfileLayout = lazy(() => import("./features/profiles/ProfileLayout"));
const MonthPage = lazy(() => import("./features/plan/MonthPage"));
const CommitmentsPage = lazy(() => import("./features/commitments/CommitmentsPage"));
const SetupPage = lazy(() => import("./features/setup/SetupPage"));
const AcceptInvitePage = lazy(() => import("./features/invitations/AcceptInvitePage"));
const SettingsLayout = lazy(() => import("./features/settings/SettingsLayout"));
const AccountSettingsPage = lazy(() => import("./features/settings/AccountSettingsPage"));
const ProfilesSettingsPage = lazy(() => import("./features/settings/ProfilesSettingsPage"));
const ProfileSettingsPage = lazy(() => import("./features/settings/ProfileSettingsPage"));
const InvitationsPage = lazy(() => import("./features/settings/InvitationsPage"));

function NotFound() {
  return (
    <div className="narrow" style={{ paddingTop: 60 }}>
      <h1 className="page-title">Page not found</h1>
      <p><Link to="/">Go home</Link></p>
    </div>
  );
}

function SignedInApp() {
  return (
    <RequireAuth>
      <WorkspaceProvider>
        <AppShell />
      </WorkspaceProvider>
    </RequireAuth>
  );
}

export default function App() {
  return (
    <div className="mmp">
      <ErrorBoundary>
        <BrowserRouter basename={env.basePath || "/"} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <ToastProvider>
            <AuthProvider>
              <Suspense fallback={<LoadingScreen />}>
                <Routes>
                  <Route element={<PublicOnly><AuthLayout /></PublicOnly>}>
                    <Route path="/sign-in" element={<SignInPage />} />
                    <Route path="/sign-up" element={<SignUpPage />} />
                    <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                  </Route>
                  <Route path="/reset-password" element={<AuthLayout><ResetPasswordPage /></AuthLayout>} />

                  <Route element={<SignedInApp />}>
                    <Route index element={<HomeRedirect />} />
                    <Route path="/welcome" element={<OnboardingPage />} />
                    <Route path="/invite/:inviteId" element={<AcceptInvitePage />} />
                    <Route path="/p/:profileId" element={<ProfileLayout />}>
                      <Route index element={<Navigate to="month" replace />} />
                      <Route path="month" element={<MonthPage />} />
                      <Route path="commitments" element={<CommitmentsPage />} />
                      <Route path="setup" element={<SetupPage />} />
                    </Route>
                    <Route path="/settings" element={<SettingsLayout />}>
                      <Route index element={<Navigate to="account" replace />} />
                      <Route path="account" element={<AccountSettingsPage />} />
                      <Route path="profiles" element={<ProfilesSettingsPage />} />
                      <Route path="profiles/:profileId" element={<ProfileSettingsPage />} />
                      <Route path="invitations" element={<InvitationsPage />} />
                    </Route>
                  </Route>

                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
            </AuthProvider>
          </ToastProvider>
        </BrowserRouter>
      </ErrorBoundary>
    </div>
  );
}
