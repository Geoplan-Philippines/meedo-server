/**
 * Geographic location of the office where the biometric device lives (Geoplan
 * Philippines, Inc.). A door tap always happens here, so this is stamped on
 * every biometric event.
 */
export const OFFICE_LOCATION = {
  latitude: 14.6014391,
  longitude: 121.013768,
} as const;

/** One raw door-access tap pulled from the biometric device. */
export interface BiometricTap {
  /** Device-side employee number, matched against `User.biometricsId`. */
  biometricsId: string;
  /** UTC instant of the tap. */
  timestamp: Date;
  /** Stable per-tap key used to dedupe overlapping poll windows. */
  externalId: string;
}

/** ISAPI access-control event-search endpoint (JSON). */
export const ACS_EVENT_PATH = '/ISAPI/AccessControl/AcsEvent?format=json';

/** Page size when paging the device event log. */
export const ACS_EVENT_PAGE_SIZE = 30;

/** Safety cap on pages fetched per sync so a runaway log can't loop forever. */
export const ACS_EVENT_MAX_PAGES = 100;

/**
 * How often the device is polled for new taps. At 3 minutes the server/device
 * load is negligible; a tap surfaces within a few minutes rather than seconds.
 */
export const SYNC_INTERVAL_MS = 3 * 60 * 1000;

/**
 * Overlap re-scanned on every poll. The window starts slightly before where the
 * last poll ended so events landing right on the boundary are never missed;
 * `externalId` dedupe makes the re-scan harmless.
 */
export const SYNC_OVERLAP_MS = 2 * 60 * 1000;

/**
 * Hard floor on how far back a single sync may look. Bounds the very first run
 * (and any run after long downtime) so it can't try to replay the whole log.
 */
export const SYNC_MAX_LOOKBACK_MS = 24 * 60 * 60 * 1000;
