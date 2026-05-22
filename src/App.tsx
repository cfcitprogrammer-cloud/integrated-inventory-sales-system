import { Toaster } from "sonner";
import { TooltipProvider } from "./components/ui/tooltip";
import AppRouter from "./config/router";

function App() {
  return (
    <TooltipProvider>
      <AppRouter />
      <Toaster richColors position="top-right" />
    </TooltipProvider>
  );
}

export default App;
