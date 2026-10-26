/**
 * Production builds must leave preview mode disabled.
 * CI deliberately flips only generated JavaScript for its visual-fixture screenshot.
 */
export const PREVIEW_MODE = false;

/**
 * Temporary branch-only screen for debugging the receiver without Pebble's
 * Developer Connection. Do not cherry-pick this flag into the production branch.
 */
export const DIAGNOSTIC_MODE = true;
