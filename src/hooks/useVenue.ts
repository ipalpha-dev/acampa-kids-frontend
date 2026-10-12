import { useCallback, useEffect, useState } from "react";
import { getVenue, type VenuePlace, type VenueSummary } from "../api/places";
import { useCollection } from "../store";

export interface VenueState {
  /** null = nothing chosen for this camp yet (or the answer has not arrived) */
  venue: VenueSummary | null;
  places: VenuePlace[];
  loading: boolean;
  /** the catalog could not be read right now (places-api resting) */
  unavailable: boolean;
  reload: () => void;
}

/**
 * This camp's venue and the places below it (GET /api/places/venue — programme editors). Refetched when the rooms
 * change (a places-api invalidation reaches the camp as a `bedrooms` update), so a renamed or added room shows at once.
 */
export function useVenue(token: string, enabled = true): VenueState {
  const bedrooms = useCollection("bedrooms");
  const [state, setState] = useState<{ venue: VenueSummary | null; places: VenuePlace[]; loading: boolean; unavailable: boolean }>({ venue: null, places: [], loading: enabled, unavailable: false });
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    getVenue(token)
      .then((res) => alive && setState({ venue: res.venue, places: res.places, loading: false, unavailable: false }))
      .catch(() => alive && setState((s) => ({ ...s, loading: false, unavailable: true })));
    return () => {
      alive = false;
    };
  }, [token, enabled, bedrooms, tick]);

  return { ...state, reload };
}
