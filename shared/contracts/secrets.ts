/** What looks like a secret, masked before text leaves or is recorded; the plugin's, so no profile leaves one out. */
export const SECRETS: readonly string[] = [
  "AKIA[0-9A-Z]{16}",
  "-----BEGIN [A-Z ]*PRIVATE KEY-----",
  "\\bgh[pousr]_[A-Za-z0-9]{36,}",
  "\\bsk-[A-Za-z0-9_-]{20,}",
  "\\bxox[abprs]-[A-Za-z0-9-]{10,}",
  "\\bAIza[0-9A-Za-z_-]{35}",
];
