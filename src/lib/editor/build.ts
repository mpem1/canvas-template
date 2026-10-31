/**
 * Build stamp — bumped on every client-affecting change. Exposed as
 * window.__PF_BUILD and logged to the console on boot so a stale client
 * bundle (tab kept open across deploys, dead HMR socket) can be detected
 * at a glance when debugging "the bug is still there" reports.
 */
export const PF_BUILD = "2026-10-31.4";
