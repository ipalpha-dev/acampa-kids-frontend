import { resolveLocale, type Locale } from "./i18n/locales";

export interface DevicePosition {
  lat: number;
  lng: number;
  /** GPS error margin in metres (0 when unknown) */
  accuracyM: number;
}

export class GeoError extends Error {
  kind: "unsupported" | "denied" | "unavailable" | "timeout";
  constructor(kind: GeoError["kind"], message: string) {
    super(message);
    this.kind = kind;
  }
}

const GEO: Record<Locale, Record<GeoError["kind"], string>> = {
  pt: {
    unsupported: "Este aparelho não tem GPS disponível para o navegador.",
    denied: "Precisamos da sua localização para confirmar que você está na igreja. Permita o acesso nas configurações do navegador e tente de novo.",
    timeout: "O GPS demorou demais para responder. Tente de novo em um lugar mais aberto.",
    unavailable: "Não foi possível ler a sua localização. Ative o GPS e tente de novo.",
  },
  en: {
    unsupported: "This device has no GPS available to the browser.",
    denied: "We need your location to confirm you are at the church. Allow access in the browser settings and try again.",
    timeout: "GPS took too long to respond. Try again somewhere more open.",
    unavailable: "Could not read your location. Turn GPS on and try again.",
  },
  es: {
    unsupported: "Este aparato no tiene GPS disponible para el navegador.",
    denied: "Necesitamos tu ubicación para confirmar que estás en la iglesia. Permite el acceso en la configuración del navegador e inténtalo de nuevo.",
    timeout: "El GPS tardó demasiado en responder. Inténtalo de nuevo en un lugar más abierto.",
    unavailable: "No se pudo leer tu ubicación. Activa el GPS e inténtalo de nuevo.",
  },
  fr: {
    unsupported: "Cet appareil n'a pas de GPS disponible pour le navigateur.",
    denied: "Nous avons besoin de votre position pour confirmer que vous êtes à l'église. Autorisez l'accès dans les réglages du navigateur et réessayez.",
    timeout: "Le GPS a mis trop de temps à répondre. Réessayez dans un endroit plus dégagé.",
    unavailable: "Impossible de lire votre position. Activez le GPS et réessayez.",
  },
  de: {
    unsupported: "Auf diesem Gerät steht dem Browser kein GPS zur Verfügung.",
    denied: "Wir brauchen deinen Standort, um zu bestätigen, dass du in der Gemeinde bist. Erlaube den Zugriff in den Browser-Einstellungen und versuch es noch einmal.",
    timeout: "Das GPS hat zu lange gebraucht. Versuch es noch einmal an einem offeneren Ort.",
    unavailable: "Dein Standort konnte nicht gelesen werden. Schalte das GPS ein und versuch es noch einmal.",
  },
};

function geoMsg(kind: GeoError["kind"]): string {
  const language = typeof document !== "undefined" ? resolveLocale(document.documentElement.lang) : "pt";
  return GEO[language][kind];
}

export function readPosition(timeoutMs = 15_000): Promise<DevicePosition> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new GeoError("unsupported", geoMsg("unsupported")));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracyM: Math.round(p.coords.accuracy || 0) }),
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          reject(new GeoError("denied", geoMsg("denied")));
        } else if (err.code === err.TIMEOUT) {
          reject(new GeoError("timeout", geoMsg("timeout")));
        } else {
          reject(new GeoError("unavailable", geoMsg("unavailable")));
        }
      },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 },
    );
  });
}

export function describeGeoError(err: unknown): string {
  if (err instanceof GeoError) return err.message;
  return err instanceof Error ? err.message : "Algo deu errado.";
}

/** Great-circle distance in metres (haversine) — same formula as the server. */
export function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6_371_000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function formatDistance(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(1).replace(".", ",")} km` : `${Math.round(m)} m`;
}
