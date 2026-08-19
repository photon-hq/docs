(() => {
  const CLICK_ID_KEYS = ['gclid', 'wbraid', 'gbraid']
  const COOKIE_PREFIX = 'photon_'
  const CAPTURED_AT_COOKIE = 'photon_ads_click_captured_at'
  const COOKIE_DOMAIN = 'photon.codes'
  const COOKIE_MAX_AGE_SECONDS = 90 * 24 * 60 * 60
  const MAX_CLICK_ID_LENGTH = 512

  const cookieAttributes
    = `Domain=${COOKIE_DOMAIN}; Path=/; SameSite=Lax; Secure`

  const readCookie = (name) => {
    const prefix = `${name}=`
    const cookie = document.cookie
      .split(';')
      .map(item => item.trim())
      .find(item => item.startsWith(prefix))

    if (!cookie) {
      return null
    }

    try {
      return decodeURIComponent(cookie.slice(prefix.length))
    }
    catch {
      return null
    }
  }

  const writeCookie = (name, value) => {
    document.cookie
      = `${name}=${encodeURIComponent(value)}; `
        + `Max-Age=${COOKIE_MAX_AGE_SECONDS}; ${
          cookieAttributes}`
  }

  const deleteCookie = (name) => {
    document.cookie
      = `${name}=; Max-Age=0; ${cookieAttributes}`
  }

  const params = new URLSearchParams(window.location.search)

  const selectedClick = CLICK_ID_KEYS
    .map(type => ({
      type,
      value: params.get(type),
    }))
    .find(
      ({ value }) =>
        value
        && value.trim().length > 0
        && value.length <= MAX_CLICK_ID_LENGTH,
    )

  // 没有新的 Google Ads 点击参数时，保留现有归因。
  if (!selectedClick) {
    return
  }

  const cookieName = `${COOKIE_PREFIX}${selectedClick.type}`
  const isSameClick
    = readCookie(cookieName) === selectedClick.value

  // 同一次点击：不刷新 90 天有效期，只清除其他类型的 click ID。
  if (isSameClick) {
    for (const type of CLICK_ID_KEYS) {
      if (type !== selectedClick.type) {
        deleteCookie(`${COOKIE_PREFIX}${type}`)
      }
    }

    const capturedAt = Number(readCookie(CAPTURED_AT_COOKIE))

    if (!Number.isInteger(capturedAt) || capturedAt <= 0) {
      writeCookie(CAPTURED_AT_COOKIE, String(Date.now()))
    }

    return
  }

  // 新点击替换旧归因。
  for (const type of CLICK_ID_KEYS) {
    deleteCookie(`${COOKIE_PREFIX}${type}`)
  }

  deleteCookie(CAPTURED_AT_COOKIE)

  const capturedAt = Date.now()

  writeCookie(cookieName, selectedClick.value)
  writeCookie(CAPTURED_AT_COOKIE, String(capturedAt))
})()
