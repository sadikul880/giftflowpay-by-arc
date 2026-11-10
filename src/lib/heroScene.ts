import * as THREE from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { damp, pointerInBox } from './motion'

/**
 * The landing page's 3D hero: a glossy GiftFlowPay card with USDC coins in orbit and a field of sparks. It is purely
 * decorative and shows no amounts or balances. It sleeps when off screen or in a hidden tab, and renders a single
 * still frame for people who asked for reduced motion.
 */
export interface HeroSceneHandle {
  dispose(): void
}

const EMERALD = '#34f08a'
const DEEP = '#0f5f35'
const INK = '#06110c'

function roundedRect(w: number, h: number, r: number): THREE.Shape {
  const x = -w / 2
  const y = -h / 2
  const s = new THREE.Shape()
  s.moveTo(x + r, y)
  s.lineTo(x + w - r, y)
  s.quadraticCurveTo(x + w, y, x + w, y + r)
  s.lineTo(x + w, y + h - r)
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  s.lineTo(x + r, y + h)
  s.quadraticCurveTo(x, y + h, x, y + h - r)
  s.lineTo(x, y + r)
  s.quadraticCurveTo(x, y, x + r, y)
  return s
}

function paintCard(ctx: CanvasRenderingContext2D, w: number, h: number, logo?: HTMLImageElement) {
  const bg = ctx.createLinearGradient(0, 0, w, h)
  bg.addColorStop(0, '#13763f')
  bg.addColorStop(0.45, DEEP)
  bg.addColorStop(1, INK)
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, w, h)

  // Soft light in the top corner and faint concentric arcs, like a printed card.
  const glow = ctx.createRadialGradient(w * 0.86, h * 0.1, 10, w * 0.86, h * 0.1, w * 0.7)
  glow.addColorStop(0, 'rgba(52,240,138,0.5)')
  glow.addColorStop(1, 'rgba(52,240,138,0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, w, h)
  ctx.strokeStyle = 'rgba(52,240,138,0.14)'
  ctx.lineWidth = 2
  for (let i = 1; i <= 6; i++) {
    ctx.beginPath()
    ctx.arc(w * 0.9, h * 1.05, i * 110, Math.PI, Math.PI * 1.5)
    ctx.stroke()
  }

  const pad = 64
  if (logo) {
    ctx.save()
    ctx.beginPath()
    ctx.arc(pad + 34, pad + 34, 34, 0, Math.PI * 2)
    ctx.clip()
    ctx.drawImage(logo, pad, pad, 68, 68)
    ctx.restore()
  }
  ctx.fillStyle = '#eaf4ee'
  ctx.font = "600 46px 'DM Sans', system-ui, sans-serif"
  ctx.textBaseline = 'middle'
  ctx.fillText('GiftFlowPay', pad + 90, pad + 34)

  ctx.textAlign = 'right'
  ctx.fillStyle = EMERALD
  ctx.font = "500 28px 'DM Sans', system-ui, sans-serif"
  ctx.fillText('USDC on Arc', w - pad, pad + 34)
  ctx.textAlign = 'left'

  ctx.fillStyle = '#eaf4ee'
  ctx.font = "600 78px 'DM Sans', system-ui, sans-serif"
  ctx.textBaseline = 'alphabetic'
  ctx.fillText('Send. Reward.', pad, h - 178)
  ctx.fillStyle = EMERALD
  ctx.fillText('Pay.', pad, h - 94)
  ctx.fillStyle = 'rgba(234,244,238,0.72)'
  ctx.font = "400 26px 'DM Sans', system-ui, sans-serif"
  ctx.fillText('Create once. Fund once. Distribute by rules.', pad, h - 44)
}

function cardTexture(): { texture: THREE.CanvasTexture; redraw: (logo: HTMLImageElement) => void } {
  const canvas = document.createElement('canvas')
  canvas.width = 1280
  canvas.height = 800
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D canvas unavailable')
  paintCard(ctx, canvas.width, canvas.height)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 8
  return {
    texture,
    redraw: (logo) => {
      paintCard(ctx, canvas.width, canvas.height, logo)
      texture.needsUpdate = true
    },
  }
}

function coinTexture(): THREE.CanvasTexture {
  const s = 256
  const canvas = document.createElement('canvas')
  canvas.width = s
  canvas.height = s
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D canvas unavailable')
  const g = ctx.createRadialGradient(s * 0.35, s * 0.3, 10, s / 2, s / 2, s / 2)
  g.addColorStop(0, '#7dffb4')
  g.addColorStop(0.55, '#22c870')
  g.addColorStop(1, '#0d6b3b')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, s, s)
  ctx.strokeStyle = 'rgba(255,255,255,0.55)'
  ctx.lineWidth = 6
  ctx.beginPath()
  ctx.arc(s / 2, s / 2, s * 0.42, 0, Math.PI * 2)
  ctx.stroke()
  ctx.fillStyle = 'rgba(3,40,22,0.92)'
  ctx.font = "700 150px 'DM Sans', system-ui, sans-serif"
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('$', s / 2, s / 2 + 8)
  const t = new THREE.CanvasTexture(canvas)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

function glowTexture(): THREE.CanvasTexture {
  const s = 256
  const canvas = document.createElement('canvas')
  canvas.width = s
  canvas.height = s
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D canvas unavailable')
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2)
  g.addColorStop(0, 'rgba(52,240,138,0.55)')
  g.addColorStop(0.5, 'rgba(52,240,138,0.14)')
  g.addColorStop(1, 'rgba(52,240,138,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, s, s)
  const t = new THREE.CanvasTexture(canvas)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

interface Coin {
  mesh: THREE.Mesh
  radius: number
  speed: number
  phase: number
  lift: number
  spin: number
  tilt: number
}

export function createHeroScene(host: HTMLElement, opts: { reducedMotion: boolean }): HeroSceneHandle {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.05
  renderer.domElement.style.cssText = 'width:100%;height:100%;display:block;touch-action:pan-y'
  renderer.domElement.setAttribute('aria-hidden', 'true')
  host.appendChild(renderer.domElement)

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 60)

  // Reflections without a downloaded image: a small built-in studio environment.
  const pmrem = new THREE.PMREMGenerator(renderer)
  const envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  scene.environment = envTexture
  scene.environmentIntensity = 0.85

  const key = new THREE.DirectionalLight(0x9dffc8, 2.2)
  key.position.set(4, 5, 6)
  scene.add(key)
  const rim = new THREE.DirectionalLight(0x34f08a, 1.6)
  rim.position.set(-5, -2, -3)
  scene.add(rim)
  scene.add(new THREE.AmbientLight(0x4c8a69, 0.35))

  const rig = new THREE.Group()
  scene.add(rig)

  // Card body: a rounded slab with bevelled edges.
  const W = 4.4
  const H = 2.75
  const body = new THREE.ExtrudeGeometry(roundedRect(W, H, 0.24), { depth: 0.08, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 4, curveSegments: 28 })
  body.center()
  const bodyMat = new THREE.MeshPhysicalMaterial({ color: 0x0b3b24, metalness: 0.7, roughness: 0.26, clearcoat: 1, clearcoatRoughness: 0.12 })
  const card = new THREE.Mesh(body, bodyMat)
  rig.add(card)

  const { texture: face, redraw } = cardTexture()
  const faceGeo = new THREE.PlaneGeometry(W - 0.07, H - 0.07)
  const faceMat = new THREE.MeshPhysicalMaterial({ map: face, emissiveMap: face, emissive: 0xffffff, emissiveIntensity: 0.28, metalness: 0.15, roughness: 0.38, clearcoat: 0.7, clearcoatRoughness: 0.2 })
  const faceMesh = new THREE.Mesh(faceGeo, faceMat)
  faceMesh.position.z = 0.062
  rig.add(faceMesh)

  // Halo behind the card.
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.9 }))
  halo.scale.set(9.5, 7, 1)
  halo.position.z = -1.2
  rig.add(halo)

  // USDC coins in orbit.
  const coinTex = coinTexture()
  const coinGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.07, 56)
  const edge = new THREE.MeshPhysicalMaterial({ color: 0x1fb867, metalness: 0.9, roughness: 0.22, clearcoat: 0.6 })
  const faceCoin = new THREE.MeshPhysicalMaterial({ map: coinTex, metalness: 0.55, roughness: 0.3, clearcoat: 0.8 })
  const coins: Coin[] = []
  const specs = [
    { radius: 3.3, speed: 0.34, phase: 0.2, lift: 0.9, scale: 1, spin: 1.2, tilt: 0.5 },
    { radius: 3.7, speed: -0.27, phase: 1.7, lift: -0.8, scale: 0.8, spin: 1.7, tilt: -0.4 },
    { radius: 2.9, speed: 0.42, phase: 3.1, lift: 1.5, scale: 0.65, spin: 2.1, tilt: 0.9 },
    { radius: 4.1, speed: 0.22, phase: 4.4, lift: -1.4, scale: 1.1, spin: 1, tilt: -0.7 },
    { radius: 3.2, speed: -0.38, phase: 5.3, lift: 0.1, scale: 0.55, spin: 2.4, tilt: 0.2 },
    { radius: 4.4, speed: 0.19, phase: 2.4, lift: 1.1, scale: 0.7, spin: 1.5, tilt: -0.2 },
  ]
  for (const s of specs) {
    const mesh = new THREE.Mesh(coinGeo, [edge, faceCoin, faceCoin])
    mesh.scale.setScalar(s.scale)
    scene.add(mesh)
    coins.push({ mesh, radius: s.radius, speed: s.speed, phase: s.phase, lift: s.lift, spin: s.spin, tilt: s.tilt })
  }

  // Sparks.
  const COUNT = 260
  const positions = new Float32Array(COUNT * 3)
  for (let i = 0; i < COUNT; i++) {
    const r = 3.6 + Math.random() * 4.5
    const th = Math.random() * Math.PI * 2
    const ph = Math.acos(2 * Math.random() - 1)
    positions[i * 3] = r * Math.sin(ph) * Math.cos(th)
    positions[i * 3 + 1] = r * Math.sin(ph) * Math.sin(th) * 0.7
    positions[i * 3 + 2] = r * Math.cos(ph) - 2
  }
  const sparkGeo = new THREE.BufferGeometry()
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  const sparkMat = new THREE.PointsMaterial({ color: 0x7dffb4, size: 0.045, transparent: true, opacity: 0.75, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true })
  const sparks = new THREE.Points(sparkGeo, sparkMat)
  scene.add(sparks)

  let logo: HTMLImageElement | undefined = new Image()
  logo.onload = () => {
    if (logo) redraw(logo)
    if (opts.reducedMotion) renderOnce()
  }
  logo.src = '/logo.jpg'

  // Size and framing: pull the camera back on narrow screens so the whole card stays in view.
  const resize = () => {
    const w = Math.max(1, host.clientWidth)
    const h = Math.max(1, host.clientHeight)
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    camera.position.set(0, 0, 9.5 / Math.min(1, camera.aspect * 0.95))
    camera.updateProjectionMatrix()
  }
  resize()

  // Pointer parallax, relative to the hero. Far from the hero the card settles back to centre.
  const target = { x: 0, y: 0 }
  const smooth = { x: 0, y: 0 }
  const onPointer = (e: PointerEvent) => {
    if (e.pointerType === 'touch') return
    const rect = host.getBoundingClientRect()
    const p = pointerInBox(e.clientX, e.clientY, rect)
    const outside = e.clientX < rect.left - 240 || e.clientX > rect.right + 240 || e.clientY < rect.top - 240 || e.clientY > rect.bottom + 240
    target.x = outside ? 0 : p.x
    target.y = outside ? 0 : p.y
  }
  if (!opts.reducedMotion) window.addEventListener('pointermove', onPointer, { passive: true })

  const frame = (t: number, dt: number) => {
    smooth.x = damp(smooth.x, target.x, 4, dt)
    smooth.y = damp(smooth.y, target.y, 4, dt)
    rig.rotation.y = smooth.x * 0.42 + Math.sin(t * 0.45) * 0.16
    rig.rotation.x = -smooth.y * 0.28 + Math.cos(t * 0.38) * 0.05 - 0.04
    rig.position.y = Math.sin(t * 0.8) * 0.13
    rig.position.x = smooth.x * 0.18
    for (const c of coins) {
      const a = t * c.speed + c.phase
      c.mesh.position.set(Math.cos(a) * c.radius * 0.92 + smooth.x * 0.25, Math.sin(a * 1.3) * 0.7 + c.lift + smooth.y * -0.18, Math.sin(a) * c.radius * 0.55 - 0.6)
      c.mesh.rotation.set(Math.PI / 2 + c.tilt + Math.sin(t * 0.6 + c.phase) * 0.25, t * c.spin * 0.5, 0)
    }
    sparks.rotation.y = t * 0.025
    sparks.rotation.x = Math.sin(t * 0.1) * 0.05
    renderer.render(scene, camera)
  }

  function renderOnce() {
    // A still, slightly turned view for reduced motion.
    frame(1.2, 0.016)
  }

  let raf = 0
  let last = 0
  let visible = true
  let tabVisible = !document.hidden
  let stamp = performance.now()
  const delta = () => {
    const now = performance.now()
    const d = (now - stamp) / 1000
    stamp = now
    return d
  }
  const tick = () => {
    raf = requestAnimationFrame(tick)
    const dt = Math.min(delta(), 0.05)
    last += dt
    frame(last, dt)
  }
  const start = () => {
    if (raf || opts.reducedMotion) return
    delta()
    raf = requestAnimationFrame(tick)
  }
  const stop = () => {
    cancelAnimationFrame(raf)
    raf = 0
  }
  const sync = () => (visible && tabVisible ? start() : stop())

  const io = new IntersectionObserver((entries) => {
    visible = entries.some((e) => e.isIntersecting)
    sync()
  })
  io.observe(host)
  const onVis = () => {
    tabVisible = !document.hidden
    sync()
  }
  document.addEventListener('visibilitychange', onVis)

  const ro = new ResizeObserver(() => {
    resize()
    if (opts.reducedMotion) renderOnce()
  })
  ro.observe(host)

  if (opts.reducedMotion) renderOnce()
  else start()

  return {
    dispose() {
      stop()
      io.disconnect()
      ro.disconnect()
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('pointermove', onPointer)
      logo = undefined
      scene.traverse((o) => {
        const m = o as THREE.Mesh
        m.geometry?.dispose()
        const mat = m.material as THREE.Material | THREE.Material[] | undefined
        for (const x of Array.isArray(mat) ? mat : mat ? [mat] : []) {
          const withMap = x as THREE.Material & { map?: THREE.Texture | null; emissiveMap?: THREE.Texture | null }
          withMap.map?.dispose()
          withMap.emissiveMap?.dispose()
          x.dispose()
        }
      })
      envTexture.dispose()
      pmrem.dispose()
      renderer.dispose()
      renderer.forceContextLoss()
      renderer.domElement.remove()
    },
  }
}
