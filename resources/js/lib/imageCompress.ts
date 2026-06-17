// Kompresi gambar di sisi browser sebelum upload (audit 2026-06-17).
//
// Foto HP modern sering 2-5MB / 4000px+, melebihi batas upload server (PHP
// upload_max_filesize). Resize ke dimensi wajar + re-encode JPEG memangkasnya
// jauh di bawah batas tanpa perubahan server sama sekali — pola standar app chat
// (upload lebih cepat, hemat kuota). File non-gambar / sudah kecil diteruskan apa adanya.

/** Batas keras server (PHP upload_max_filesize=2M). Guard FE memberi pesan jelas
 *  alih-alih error server membingungkan "files failed to upload". */
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024

const COMPRESSIBLE = /^image\/(jpeg|png|webp)$/ // bukan gif (animasi) / svg

type Opts = { maxDimension?: number; targetBytes?: number; minBytesToBother?: number }

/**
 * Kembalikan versi terkompresi bila file gambar besar; selain itu file asli.
 * Tak pernah throw — kegagalan apa pun → file asli (guard ukuran di pemanggil
 * yang menangani bila tetap kebesaran).
 */
export async function compressImageFile(file: File, opts: Opts = {}): Promise<File> {
  const { maxDimension = 1920, targetBytes = 1.6 * 1024 * 1024, minBytesToBother = 800 * 1024 } = opts

  if (!COMPRESSIBLE.test(file.type) || file.size <= minBytesToBother) return file

  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height))
    const w = Math.max(1, Math.round(bitmap.width * scale))
    const h = Math.max(1, Math.round(bitmap.height * scale))

    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) { bitmap.close?.(); return file }

    // Latar putih: PNG transparan → JPEG tak jadi hitam.
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, w, h)
    ctx.drawImage(bitmap, 0, 0, w, h)
    bitmap.close?.()

    let quality = 0.85
    let blob = await canvasToBlob(canvas, quality)
    while (blob && blob.size > targetBytes && quality > 0.4) {
      quality -= 0.12
      blob = await canvasToBlob(canvas, quality)
    }

    if (!blob || blob.size >= file.size) return file // kompresi tak membantu → asli

    const name = file.name.replace(/\.[^.]+$/, '') + '.jpg'
    return new File([blob], name, { type: 'image/jpeg', lastModified: file.lastModified })
  } catch {
    return file
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
}
