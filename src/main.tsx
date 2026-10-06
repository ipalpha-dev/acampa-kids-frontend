import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { ConfirmProvider } from "./components/ConfirmDialog";
import { I18nProvider } from "./i18n";
import { registerSW } from "virtual:pwa-register";
import "./styles.scss";
import "./styles/login.scss";

// service worker: precaches the whole app so it opens with no network; new
// builds are picked up silently the next time the app is opened online
registerSW({ immediate: true });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <I18nProvider>
      <ConfirmProvider>
        <App />
      </ConfirmProvider>
    </I18nProvider>
  </StrictMode>,
);
