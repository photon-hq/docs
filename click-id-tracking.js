// Persist Google Ads click identifiers (gclid / gbraid / wbraid) from the
// landing URL into cookies scoped to photon.codes, so conversions can be
// attributed after the visitor navigates within the site.
//
// Mintlify auto-includes any `.js` file in the content directory on every
// page and runs it once the page is interactive. That captures the initial
// landing URL, which is all click-ID attribution needs.

const CLICK_ID_KEYS = ['gclid', 'gbraid', 'wbraid']
const COOKIE_MAX_AGE = 90 * 24 * 60 * 60

const params = new URLSearchParams(window.location.search)

for (const key of CLICK_ID_KEYS) {
  const value = params.get(key)

  if (value) {
    document.cookie
      = `photon_${key}=${encodeURIComponent(value)}; `
        + `Domain=photon.codes; `
        + `Max-Age=${COOKIE_MAX_AGE}; `
        + `Path=/; `
        + `SameSite=Lax; `
        + `Secure`
  }
}
