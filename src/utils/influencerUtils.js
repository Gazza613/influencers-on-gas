export function gColor(gender) {
  if (gender === 'Female') return '#EC4899'
  if (gender === 'Male')   return '#3B82F6'
  return '#8B5CF6'
}

export function pLabel(v) {
  if (v < 15) return 'Strongly Introverted'
  if (v < 30) return 'Introverted'
  if (v < 43) return 'Slightly Introverted'
  if (v < 57) return 'Balanced'
  if (v < 70) return 'Slightly Extroverted'
  if (v < 85) return 'Extroverted'
  return 'Strongly Extroverted'
}
