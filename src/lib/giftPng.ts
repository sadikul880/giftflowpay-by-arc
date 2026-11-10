import { giftDesign, wrapLines, type GiftDesignId } from './gift'

export interface GiftPngInput {
  design: GiftDesignId
  /** Display amount such as "25" or "12.5". Shown exactly as funded. */
  amount: string
  from: string
  to: string
  message: string
  /** PNG data URL of a QR code. Only pass one that holds no secret. */
  qrDataUrl?: string
  /** Short line under the QR, for example the claim page address without any secret. */
  qrCaption?: string
  /** Shown instead of a QR, for example "Your sender will send you the link or code." */
  footnote?: string
}

const W = 1200
const H = 750
const FONT = "'DM Sans', system-ui, sans-serif"

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not load an image for the gift card'))
    img.src = src
  })

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/** Renders the branded gift card to a PNG. The caller decides what the QR holds; this function adds nothing else. */
export async function renderGiftPng(input: GiftPngInput): Promise<Blob> {
  const d = giftDesign(input.design)
  await Promise.all([document.fonts.load(`600 40px ${FONT}`), document.fonts.load(`400 20px ${FONT}`)]).catch(() => undefined)

  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Your browser cannot draw the gift card image')

  const bg = ctx.createLinearGradient(0, 0, W, H)
  bg.addColorStop(0, d.from)
  bg.addColorStop(1, d.to)
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)

  const glow = ctx.createRadialGradient(W - 120, 80, 10, W - 120, 80, 460)
  glow.addColorStop(0, `${d.accent}55`)
  glow.addColorStop(1, `${d.accent}00`)
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, W, H)

  ctx.strokeStyle = `${d.accent}66`
  ctx.lineWidth = 3
  roundRect(ctx, 14, 14, W - 28, H - 28, 34)
  ctx.stroke()

  // Brand row
  try {
    const logo = await loadImage('/logo.jpg')
    ctx.save()
    ctx.beginPath()
    ctx.arc(96, 96, 34, 0, Math.PI * 2)
    ctx.clip()
    ctx.drawImage(logo, 62, 62, 68, 68)
    ctx.restore()
  } catch {
    /* the card is still valid without the logo */
  }
  ctx.fillStyle = d.text
  ctx.font = `600 34px ${FONT}`
  ctx.textBaseline = 'middle'
  ctx.fillText('GiftFlowPay', 146, 96)
  ctx.font = `500 22px ${FONT}`
  ctx.fillStyle = d.accent
  ctx.textAlign = 'right'
  ctx.fillText('USDC gift card on Arc', W - 70, 96)
  ctx.textAlign = 'left'

  // Amount
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = d.text
  ctx.font = `600 132px ${FONT}`
  const amountText = `$${input.amount}`
  ctx.fillText(amountText, 70, 330)
  const amountWidth = ctx.measureText(amountText).width
  ctx.font = `500 44px ${FONT}`
  ctx.fillStyle = d.accent
  ctx.fillText('USDC', 70 + amountWidth + 22, 330)

  // Message
  const hasQr = Boolean(input.qrDataUrl)
  const textWidth = hasQr ? 640 : 1060
  if (input.message.trim()) {
    ctx.font = `italic 400 30px ${FONT}`
    const measure = (s: string) => ctx.measureText(s).width
    const lines = wrapLines(input.message.trim(), textWidth, measure, 4)
    ctx.fillStyle = d.text
    lines.forEach((line, i) => ctx.fillText(line, 70, 410 + i * 42))
  }

  // From and to
  ctx.font = `600 18px ${FONT}`
  ctx.fillStyle = `${d.text}aa`
  ctx.fillText('TO', 70, 640)
  ctx.fillText('FROM', 70 + 340, 640)
  ctx.font = `600 32px ${FONT}`
  ctx.fillStyle = d.text
  const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s)
  ctx.fillText(clip(input.to.trim() || 'Someone special', 18), 70, 682)
  ctx.fillText(clip(input.from.trim() || 'A friend', 18), 70 + 340, 682)

  // QR or footnote
  if (input.qrDataUrl) {
    const qr = await loadImage(input.qrDataUrl)
    const size = 280
    const x = W - 70 - size
    const y = 240
    ctx.fillStyle = '#ffffff'
    roundRect(ctx, x - 16, y - 16, size + 32, size + 32, 24)
    ctx.fill()
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(qr, x, y, size, size)
    ctx.imageSmoothingEnabled = true
    ctx.fillStyle = d.text
    ctx.font = `500 20px ${FONT}`
    ctx.textAlign = 'center'
    ctx.fillText('Scan to claim', x + size / 2, y + size + 52)
    if (input.qrCaption) {
      ctx.fillStyle = `${d.text}99`
      ctx.font = `400 16px ${FONT}`
      ctx.fillText(clip(input.qrCaption, 44), x + size / 2, y + size + 80)
    }
    ctx.textAlign = 'left'
  } else if (input.footnote) {
    ctx.fillStyle = `${d.text}aa`
    ctx.font = `400 20px ${FONT}`
    ctx.textAlign = 'right'
    ctx.fillText(clip(input.footnote, 60), W - 70, 682)
    ctx.textAlign = 'left'
  }

  return new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not create the PNG'))), 'image/png'))
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
