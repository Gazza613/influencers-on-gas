export function downloadImage(src, filename = 'image.jpg') {
  let href
  let isBlob = false
  if (src.startsWith('data:')) {
    // Data URL → convert to blob synchronously
    const arr = src.split(',')
    const mime = arr[0].match(/:(.*?);/)[1]
    const bstr = atob(arr[1])
    const u8arr = new Uint8Array(bstr.length)
    for (let i = 0; i < bstr.length; i++) u8arr[i] = bstr.charCodeAt(i)
    href = URL.createObjectURL(new Blob([u8arr], { type: mime }))
    isBlob = true
  } else if (!src.startsWith('http')) {
    // Same-origin path — download attribute works directly
    href = src
  } else {
    // Cross-origin CDN → route through proxy to bypass CORS
    href = `/api/img-proxy?url=${encodeURIComponent(src)}&name=${encodeURIComponent(filename)}`
  }
  const a = document.createElement('a')
  a.href = href
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  if (isBlob) URL.revokeObjectURL(href)
}

export function compressImage(dataUrl, maxPx = 1400, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      try {
        const scale = Math.min(1, maxPx / Math.max(img.width, img.height))
        const w = Math.round(img.width * scale)
        const h = Math.round(img.height * scale)
        const canvas = document.createElement('canvas')
        canvas.width = w; canvas.height = h
        canvas.getContext('2d').drawImage(img, 0, 0, w, h)
        resolve(canvas.toDataURL('image/jpeg', quality))
      } catch (e) {
        resolve(dataUrl) // fall back to original if compression fails
      }
    }
    img.onerror = () => resolve(dataUrl) // fall back to original on load error
    img.src = dataUrl
  })
}
