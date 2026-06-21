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
import Atlas from "./
