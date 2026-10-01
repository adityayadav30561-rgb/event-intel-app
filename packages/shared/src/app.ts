/** Product identity shared by the app and the API. */
export const APP = {
  name: 'Event Intelligence India',
  shortName: 'Event Intel',
  /** All date logic runs in India time unless an event carries its own timezone. */
  timezone: 'Asia/Kolkata',
  /** Where the team opens the app (and adds it to the Home Screen). */
  url: 'https://event-intelligence-india.expo.app',
} as const;

/**
 * The product journey. The app's responsibility ends at VISIT:
 * lead capture happens outside this app, in the team's existing Excel workflow.
 */
export const PRODUCT_JOURNEY = ['Discover', 'Evaluate', 'Track', 'Remember', 'Visit'] as const;
