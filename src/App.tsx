import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/lib/auth";
import { ThemeProvider } from "@/lib/theme";
import { PWAUpdatePrompt } from "@/components/PWAUpdatePrompt";
import { AgreementGate } from "@/components/AgreementGate";
import Landing from "./pages/Landing";
import NotFound from "./pages/NotFound";
import Maintenance from "./pages/Maintenance";

const MAINTENANCE_MODE = false;

// Lazy-loaded pages — only downloaded when the route is visited
const ContentReviewPreview = lazy(() => import("./pages/dev/ContentReviewPreview"));
const Install = lazy(() => import("./pages/Install"));
const ReferralSignup = lazy(() => import("./pages/ReferralSignup"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const Terms = lazy(() => import("./pages/Terms"));
const Privacy = lazy(() => import("./pages/Privacy"));
const DataDeletion = lazy(() => import("./pages/DataDeletion"));

// Creator pages
const CreatorHome = lazy(() => import("./pages/creator/CreatorHome"));
const CreatorMyVideos = lazy(() => import("./pages/creator/CreatorMyVideos"));
const CreatorSubmit = lazy(() => import("./pages/creator/CreatorSubmit"));
const CreatorPayouts = lazy(() => import("./pages/creator/CreatorPayouts"));
const CreatorProfile = lazy(() => import("./pages/creator/CreatorProfile"));
const CreatorChat = lazy(() => import("./pages/creator/CreatorChat"));
const CreatorBounties = lazy(() => import("./pages/creator/CreatorBounties"));
const CreatorSamples = lazy(() => import("./pages/creator/CreatorSamples"));
const CreatorBriefs = lazy(() => import("./pages/creator/CreatorBriefs"));
const CreatorBrand = lazy(() => import("./pages/creator/CreatorBrand"));
const CreatorLeaderboard = lazy(() => import("./pages/creator/CreatorLeaderboard"));
const CreatorAnalytics = lazy(() => import("./pages/creator/CreatorAnalytics"));
const CreatorHelp = lazy(() => import("./pages/creator/CreatorHelp"));
const CreatorLearn = lazy(() => import("./pages/creator/CreatorLearn"));
const CreatorReferrals = lazy(() => import("./pages/creator/CreatorReferrals"));
const CreatorContentReview = lazy(() => import("./pages/creator/CreatorContentReview"));
const CreatorMentees = lazy(() => import("./pages/creator/CreatorMentees"));
const MenteeProfile = lazy(() => import("./pages/creator/MenteeProfile"));
const MentorPlanHub = lazy(() => import("./pages/creator/MentorPlanHub"));
const MentorPlanningLanding = lazy(() => import("./pages/creator/MentorPlanningLanding"));
const CreatorRewardShop = lazy(() => import("./pages/creator/CreatorRewardShop"));
const CreatorPhotoSubmit = lazy(() => import("./pages/creator/CreatorPhotoSubmit"));
const CreatorCalendar = lazy(() => import("./pages/creator/CreatorCalendar"));
const CreatorAI = lazy(() => import("./pages/creator/CreatorAI"));

// Admin pages
const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard"));
const AdminAI = lazy(() => import("./pages/admin/AdminAI"));
const AdminVideos = lazy(() => import("./pages/admin/AdminVideos"));
const AdminCreators = lazy(() => import("./pages/admin/AdminCreators"));
const AdminSubmissions = lazy(() => import("./pages/admin/AdminSubmissions"));
const AdminRewards = lazy(() => import("./pages/admin/AdminRewards"));
const AdminPayouts = lazy(() => import("./pages/admin/AdminPayouts"));
const AdminChat = lazy(() => import("./pages/admin/AdminChat"));
const AdminSettings = lazy(() => import("./pages/admin/AdminSettings"));
const AdminSamples = lazy(() => import("./pages/admin/AdminSamples"));
const AdminMetaIntelligence = lazy(() => import("./pages/admin/AdminMetaIntelligence"));
const AdminBriefs = lazy(() => import("./pages/admin/AdminBriefs"));
const AdminCreatorProfile = lazy(() => import("./pages/admin/AdminCreatorProfile"));
const AdminResources = lazy(() => import("./pages/admin/AdminResources"));
const AdminBrand = lazy(() => import("./pages/admin/AdminBrand"));
const AdminContentReview = lazy(() => import("./pages/admin/AdminContentReview"));
const AdminVideoRankings = lazy(() => import("./pages/admin/AdminVideoRankings"));
const AdminAgreements = lazy(() => import("./pages/admin/AdminAgreements"));
const AdminEligibility = lazy(() => import("./pages/admin/AdminEligibility"));
const AdminCohortSchedule = lazy(() => import("./pages/admin/AdminCohortSchedule"));

// Ads pages
const AdsActive = lazy(() => import("./pages/ads/AdsActive"));
const AdsBuilder = lazy(() => import("./pages/ads/AdsBuilder"));
const AdsSettings = lazy(() => import("./pages/ads/AdsSettings"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function RouteLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
    </div>
  );
}

function ProtectedRoute({ children, requiredRole }: { children: React.ReactNode; requiredRole?: "admin" | "creator" }) {
  const { user, role, loading } = useAuth();

  if (loading) {
    return <RouteLoader />;
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  if (requiredRole && role !== requiredRole) {
    if (role === "admin") {
      return <Navigate to="/admin" replace />;
    }
    return <Navigate to="/creator" replace />;
  }

  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Suspense fallback={<RouteLoader />}>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/auth" element={<Landing />} />
        <Route path="/referral-signup" element={<ReferralSignup />} />
        <Route path="/install" element={<Install />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/data-deletion" element={<DataDeletion />} />
        <Route path="/dev/content-review" element={<ContentReviewPreview />} />
        {/* Creator routes */}
        <Route path="/creator" element={<ProtectedRoute requiredRole="creator"><CreatorHome /></ProtectedRoute>} />
        <Route path="/creator/videos" element={<ProtectedRoute requiredRole="creator"><CreatorMyVideos /></ProtectedRoute>} />
        <Route path="/creator/submit" element={<ProtectedRoute requiredRole="creator"><CreatorSubmit /></ProtectedRoute>} />
        <Route path="/creator/videos/upload" element={<ProtectedRoute requiredRole="creator"><CreatorSubmit /></ProtectedRoute>} />
        <Route path="/creator/payouts" element={<ProtectedRoute requiredRole="creator"><CreatorPayouts /></ProtectedRoute>} />
        <Route path="/creator/profile" element={<ProtectedRoute requiredRole="creator"><CreatorProfile /></ProtectedRoute>} />
        <Route path="/creator/brand" element={<ProtectedRoute requiredRole="creator"><CreatorBrand /></ProtectedRoute>} />
        <Route path="/creator/bounties" element={<ProtectedRoute requiredRole="creator"><CreatorBounties /></ProtectedRoute>} />
        <Route path="/creator/samples" element={<ProtectedRoute requiredRole="creator"><CreatorSamples /></ProtectedRoute>} />
        <Route path="/creator/briefs" element={<ProtectedRoute requiredRole="creator"><CreatorBriefs /></ProtectedRoute>} />
        <Route path="/creator/chat" element={<ProtectedRoute requiredRole="creator"><CreatorChat /></ProtectedRoute>} />
        <Route path="/creator/leaderboard" element={<ProtectedRoute requiredRole="creator"><CreatorLeaderboard /></ProtectedRoute>} />
        <Route path="/creator/analytics" element={<ProtectedRoute requiredRole="creator"><CreatorAnalytics /></ProtectedRoute>} />
        <Route path="/creator/help" element={<ProtectedRoute requiredRole="creator"><CreatorHelp /></ProtectedRoute>} />
        <Route path="/creator/learn" element={<ProtectedRoute requiredRole="creator"><CreatorLearn /></ProtectedRoute>} />
        <Route path="/creator/referrals" element={<ProtectedRoute requiredRole="creator"><CreatorReferrals /></ProtectedRoute>} />
        <Route path="/creator/content-review" element={<ProtectedRoute requiredRole="creator"><CreatorContentReview /></ProtectedRoute>} />
        <Route path="/creator/mentees" element={<ProtectedRoute requiredRole="creator"><CreatorMentees /></ProtectedRoute>} />
        <Route path="/creator/mentees/:id" element={<ProtectedRoute requiredRole="creator"><MenteeProfile /></ProtectedRoute>} />
        <Route path="/creator/mentees/:id/plan" element={<ProtectedRoute requiredRole="creator"><MentorPlanHub /></ProtectedRoute>} />
        <Route path="/creator/plan" element={<ProtectedRoute requiredRole="creator"><MentorPlanHub /></ProtectedRoute>} />
        <Route path="/creator/planning" element={<ProtectedRoute requiredRole="creator"><MentorPlanningLanding /></ProtectedRoute>} />
        <Route path="/creator/rewards" element={<ProtectedRoute requiredRole="creator"><CreatorRewardShop /></ProtectedRoute>} />
        <Route path="/creator/photo-submissions" element={<ProtectedRoute requiredRole="creator"><CreatorPhotoSubmit /></ProtectedRoute>} />
        <Route path="/creator/photos/submit" element={<ProtectedRoute requiredRole="creator"><CreatorPhotoSubmit /></ProtectedRoute>} />
        <Route path="/creator/calendar" element={<ProtectedRoute requiredRole="creator"><CreatorCalendar /></ProtectedRoute>} />
        <Route path="/creator/ai" element={<ProtectedRoute requiredRole="creator"><CreatorAI /></ProtectedRoute>} />

        {/* Admin routes */}
        <Route path="/admin" element={<ProtectedRoute requiredRole="admin"><AdminDashboard /></ProtectedRoute>} />
        <Route path="/admin/submissions" element={<ProtectedRoute requiredRole="admin"><AdminSubmissions /></ProtectedRoute>} />
        <Route path="/admin/videos" element={<Navigate to="/admin/submissions" replace />} />
        <Route path="/admin/creators" element={<ProtectedRoute requiredRole="admin"><AdminCreators /></ProtectedRoute>} />
        <Route path="/admin/samples" element={<ProtectedRoute requiredRole="admin"><AdminSamples /></ProtectedRoute>} />
        <Route path="/admin/briefs" element={<ProtectedRoute requiredRole="admin"><AdminBriefs /></ProtectedRoute>} />
        <Route path="/admin/rewards" element={<ProtectedRoute requiredRole="admin"><AdminRewards /></ProtectedRoute>} />
        <Route path="/admin/payouts" element={<ProtectedRoute requiredRole="admin"><AdminPayouts /></ProtectedRoute>} />
        <Route path="/admin/chat" element={<ProtectedRoute requiredRole="admin"><AdminChat /></ProtectedRoute>} />
        <Route path="/admin/settings" element={<ProtectedRoute requiredRole="admin"><AdminSettings /></ProtectedRoute>} />
        <Route path="/admin/brand" element={<ProtectedRoute requiredRole="admin"><AdminBrand /></ProtectedRoute>} />
        <Route path="/admin/meta-intelligence" element={<ProtectedRoute requiredRole="admin"><AdminMetaIntelligence /></ProtectedRoute>} />
        <Route path="/admin/creators/:id" element={<ProtectedRoute requiredRole="admin"><AdminCreatorProfile /></ProtectedRoute>} />
        <Route path="/admin/resources" element={<ProtectedRoute requiredRole="admin"><AdminResources /></ProtectedRoute>} />
        <Route path="/admin/photo-review" element={<ProtectedRoute requiredRole="admin"><AdminContentReview /></ProtectedRoute>} />
        <Route path="/admin/photo-submissions" element={<ProtectedRoute requiredRole="admin"><AdminContentReview /></ProtectedRoute>} />
        <Route path="/admin/content-review" element={<Navigate to="/admin/photo-review" replace />} />
        <Route path="/admin/video-rankings" element={<ProtectedRoute requiredRole="admin"><AdminVideoRankings /></ProtectedRoute>} />
        <Route path="/admin/agreements" element={<ProtectedRoute requiredRole="admin"><AdminAgreements /></ProtectedRoute>} />
        <Route path="/admin/ai" element={<ProtectedRoute requiredRole="admin"><AdminAI /></ProtectedRoute>} />
        <Route path="/admin/eligibility" element={<ProtectedRoute requiredRole="admin"><AdminEligibility /></ProtectedRoute>} />
        <Route path="/admin/cohorts/:id/schedule" element={<ProtectedRoute requiredRole="admin"><AdminCohortSchedule /></ProtectedRoute>} />

        {/* Ads routes (admin only) */}
        <Route path="/ads" element={<ProtectedRoute requiredRole="admin"><AdsActive /></ProtectedRoute>} />
        <Route path="/ads/builder" element={<ProtectedRoute requiredRole="admin"><AdsBuilder /></ProtectedRoute>} />
        <Route path="/ads/settings" element={<ProtectedRoute requiredRole="admin"><AdsSettings /></ProtectedRoute>} />

        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}

const App = () => {
  if (MAINTENANCE_MODE) {
    return (
      <ThemeProvider>
        <PWAUpdatePrompt />
        <Maintenance />
      </ThemeProvider>
    );
  }
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <PWAUpdatePrompt />
          <BrowserRouter>
            <AuthProvider>
              <AgreementGate />
              <AppRoutes />
            </AuthProvider>
          </BrowserRouter>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
};

export default App;
