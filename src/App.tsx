import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "@/components/theme-provider";
import { AuthProvider } from "@/contexts/AuthContext";
import { AtlasFilterProvider } from "@/contexts/AtlasFilterContext";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import FavoritesSync from "@/components/orchid/FavoritesSync";

import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import SpeciesDossier from "./pages/SpeciesDossier";
import About from "./pages/About";
import Atlas from "./pages/Atlas";
import OrchidZoo from "./pages/OrchidZoo";
import OACS from "./pages/OACS";
import Widgets from "./pages/Widgets";
import Explore from "./pages/Explore";
import Species from "./pages/Species";
import MyCollection from "./pages/MyCollection";
import ResearchCenter from "./pages/ResearchCenter";
import Education from "./pages/Education";
import Partners from "./pages/Partners";
import GetInvolved from "./pages/GetInvolved";
import Ecosystems from "./pages/Ecosystems";
import ConservationHub from "./pages/ConservationHub";
import OrchidUniversity from "./pages/OrchidUniversity";
import Classroom from "./pages/Classroom";
import Societies from "./pages/Societies";
import OrganizationProfile from "./pages/OrganizationProfile";
import ProjectWorkspace from "./pages/ProjectWorkspace";
import Account from "./pages/Account";
import HabitatJourney from "./pages/HabitatJourney";
import PollinatorProfile from "./pages/PollinatorProfile";
import MycorrhizaProfile from "./pages/MycorrhizaProfile";
import Gallery from "./pages/Gallery";
import IntelligenceGraph from "./pages/IntelligenceGraph";
import Climate from "./pages/Climate";
import EcuadorExpedition from "./pages/EcuadorExpedition";
import GenusDetail from "./pages/GenusDetail";
import ComingSoon from "./pages/ComingSoon";
import SavedOrchids from "./pages/SavedOrchids";
import DailyGenusDiagnostics from "./pages/DailyGenusDiagnostics";

const queryClient = new QueryClient();

const App = () => (
  <ThemeProvider defaultTheme="light">
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <FavoritesSync />
        <TooltipProvider>
          <Toaster />
          <Sonner />

          <BrowserRouter>
            <AtlasFilterProvider>
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/explore" element={<Explore />} />
                <Route path="/species" element={<Species />} />
                <Route path="/genus/:name" element={<GenusDetail />} />
                <Route path="/species/:slug" element={<SpeciesDossier />} />

                <Route path="/about" element={<About />} />
                <Route path="/atlas/ecuador" element={<EcuadorExpedition />} />
                <Route path="/atlas" element={<Atlas />} />
                <Route path="/atlas/:species" element={<Atlas />} />

                <Route path="/diagnostics/daily-genus" element={<DailyGenusDiagnostics />} />

                <Route path="/habitats" element={<HabitatJourney mode="biome" />} />
                <Route path="/habitats/:biome" element={<HabitatJourney mode="biome" />} />
                <Route path="/ecosystems/:species" element={<HabitatJourney mode="species" />} />
                <Route path="/pollinators" element={<PollinatorProfile />} />
                <Route path="/pollinators/:taxa" element={<PollinatorProfile />} />
                <Route path="/mycorrhizae" element={<MycorrhizaProfile />} />
                <Route path="/mycorrhizae/:taxa" element={<MycorrhizaProfile />} />
                <Route path="/gallery" element={<Gallery />} />
                <Route path="/climate" element={<Climate />} />
                <Route path="/intelligence-graph" element={<IntelligenceGraph />} />

                <Route
                  path="/collection"
                  element={
                    <ProtectedRoute
                      title="Sign in to view your collection"
                      description="Your Orchid Continuum collection — saved specimens, observations, and field notes — lives behind authentication."
                    >
                      <MyCollection />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/research"
                  element={
                    <ProtectedRoute
                      title="Research Center · members only"
                      description="Sign in to access advanced queries, trait explorers, and the conservation research workspace."
                    >
                      <ResearchCenter />
                    </ProtectedRoute>
                  }
                />

                <Route path="/account" element={<Account />} />
                <Route path="/saved" element={<SavedOrchids />} />

                <Route path="/oacs" element={<OACS />} />
                <Route path="/zoo" element={<OrchidZoo />} />
                <Route path="/widgets" element={<Widgets />} />
                <Route path="/education" element={<Education />} />
                <Route path="/partners" element={<Partners />} />
                <Route path="/get-involved" element={<GetInvolved />} />

                <Route path="/ecosystems" element={<Ecosystems />} />
                <Route path="/conservation" element={<ConservationHub />} />
                <Route path="/societies" element={<Societies />} />
                <Route path="/university" element={<OrchidUniversity />} />
                <Route path="/classroom" element={<Classroom />} />

                <Route path="/org/:slug" element={<OrganizationProfile />} />
                <Route path="/project/:slug" element={<ProjectWorkspace />} />

                <Route path="/coming-soon/:section" element={<ComingSoon />} />
                <Route path="/coming-soon" element={<ComingSoon />} />

                <Route path="*" element={<NotFound />} />
              </Routes>
            </AtlasFilterProvider>
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  </ThemeProvider>
);

export default App;
