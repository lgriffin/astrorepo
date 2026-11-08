/** How long a library scan has left, in words for the Library page (ING-016). Null says nothing. */
export function timeLeftText(secondsLeft: number | null): string | null {
  if (secondsLeft === null || !Number.isFinite(secondsLeft) || secondsLeft < 0) return null
  if (secondsLeft < 60) return 'less than a minute left'
  const minutes = Math.round(secondsLeft / 60)
  if (minutes < 60) return `about ${minutes} minute${minutes === 1 ? '' : 's'} left`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  const h = `${hours} hour${hours === 1 ? '' : 's'}`
  return rest === 0 ? `about ${h} left` : `about ${h} ${rest} minute${rest === 1 ? '' : 's'} left`
}
