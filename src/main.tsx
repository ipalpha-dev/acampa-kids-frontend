import { StrictMode, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { ConfirmProvider } from "./components/ConfirmDialog";
import { I18nProvider } from "./i18n";
import { registerSW } from "virtual:pwa-register";
import "./styles.css";
import "./styles/login.scss";

// service worker: precaches the whole app so it opens with no network; new
// builds are picked up silently the next time the app is opened online
registerSW({ immediate: true });

/** dev-only: `?scene=girl|boy` previews the kid icons + play scene without logging in */
const scene = import.meta.env.DEV ? new URLSearchParams(location.search).get("scene") : null;
const ScenePreview = scene ? lazy(() => import("./dev/ScenePreview")) : null;

/** dev-only: `?components=<key>` (or `all`) previews the Phase 3 domain components with the shared fixture */
const components = import.meta.env.DEV ? new URLSearchParams(location.search).get("components") : null;
const ComponentsPreview = components ? lazy(() => import("./dev/ComponentsPreview")) : null;

/** dev-only: `?shell=<key>` renders the real Dashboard offline against one of dev/shellScenarios.json's fixtures */
const shell = import.meta.env.DEV ? new URLSearchParams(location.search).get("shell") : null;
const ShellPreview = shell ? lazy(() => import("./dev/ShellPreview")) : null;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {ScenePreview ? (
      <Suspense fallback={null}>
        <ScenePreview sex={scene === "girl" ? "girl" : "boy"} />
      </Suspense>
    ) : ComponentsPreview ? (
      <I18nProvider>
        <ConfirmProvider>
          <Suspense fallback={null}>
            <ComponentsPreview section={components!} />
          </Suspense>
        </ConfirmProvider>
      </I18nProvider>
    ) : ShellPreview ? (
      <I18nProvider>
        <ConfirmProvider>
          <Suspense fallback={null}>
            <ShellPreview />
          </Suspense>
        </ConfirmProvider>
      </I18nProvider>
    ) : (
      <I18nProvider>
        <ConfirmProvider>
          <App />
        </ConfirmProvider>
      </I18nProvider>
    )}
  </StrictMode>,
);
