// Persist Google Ads click identifiers (gclid / wbraid / gbraid) from the
// landing URL into cookies scoped to photon.codes, so conversions can be
// attributed after the visitor navigates within the site.
//
// Mintlify auto-includes any `.js` file in the content directory on every
// page and runs it once the page is interactive. That captures the initial
// landing URL, which is all click-ID attribution needs.
//
// A single identifier is stored (Google normally provides one). A genuinely
// new click replaces prior attribution and resets the capture timestamp,
// while a reload of the same click preserves the original 90-day window.

(() => {
  const CLICK_ID_KEYS = ['gclid', 'wbraid', 'gbraid']
  const CLICK_COOKIE_PREFIX = 'photon_'
  const CAPTURED_AT_COOKIE_NAME = 'photon_ads_click_captured_at'
  const COOKIE_DOMAIN = 'photon.codes'
  const COOKIE_MAX_AGE = 90 * 24 * 60 * 60
  const MAX_CLICK_ID_LENGTH = 512
  const COOKIE_ATTRIBUTES
    = `Domain=${COOKIE_DOMAIN}; Path=/; SameSite=Lax; Secure`

  const readCookie = (name) => {
    const prefix = `${name}=`
    const pair = document.cookie
      .split(';')
      .map(item => item.trim())
      .find(item => item.startsWith(prefix))

    if (!pair) {
      return null
    }

    try {
      return decodeURIComponent(pair.slice(prefix.length))
    }
    catch {
      return null
    }
  }

  const writeCookie = (name, value) => {
    document.cookie
      = `${name}=${encodeURIComponent(value)}; `
        + `Max-Age=${COOKIE_MAX_AGE}; ${
          COOKIE_ATTRIBUTES}`
  }

  const deleteCookie = (name) => {
    document.cookie
      = `${name}=; Max-Age=0; ${
        COOKIE_ATTRIBUTES}`
  }

  const params = new URLSearchParams(window.location.search)

  let selectedClick = null

  // Google normally provides only one identifier. This order is the
  // deterministic fallback if a malformed URL contains more than one.
  for (const key of CLICK_ID_KEYS) {
    const value = params.get(key)

    if (value && value.length <= MAX_CLICK_ID_LENGTH) {
      selectedClick = { key, value }
      break
    }
  }

  // Organic/direct visit: preserve any attribution already stored.
  if (!selectedClick) {
    return
  }

  const selectedCookieName
    = `${CLICK_COOKIE_PREFIX}${selectedClick.key}`

  const isSameClick
    = readCookie(selectedCookieName) === selectedClick.value

  if (isSameClick) {
    // Remove stale identifiers of another type, but don't refresh this
    // click's 90-day lifetime merely because the page was reloaded.
    for (const key of CLICK_ID_KEYS) {
      if (key !== selectedClick.key) {
        deleteCookie(`${CLICK_COOKIE_PREFIX}${key}`)
      }
    }

    const existingCapturedAt = Number(
      readCookie(CAPTURED_AT_COOKIE_NAME),
    )

    // Migration path for cookies created by the previous script.
    if (
      !Number.isFinite(existingCapturedAt)
      || existingCapturedAt <= 0
    ) {
      writeCookie(CAPTURED_AT_COOKIE_NAME, String(Date.now()))
    }

    return
  }

  // A genuinely new Google Ads click replaces the previous attribution.
  for (const key of CLICK_ID_KEYS) {
    deleteCookie(`${CLICK_COOKIE_PREFIX}${key}`)
  }
  deleteCookie(CAPTURED_AT_COOKIE_NAME)

  writeCookie(selectedCookieName, selectedClick.value)
  writeCookie(CAPTURED_AT_COOKIE_NAME, String(Date.now()))
})()
