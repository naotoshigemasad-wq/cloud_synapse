'use client'

import { getKeywords, createTheme, getItems, type Keyword } from '@/lib/api'
import { useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState, Suspense } from 'react'
import { useGasToken } from '@/hooks/useGasToken'

declare global { interface Window { THREE: any } }

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])
  return isMobile
}

const FONT_CONFIG: Record<string, {
  font: string; weight: string; style: string
  color: string; shadowColor: string; shadowBlur: number
  letterSpacing: number; alpha: number; outline: boolean
}> = {
  ultra:     { font:'"Noto Sans JP",sans-serif',     weight:'900', style:'normal', color:'rgba(255,255,255,0.96)',  shadowColor:'rgba(180,220,255,0.9)', shadowBlur:28, letterSpacing:2,  alpha:0.95, outline:false },
  condensed: { font:'"Noto Sans JP",sans-serif',     weight:'700', style:'normal', color:'rgba(180,210,255,0.90)', shadowColor:'rgba(100,160,255,0.7)', shadowBlur:18, letterSpacing:-2, alpha:0.88, outline:false },
  expanded:  { font:'"Noto Sans JP",sans-serif',     weight:'300', style:'normal', color:'rgba(160,200,255,0.85)', shadowColor:'rgba(80,140,255,0.6)',  shadowBlur:14, letterSpacing:6,  alpha:0.85, outline:false },
  ghost:     { font:'"Noto Sans JP",sans-serif',     weight:'200', style:'normal', color:'rgba(200,220,255,0.30)', shadowColor:'rgba(100,150,255,0.2)', shadowBlur:8,  letterSpacing:4,  alpha:0.35, outline:false },
  outline:   { font:'"Noto Sans JP",sans-serif',     weight:'700', style:'normal', color:'rgba(0,0,0,0)',          shadowColor:'rgba(130,190,255,0.6)', shadowBlur:0,  letterSpacing:2,  alpha:0.80, outline:true  },
  italic:    { font:'"Noto Serif JP",Georgia,serif', weight:'400', style:'italic', color:'rgba(220,200,255,0.88)', shadowColor:'rgba(160,100,255,0.7)', shadowBlur:20, letterSpacing:1,  alpha:0.88, outline:false },
  neon:      { font:'"Noto Sans JP",sans-serif',     weight:'700', style:'normal', color:'rgba(120,240,210,0.95)', shadowColor:'rgba(60,220,180,0.9)',  shadowBlur:32, letterSpacing:3,  alpha:0.92, outline:false },
  serif:     { font:'"Noto Serif JP",Georgia,serif', weight:'700', style:'normal', color:'rgba(240,220,190,0.88)', shadowColor:'rgba(200,160,80,0.6)',  shadowBlur:16, letterSpacing:2,  alpha:0.88, outline:false },
  serifL:    { font:'"Noto Serif JP",Georgia,serif', weight:'200', style:'normal', color:'rgba(220,210,200,0.72)', shadowColor:'rgba(180,150,100,0.4)', shadowBlur:10, letterSpacing:5,  alpha:0.75, outline:false },
  waveFont:  { font:'"Noto Sans JP",sans-serif',     weight:'400', style:'normal', color:'rgba(180,240,255,0.88)', shadowColor:'rgba(80,200,240,0.8)',  shadowBlur:24, letterSpacing:8,  alpha:0.88, outline:false },
}

const FONT_CONFIG_LIGHT: Record<string, Partial<typeof FONT_CONFIG[string]>> = {
  ultra:    { color:'rgba(10,20,80,0.96)',   shadowColor:'rgba(30,60,180,0.6)'  },
  condensed:{ color:'rgba(20,40,140,0.90)',  shadowColor:'rgba(40,80,200,0.5)'  },
  expanded: { color:'rgba(30,60,160,0.85)',  shadowColor:'rgba(40,90,200,0.4)'  },
  ghost:    { color:'rgba(30,60,160,0.25)',  shadowColor:'rgba(40,80,200,0.15)' },
  outline:  { color:'rgba(0,0,0,0)',         shadowColor:'rgba(30,80,200,0.5)'  },
  italic:   { color:'rgba(80,30,160,0.85)',  shadowColor:'rgba(100,40,200,0.5)' },
  neon:     { color:'rgba(0,140,100,0.90)',  shadowColor:'rgba(0,180,130,0.6)'  },
  serif:    { color:'rgba(100,60,0,0.85)',   shadowColor:'rgba(140,80,0,0.4)'   },
  serifL:   { color:'rgba(80,50,20,0.70)',   shadowColor:'rgba(120,80,30,0.3)'  },
  waveFont: { color:'rgba(0,120,160,0.85)',  shadowColor:'rgba(0,160,200,0.5)'  },
}

function getFontConfig(fontKey: string, dark: boolean) {
  const base = FONT_CONFIG[fontKey] || FONT_CONFIG.condensed
  if (dark) return base
  return { ...base, ...(FONT_CONFIG_LIGHT[fontKey] || {}) }
}

function drawKeyword(text: string, fontKey: string, dark: boolean, scale = 1): HTMLCanvasElement {
  const cfg = getFontConfig(fontKey, dark)
  const cv  = document.createElement('canvas')
  cv.width = 512; cv.height = 128
  const ctx = cv.getContext('2d')!
  ctx.clearRect(0, 0, 512, 128)
  const charCount = Array.from(text).length
  const fs = Math.min(52, Math.max(28, Math.floor(440 / charCount))) * scale
  ctx.save()
  ctx.font         = `${cfg.style} ${cfg.weight} ${fs}px ${cfg.font}`
  ctx.textBaseline = 'middle'; ctx.textAlign = 'center'
  ctx.globalAlpha  = cfg.alpha
  ctx.shadowBlur   = cfg.shadowBlur; ctx.shadowColor = cfg.shadowColor
  if (cfg.letterSpacing !== 0) {
    const chars  = Array.from(text)
    const widths = chars.map(c => ctx.measureText(c).width)
    const total  = widths.reduce((a, b) => a + b, 0) + cfg.letterSpacing * (chars.length - 1)
    let x = 256 - total / 2
    chars.forEach((c, i) => {
      if (cfg.outline) { ctx.strokeStyle = cfg.shadowColor; ctx.lineWidth = 1.5; ctx.strokeText(c, x + widths[i]/2, 64) }
      ctx.fillStyle = cfg.color; ctx.fillText(c, x + widths[i]/2, 64)
      x += widths[i] + cfg.letterSpacing
    })
  } else {
    if (cfg.outline) { ctx.strokeStyle = cfg.shadowColor; ctx.lineWidth = 1.5; ctx.strokeText(text, 256, 64) }
    ctx.fillStyle = cfg.color; ctx.fillText(text, 256, 64)
  }
  ctx.restore()
  return cv
}

function getAnimInit(animKey: string, mesh: any) {
  const orig = mesh.position.clone()
  switch(animKey) {
    case 'rise':    mesh.position.y -= 80; mesh.material.opacity = 0; break
    case 'fall':    mesh.position.y += 80; mesh.material.opacity = 0; break
    case 'scatter': mesh.position.x += (Math.random()-.5)*300; mesh.position.z += (Math.random()-.5)*300; mesh.material.opacity = 0; break
    case 'scale':   mesh.scale.multiplyScalar(0.01); mesh.material.opacity = 0; break
    case 'wipe':    mesh.position.x -= 200; mesh.material.opacity = 0; break
    default:        mesh.material.opacity = 0; break
  }
  return orig
}

function updateAnim(animKey: string, mesh: any, orig: any, progress: number, dark: boolean, fontKey: string) {
  const p    = Math.min(1, progress)
  const ease = 1 - Math.pow(1 - p, 3)
  const baseAlpha = getFontConfig(fontKey, dark).alpha
  switch(animKey) {
    case 'rise': case 'fall':
      mesh.position.y = orig.y - (1-ease) * (animKey==='rise' ? -80 : 80)
      mesh.material.opacity = ease * baseAlpha; break
    case 'scatter':
      mesh.position.x = orig.x + (1-ease) * (mesh.position.x - orig.x)
      mesh.position.z = orig.z + (1-ease) * (mesh.position.z - orig.z)
      mesh.material.opacity = ease * baseAlpha; break
    case 'scale':
      const bs = mesh.userData.baseScale
      mesh.scale.set(bs.x * Math.max(0.01, ease), bs.y * Math.max(0.01, ease), 1)
      mesh.material.opacity = ease * baseAlpha; break
    case 'glitch':
      if (p < 0.6) { mesh.material.opacity = Math.random() > 0.4 ? 0.9 : 0; mesh.position.x = orig.x + (Math.random()-.5)*20*(1-p) }
      else { mesh.position.x = orig.x; mesh.material.opacity = ease * baseAlpha }; break
    case 'wipe':
      mesh.position.x = orig.x - (1-ease) * 200; mesh.material.opacity = ease * baseAlpha; break
    default:
      mesh.material.opacity = ease * baseAlpha; break
  }
}

function loadImageTexture(THREE: any, url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const tex = new THREE.Texture(img)
      tex.needsUpdate = true
      tex.generateMipmaps = false
      tex.minFilter = THREE.LinearFilter
      resolve(tex)
    }
    img.onerror = reject
    img.src = url
  })
}

interface MediaItem {
  id: string; type: string; thumbnailUrl: string; displayTitle: string; url: string
}

export default function SynapsePage() {
  return (
    <Suspense fallback={<Loader msg="LOADING..." dark={true}/>}>
      <SynapseInner/>
    </Suspense>
  )
}

function SynapseInner() {
  const { status } = useSession()
  const router     = useRouter()
  const params     = useSearchParams()
  const { token, ready } = useGasToken()
  const isMobile   = useIsMobile()

  const themeId  = params.get('themeId') || ''
  const themeTxt = params.get('theme')   || ''

  const canvasRef     = useRef<HTMLCanvasElement>(null)
  const sceneRef      = useRef<any>(null)
  const itemUrlMapRef = useRef<Record<string, string>>({})

  const [keywords,    setKeywords]    = useState<Keyword[]>([])
  const [mediaItems,  setMediaItems]  = useState<MediaItem[]>([])
  const [loadMsg,     setLoadMsg]     = useState('記憶を取得中...')
  const [loaded,      setLoaded]      = useState(false)
  const [shotLabel,   setShotLabel]   = useState('')
  const [cycleCount,  setCycleCount]  = useState(0)
  const [refreshing,  setRefreshing]  = useState(false)
  const [dark,        setDark]        = useState(true)
  const [clickedKw,   setClickedKw]   = useState<Keyword|null>(null)
  const [clickedUrls, setClickedUrls] = useState<string[]>([])

  useEffect(() => {
    const saved = localStorage.getItem('cs_dark')
    setDark(saved !== '0')
  }, [])

  useEffect(() => { if (status === 'unauthenticated') router.replace('/login') }, [status, router])

  useEffect(() => {
    if (!ready) return
    getItems(token, {}).then(r => {
      const map: Record<string, string> = {}
      const media: MediaItem[] = []
      r.items?.forEach((item: any) => {
        if (item.url) map[item.id] = item.url
        if ((item.type === 'image' || item.type === 'video') && item.thumbnailUrl) {
          media.push({ id:item.id, type:item.type, thumbnailUrl:item.thumbnailUrl, displayTitle:item.displayTitle||'', url:item.url||'' })
        }
      })
      itemUrlMapRef.current = map
      setMediaItems(media)
    }).catch(() => {})
  }, [ready, token])

  useEffect(() => {
    if (!ready || !themeId) return
    setLoadMsg('キーワードを取得中...')
    getKeywords(token, themeId)
      .then(r => { setKeywords(r.keywords || []); setLoadMsg('空間を構築中...') })
      .catch(() => setLoadMsg('取得に失敗しました'))
  }, [ready, token, themeId])

  useEffect(() => {
    if (cycleCount === 0 || !ready || !themeTxt || refreshing) return
    setRefreshing(true)
    setLoadMsg('新しいひらめきを生成中...')
    createTheme(token, { text: themeTxt })
      .then(r => { setKeywords(r.keywords || []); setRefreshing(false); setLoadMsg('') })
      .catch(e => { console.error(e); setRefreshing(false); setLoadMsg('') })
  }, [cycleCount])

  useEffect(() => {
    if (!canvasRef.current || keywords.length === 0) return
    let ren: any, animId: number

    async function buildScene() {
      const THREE = window.THREE
      const cv    = canvasRef.current!
      const W     = window.innerWidth, H = window.innerHeight
      const dpr   = Math.min(devicePixelRatio || 1, 2)

      ren = new THREE.WebGLRenderer({ canvas: cv, antialias: true })
      ren.setPixelRatio(dpr); ren.setSize(W, H)
      ren.setClearColor(dark ? 0x020810 : 0xfafbff, 1)

      const scene = new THREE.Scene()
      scene.fog   = new THREE.FogExp2(dark ? 0x020810 : 0xfafbff, 0.00106)

      // モバイルは視野角を広くしてキーワードを見やすく
      const fov = isMobile ? 72 : 60
      const cam = new THREE.PerspectiveCamera(fov, W/H, 1, 3000)
      cam.position.set(0, 80, isMobile ? 620 : 520)

      if (dark) {
        const sp: number[] = []
        for (let i = 0; i < 800; i++) sp.push((Math.random()-.5)*3200,(Math.random()-.5)*3200,(Math.random()-.5)*3200)
        const sg = new THREE.BufferGeometry()
        sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3))
        scene.add(new THREE.Points(sg, new THREE.PointsMaterial({ color:0x6a8ad8, size:1.0, transparent:true, opacity:.16 })))
      }

      // メディアサムネイル
      const phi = Math.PI * (Math.sqrt(5) - 1)
      const R   = isMobile ? 340 : 400
      const mediaMeshes: any[] = []
// テーマに関連するメディアを優先、残りからランダム最大5件を追加
      const relatedIds   = new Set(keywords.flatMap(kw => kw.sourceItemIds || []))
      const relatedMedia = mediaItems.filter(m => relatedIds.has(m.id))
      const randomMedia  = mediaItems.filter(m => !relatedIds.has(m.id)).sort(() => Math.random() - 0.5).slice(0, 5)
      const selectedMedia = [...relatedMedia, ...randomMedia]

      for (let i = 0; i < selectedMedia.length; i++) {
        const item = selectedMedia[i]
        try {
          const tex = await loadImageTexture(THREE, item.thumbnailUrl)
          const mat = new THREE.MeshBasicMaterial({ map:tex, transparent:true, depthWrite:false, side:THREE.DoubleSide, opacity:0 })
          const y   = 1 - ((i + 0.5) / selectedMedia.length) * 2
          const rad = Math.sqrt(Math.max(0, 1 - y*y))
          const th  = phi * (i + 50)
          const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat)
          const w = isMobile ? 120 : 160, h = item.type === 'image' ? w : w * 9/16
          mesh.scale.set(w, h, 1)
          mesh.position.set(R*rad*Math.cos(th), R*y, R*rad*Math.sin(th))
          mesh.userData.mediaItem = item
          scene.add(mesh)
          mediaMeshes.push(mesh)
        } catch(e) {}
      }

      // テキストキーワード
      const meshes:    any[]    = []
      const origPos:   any[]    = []
      const animKeys:  string[] = []
      const animStart: number[] = []
      const STAGGER_INTERVAL = 8
      let frameCount = 0

      // モバイルはフォントを少し大きく描画
      const fontScale = isMobile ? 1.15 : 1

      function buildMeshes(kws: Keyword[]) {
        meshes.forEach(m => { scene.remove(m); m.geometry.dispose(); m.material.dispose() })
        meshes.length = 0; origPos.length = 0; animKeys.length = 0; animStart.length = 0
        frameCount = 0
        kws.forEach((kw, idx) => {
          const kwCanvas = drawKeyword(kw.text, kw.fontKey || 'condensed', dark, fontScale)
          const tex = new THREE.CanvasTexture(kwCanvas)
          tex.generateMipmaps = false; tex.minFilter = THREE.LinearFilter
          const mat  = new THREE.MeshBasicMaterial({ map:tex, transparent:true, depthWrite:false, side:THREE.DoubleSide, opacity:0 })
          const sh   = (isMobile ? 20 : 24) + kw.score * (isMobile ? 28 : 36)
          const sw   = sh * (512 / 128)
          const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1,1), mat)
          mesh.scale.set(sw, sh, 1)
          mesh.position.set(kw.posX || 0, kw.posY || 0, kw.posZ || 0)
          mesh.userData.baseScale = { x: sw, y: sh }
          scene.add(mesh)
          const animKey = kw.animKey || 'fadeBlur'
          const orig    = getAnimInit(animKey, mesh)
          meshes.push(mesh); origPos.push(orig); animKeys.push(animKey)
          animStart.push(animKey === 'stagger' ? idx * STAGGER_INTERVAL : 0)
        })
      }

      buildMeshes(keywords)

      // タッチ・クリック判定
      const raycaster = new THREE.Raycaster()
      const mouse     = new THREE.Vector2()

      function handleTap(clientX: number, clientY: number) {
        const rect = cv.getBoundingClientRect()
        mouse.x =  ((clientX - rect.left) / rect.width)  * 2 - 1
        mouse.y = -((clientY - rect.top)  / rect.height) * 2 + 1
        raycaster.setFromCamera(mouse, cam)
        const mediaHits = raycaster.intersectObjects(mediaMeshes)
        if (mediaHits.length > 0) {
          const mi = mediaHits[0].object.userData.mediaItem as MediaItem
          if (mi?.url) {
            setClickedKw({ text:mi.displayTitle||mi.type, score:1, sourceItemIds:[mi.id], fontKey:'condensed', animKey:'fadeBlur', id:mi.id, posX:0, posY:0, posZ:0 } as any)
            setClickedUrls([mi.url])
          }
          return
        }
        const hits = raycaster.intersectObjects(meshes)
        if (hits.length > 0) {
          const idx = meshes.indexOf(hits[0].object)
          if (idx >= 0) {
            const kw   = currentKws[idx]
            const urls = (kw.sourceItemIds || []).map((id: string) => itemUrlMapRef.current[id]).filter(Boolean)
            setClickedKw(kw); setClickedUrls(urls)
          }
        } else {
          setClickedKw(null); setClickedUrls([])
        }
      }

      cv.addEventListener('click', (e: MouseEvent) => handleTap(e.clientX, e.clientY))
      cv.addEventListener('touchend', (e: TouchEvent) => {
        if (e.changedTouches.length > 0) {
          e.preventDefault()
          handleTap(e.changedTouches[0].clientX, e.changedTouches[0].clientY)
        }
      }, { passive: false })

      // カメラオートパイロット
      const SHOTS_PER_CYCLE = keywords.length + 5
      let shotCount = 0, fTimer = 0, fDur = isMobile ? 340 : 420
      const dpos = new THREE.Vector3(0, 80, isMobile ? 620 : 520)
      const dtgt = new THREE.Vector3(0, 0, 0)
      const ctgt = new THREE.Vector3(0, 0, 0)
      const ANIM_DURATION = 60
      const _tc  = new THREE.Vector3()
      const clk  = new THREE.Clock()
      let currentKws = [...keywords]

      function nextShot(kws: Keyword[]) {
        shotCount++
        if (shotCount >= SHOTS_PER_CYCLE) { shotCount = 0; setCycleCount(c => c + 1) }
        const r = Math.random(), i = Math.floor(Math.random() * kws.length)
        const kw = kws[i]
        if (r < .15 && mediaMeshes.length > 0) {
          const mi = mediaMeshes[Math.floor(Math.random() * mediaMeshes.length)]
          const p  = mi.position, a = Math.random()*Math.PI*2
          dpos.set(p.x+Math.cos(a)*(isMobile?80:120), p.y+30, p.z+Math.sin(a)*(isMobile?80:120))
          dtgt.copy(p); fDur=isMobile?300:600; setShotLabel('MEDIA')
          return
        }
        if (r < .35) {
          const a = Math.random()*Math.PI*2
          dpos.set(Math.cos(a)*(isMobile?480:580),(Math.random()-.5)*230,Math.sin(a)*(isMobile?480:580))
          dtgt.set(0,0,0); fDur=isMobile?320:660; setShotLabel('WIDE')
        } else if (r < .65) {
          const p = new THREE.Vector3(kw.posX||0, kw.posY||0, kw.posZ||0)
          const a = Math.random()*Math.PI*2, el=(Math.random()-.5)*Math.PI*.5
          const d = (isMobile?28:36)+kw.score*(isMobile?48:62)
          dpos.set(p.x+Math.cos(a)*Math.cos(el)*d, p.y+Math.sin(el)*d*.5, p.z+Math.sin(a)*Math.cos(el)*d)
          dtgt.copy(p); fDur=isMobile?320:660; setShotLabel('CLOSE')
        } else {
          const p = new THREE.Vector3(kw.posX||0, kw.posY||0, kw.posZ||0)
          const a = Math.random()*Math.PI*2, el=(Math.random()-.5)*Math.PI*.7
          const d = (isMobile?60:75)+kw.score*(isMobile?120:155)
          dpos.set(p.x+Math.cos(a)*Math.cos(el)*d, p.y+Math.sin(el)*d*.48, p.z+Math.sin(a)*Math.cos(el)*d)
          dtgt.copy(p); fDur=isMobile?300:600; setShotLabel('FLY')
        }
      }

      nextShot(currentKws)
      setLoaded(true); setLoadMsg('')

      sceneRef.current = {
        updateKeywords: (newKws: Keyword[]) => {
          currentKws = newKws; buildMeshes(newKws); nextShot(newKws)
        }
      }

      function frame() {
        animId = requestAnimationFrame(frame)
        const t = clk.getElapsedTime()
        frameCount++

        meshes.forEach((mesh, idx) => {
          const elapsed  = frameCount - animStart[idx]
          const progress = elapsed / ANIM_DURATION
          if (progress < 1) {
            updateAnim(animKeys[idx], mesh, origPos[idx], progress, dark, currentKws[idx]?.fontKey || 'condensed')
          } else {
            const baseAlpha = getFontConfig(currentKws[idx]?.fontKey || 'condensed', dark).alpha
            if (animKeys[idx] === 'scale') { const bs = mesh.userData.baseScale; mesh.scale.set(bs.x, bs.y, 1) }
            if (animKeys[idx] === 'glitch') mesh.position.x = origPos[idx].x
            mesh.material.opacity = baseAlpha * (0.82 + Math.sin(t*.28+idx*.62)*.12)
          }
          mesh.lookAt(cam.position)
          _tc.subVectors(cam.position, mesh.position).normalize()
          mesh.rotateX(-Math.asin(Math.max(-1, Math.min(1, _tc.y))) * .42)
        })

        mediaMeshes.forEach((mesh, idx) => {
          if (mesh.material.opacity < 0.82) mesh.material.opacity = Math.min(0.82, mesh.material.opacity + 0.008)
          else mesh.material.opacity = 0.75 + Math.sin(t*.18+idx*1.2)*.07
          mesh.lookAt(cam.position)
          mesh.position.y += Math.sin(t*.12 + idx) * 0.04
        })

        fTimer++
        if (fTimer >= fDur) { fTimer = 0; nextShot(currentKws) }

        // モバイルはドリフトを小さく
        const driftScale = isMobile ? 0.5 : 1
        const drift = new THREE.Vector3(
          (Math.sin(t*.17)*20+Math.sin(t*.07)*10)*driftScale,
          (Math.cos(t*.13)*13+Math.cos(t*.08)*6)*driftScale,
          (Math.sin(t*.20)*18+Math.sin(t*.06)*8)*driftScale)
        cam.position.lerp(dpos.clone().add(drift), isMobile ? .016 : .012)
        ctgt.lerp(dtgt, .03); cam.lookAt(ctgt)
        ren.render(scene, cam)
      }
      frame()

      window.addEventListener('resize', () => {
        const W2 = window.innerWidth, H2 = window.innerHeight
        ren.setSize(W2, H2); cam.aspect = W2/H2; cam.updateProjectionMatrix()
      })
    }

    const script = document.createElement('script')
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js'
    script.onload = () => buildScene()
    document.head.appendChild(script)

    return () => { cancelAnimationFrame(animId); ren?.dispose?.() }
  }, [keywords, dark, mediaItems, isMobile])

  useEffect(() => {
    if (sceneRef.current && keywords.length > 0 && loaded) {
      sceneRef.current.updateKeywords(keywords)
    }
  }, [keywords])

  const bgColor   = dark ? '#020810' : '#fafbff'
  const textColor = dark ? 'rgba(200,220,255,0.85)' : 'rgba(10,30,100,0.85)'
  const subColor  = dark ? 'rgba(120,150,210,0.28)' : 'rgba(30,60,150,0.28)'
  const btnBg     = dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,80,0.07)'
  const btnBorder = dark ? 'rgba(90,115,220,0.22)' : 'rgba(60,90,200,0.22)'

  return (
    <div style={{ position:'relative', width:'100vw', height:'100vh', background:bgColor, overflow:'hidden' }}>
      <canvas ref={canvasRef} style={{ position:'absolute', inset:0, width:'100%', height:'100%', touchAction:'none' }}/>

      {/* ローディング */}
      {!loaded && (
        <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', background:bgColor, zIndex:10, gap:12 }}>
          <div style={{ fontFamily:'"Space Mono",monospace', fontSize:11, color:dark?'rgba(130,160,250,0.3)':'rgba(30,60,180,0.3)', letterSpacing:'0.14em' }}>{loadMsg || 'LOADING...'}</div>
          <div style={{ width:80, height:1, background:'rgba(70,95,190,0.1)', overflow:'hidden' }}>
            <div style={{ height:'100%', width:'60%', background:'rgba(100,140,255,0.4)', animation:'loading 1s ease-in-out infinite alternate' }}/>
          </div>
        </div>
      )}

      {/* 更新中 */}
      {refreshing && loaded && (
        <div style={{ position:'absolute', bottom:isMobile?80:50, left:'50%', transform:'translateX(-50%)', fontFamily:'"Space Mono",monospace', fontSize:10, color:dark?'rgba(130,160,250,0.5)':'rgba(30,60,180,0.5)', letterSpacing:'0.10em', zIndex:5, whiteSpace:'nowrap' }}>
          新しいひらめきを生成中...
        </div>
      )}

      {/* UIオーバーレイ */}
      {loaded && (
        <div style={{ position:'absolute', inset:0, pointerEvents:'none', zIndex:4 }}>
          {/* ロゴ・テーマ（モバイルは小さく） */}
          <div style={{ position:'absolute', top:isMobile?12:20, left:isMobile?14:24, fontFamily:'"Space Mono",monospace', fontSize:isMobile?11:15, fontWeight:700, color:textColor, letterSpacing:isMobile?'0.10em':'0.18em' }}>
            {isMobile ? 'C·SYNAPSE' : 'CLOUD SYNAPSE'}
          </div>
          {!isMobile && (
            <div style={{ position:'absolute', top:46, left:24, fontFamily:'"Space Mono",monospace', fontSize:9, color:subColor, letterSpacing:'0.12em' }}>THEME : {themeTxt}</div>
          )}
          {/* キーワード数（モバイルは右下に小さく） */}
          <div style={{ position:'absolute', bottom:isMobile?'calc(16px + env(safe-area-inset-bottom))':20, left:isMobile?'auto':20, right:isMobile?14:'auto', fontFamily:'"Space Mono",monospace', fontSize:9, color:subColor }}>
            {keywords.length}kw · {mediaItems.length}img
          </div>

          {/* ボタン群 */}
          <div style={{ position:'absolute', top:isMobile?8:14, right:isMobile?10:18, pointerEvents:'all', display:'flex', gap:isMobile?6:8 }}>
            <button
              onClick={() => { setDark(d => { localStorage.setItem('cs_dark', d?'0':'1'); return !d }) }}
              style={{ background:btnBg, border:`0.5px solid ${btnBorder}`, borderRadius:8, padding:isMobile?'6px 10px':'7px 12px', fontSize:isMobile?12:13, color:dark?'rgba(180,200,255,0.55)':'rgba(40,60,160,0.55)', cursor:'pointer' }}
            >
              {dark ? '☀' : '🌙'}
            </button>
            <button
              onClick={() => router.push('/feed')}
              style={{ background:btnBg, border:`0.5px solid ${btnBorder}`, borderRadius:8, padding:isMobile?'6px 10px':'7px 15px', fontSize:isMobile?10:11, color:dark?'rgba(130,165,240,0.55)':'rgba(40,80,180,0.60)', cursor:'pointer', fontFamily:'"Space Mono",monospace', letterSpacing:'0.04em' }}
            >
              ← {isMobile ? '' : 'BACK'}
            </button>
          </div>
        </div>
      )}

      {/* クリックパネル */}
      {loaded && clickedKw && (
        <div
          onClick={e => e.stopPropagation()}
          style={{
            position:'absolute',
            bottom: isMobile ? 'calc(60px + env(safe-area-inset-bottom))' : 60,
            left:'50%', transform:'translateX(-50%)',
            zIndex:20,
            width: isMobile ? 'calc(100% - 32px)' : 'auto',
            minWidth: isMobile ? 'auto' : 200,
            maxWidth: isMobile ? 'calc(100% - 32px)' : 340,
            background:dark?'rgba(8,12,30,0.96)':'rgba(240,244,255,0.96)',
            border:`0.5px solid ${dark?'rgba(80,110,230,0.35)':'rgba(60,100,200,0.30)'}`,
            borderRadius:14, padding: isMobile ? '14px 16px' : '14px 20px',
            backdropFilter:'blur(10px)',
          }}
        >
          <div style={{ fontSize:isMobile?13:14, fontWeight:500, color:dark?'rgba(200,220,255,0.9)':'rgba(10,30,100,0.9)', marginBottom:8, fontFamily:'"Noto Sans JP",sans-serif' }}>
            {clickedKw.text}
          </div>
          {clickedUrls.length > 0 ? (
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              {clickedUrls.map((url, i) => (
                <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                  style={{ fontSize:11, color:dark?'rgba(130,180,255,0.9)':'rgba(30,80,200,0.9)', fontFamily:'monospace', wordBreak:'break-all', textDecoration:'underline', display:'block', padding:'6px 10px', background:dark?'rgba(60,90,200,0.18)':'rgba(60,90,200,0.10)', borderRadius:8, border:`0.5px solid ${dark?'rgba(80,120,240,0.28)':'rgba(60,100,200,0.20)'}` }}>
                  🔗 {url.slice(0,isMobile?40:50)}{url.length>(isMobile?40:50)?'…':''}
                </a>
              ))}
            </div>
          ) : (
            <div style={{ fontSize:11, color:dark?'rgba(130,150,220,0.5)':'rgba(60,80,160,0.5)' }}>リンクなし</div>
          )}
          <button onClick={() => { setClickedKw(null); setClickedUrls([]) }} style={{ marginTop:10, width:'100%', padding:'6px', background:'none', border:'none', fontSize:11, color:dark?'rgba(120,145,220,0.4)':'rgba(60,80,160,0.4)', cursor:'pointer' }}>
            ✕ 閉じる
          </button>
        </div>
      )}

      <style>{`
        @keyframes loading { from { transform: translateX(-100%) } to { transform: translateX(200%) } }
        * { -webkit-tap-highlight-color: transparent; }
      `}</style>
    </div>
  )
}

function Loader({ msg, dark }: { msg: string; dark: boolean }) {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background:dark?'#020810':'#fafbff' }}>
      <span style={{ color:'rgba(140,165,230,0.3)', fontFamily:'monospace', fontSize:11, letterSpacing:'0.14em' }}>{msg}</span>
    </div>
  )
}