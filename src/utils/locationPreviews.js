// Location background previews — stored locally in /public/locations (owned by GAS).
// Downloaded from the original CDN so they never break if that source disappears.
// Keys: "{location-id}-{time-id}"
const LOCATION_PREVIEWS = {
  'coffee-shop-morning': '/locations/coffee-shop-morning.webp',
  'coffee-shop-afternoon': '/locations/coffee-shop-afternoon.webp',
  'coffee-shop-golden-hour': '/locations/coffee-shop-golden-hour.webp',
  'coffee-shop-night': '/locations/coffee-shop-night.webp',
  'city-street-morning': '/locations/city-street-morning.webp',
  'city-street-afternoon': '/locations/city-street-afternoon.webp',
  'city-street-golden-hour': '/locations/city-street-golden-hour.webp',
  'city-street-night': '/locations/city-street-night.webp',
  'beach-morning': '/locations/beach-morning.webp',
  'beach-afternoon': '/locations/beach-afternoon.webp',
  'beach-golden-hour': '/locations/beach-golden-hour.webp',
  'beach-night': '/locations/beach-night.webp',
  'rooftop-morning': '/locations/rooftop-morning.webp',
  'rooftop-afternoon': '/locations/rooftop-afternoon.webp',
  'rooftop-golden-hour': '/locations/rooftop-golden-hour.webp',
  'rooftop-night': '/locations/rooftop-night.webp',
  'bedroom-morning': '/locations/bedroom-morning.webp',
  'bedroom-afternoon': '/locations/bedroom-afternoon.webp',
  'bedroom-golden-hour': '/locations/bedroom-golden-hour.webp',
  'bedroom-night': '/locations/bedroom-night.webp',
  'bathroom-morning': '/locations/bathroom-morning.webp',
  'bathroom-afternoon': '/locations/bathroom-afternoon.webp',
  'bathroom-golden-hour': '/locations/bathroom-golden-hour.webp',
  'bathroom-night': '/locations/bathroom-night.webp',
  'mall-morning': '/locations/mall-morning.webp',
  'mall-afternoon': '/locations/mall-afternoon.webp',
  'mall-golden-hour': '/locations/mall-golden-hour.webp',
  'mall-night': '/locations/mall-night.webp',
  'gym-morning': '/locations/gym-morning.webp',
  'gym-afternoon': '/locations/gym-afternoon.webp',
  'gym-golden-hour': '/locations/gym-golden-hour.webp',
  'gym-night': '/locations/gym-night.webp',
  'park-morning': '/locations/park-morning.webp',
  'park-afternoon': '/locations/park-afternoon.webp',
  'park-golden-hour': '/locations/park-golden-hour.webp',
  'park-night': '/locations/park-night.webp',
  'restaurant-morning': '/locations/restaurant-morning.webp',
  'restaurant-afternoon': '/locations/restaurant-afternoon.webp',
  'restaurant-golden-hour': '/locations/restaurant-golden-hour.webp',
  'restaurant-night': '/locations/restaurant-night.webp',
  'hotel-morning': '/locations/hotel-morning.webp',
  'hotel-afternoon': '/locations/hotel-afternoon.webp',
  'hotel-golden-hour': '/locations/hotel-golden-hour.webp',
  'hotel-night': '/locations/hotel-night.webp',
  'studio-morning': '/locations/studio-morning.webp',
  'studio-afternoon': '/locations/studio-afternoon.webp',
  'studio-golden-hour': '/locations/studio-golden-hour.webp',
  'studio-night': '/locations/studio-night.webp',
}

export default LOCATION_PREVIEWS

// Preload all location preview images so they're cached before Photo Studio opens.
if (typeof window !== 'undefined') {
  const kick = () => Object.values(LOCATION_PREVIEWS).forEach(url => { const img = new Image(); img.src = url })
  if (typeof requestIdleCallback !== 'undefined') {
    requestIdleCallback(kick, { timeout: 2000 })
  } else {
    setTimeout(kick, 0)
  }
}