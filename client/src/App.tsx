import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Register from "./pages/Register";
import Subscription from "./pages/Subscription";
import SubscriptionSuccess from "./pages/SubscriptionSuccess";
import SubscriptionCancel from "./pages/SubscriptionCancel";
import AppHome from "./pages/AppHome";
import Settings from "./pages/Settings";
import ProjectList from "./pages/VoiceApp/ProjectList";
import ProjectDetail from "./pages/VoiceApp/ProjectDetail";
import ImageHome from "./pages/ImageApp/ImageHome";
import PhotoEditor from "./pages/ImageApp/PhotoEditor";
import MagicEraser from "./pages/ImageApp/MagicEraser";
import CalendarQRApp from "./pages/CalendarQR/CalendarQRApp";
import BizWriterApp from "./pages/BizWriter/BizWriterApp";

function Router() {
  return (
    <Switch>
      {/* Public routes */}
      <Route path="/" component={Home} />
      
      {/* Auth routes */}
      <Route path="/register" component={Register} />
      <Route path="/subscription" component={Subscription} />
      <Route path="/subscription/success" component={SubscriptionSuccess} />
      <Route path="/subscription/cancel" component={SubscriptionCancel} />
      
      {/* Protected routes */}
      <Route path="/home" component={AppHome} />
      <Route path="/settings" component={Settings} />
      
      {/* Voice App routes */}
      <Route path="/app/voice" component={ProjectList} />
      <Route path="/app/voice/:id" component={ProjectDetail} />
      
      {/* Image App routes */}
      <Route path="/app/image" component={ImageHome} />
      <Route path="/app/image/editor" component={PhotoEditor} />
      <Route path="/app/image/eraser" component={MagicEraser} />
      
      {/* Calendar QR App routes */}
      <Route path="/app/calendar-qr" component={CalendarQRApp} />
      
      {/* BizWriter AI routes */}
      <Route path="/app/bizwriter" component={BizWriterApp} />
      
      {/* Fallback */}
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
