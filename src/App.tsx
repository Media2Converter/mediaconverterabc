import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Index from "./pages/Index.tsx";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

const APP_VERSION = "1.1";
const VERSION_STORAGE_KEY = "video-audio-converter-version";

const App = () => {
  useEffect(() => {
    let savedVersion: string | null = null;
    try {
      savedVersion = window.localStorage.getItem(VERSION_STORAGE_KEY);
    } catch {
      return;
    }

    if (savedVersion === APP_VERSION) return;

    const accepted = window.confirm(
      `このサイトのバージョンをアップデートしてよろしいですか？\n\n${APP_VERSION}`,
    );
    if (accepted) {
      try {
        window.localStorage.setItem(VERSION_STORAGE_KEY, APP_VERSION);
      } catch {
        // The confirmation has still been completed for this visit.
      }
    }
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
