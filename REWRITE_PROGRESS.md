# Rewrite progress — people in IPAlpha core (CONTRACTS_ACAMPA §16)

Temporary tracking file; deleted in the final commit of the rewrite.

## Steps

- [x] 1. Auth: core roles (§10 keys, gentle labels, 5 langs), challenge SMS login, NOT_IN_PROJECT,
      401 / SESSION_ENDED → login with a gentle note, role chooser + role/camp switch (same token)
- [x] 2. Offline: encrypted IndexedDB copy (AES-GCM, key from GET /api/auth/offline-key, never
      persisted), wipe on logout / role switch / camp switch / 401 / camp end; drop `acampa.data.v1`
- [ ] 3. People layer: live names cache (paged lists + POST /api/people/names), paging hook,
      per-person on-demand data (phone / health / contacts)
- [ ] 4. Camp-ops records (Camper / Staff without person data) across every screen; personId identity
- [ ] 5. Removed features: admin handover, AI sex guess, SMS redirect / test phones, local OTP,
      Comtele / SendGrid settings, duty lists now project roles
- [ ] 6. Lists: neutral ♥, health-tag filter with count chips, name filter ≤ 6 shows details
- [ ] 7. Templates editor (settings): list / edit / reset, 5 languages, SMS 160 counter, variable chips
- [ ] 8. Imports / registration (incl. second responsável), exports with live data, Sobre backup v3
- [ ] 9. Cleanup: dev previews / fixtures removed, final tests + build

## Notes

- Duty-list settings pages (organizers, games, photographers, medical, vests, SMS redirect, sample
  e-mails, admin handover) removed in step 1: the roles live in IPAlpha.
- `src/dev` previews + fixtures removed (dev/QA tooling must not ship).
- `styles.css` renamed to `styles.scss`.
