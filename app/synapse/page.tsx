'use client'

import { useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState, Suspense, useCallback } from 'react'
import { getKeywords, createTheme, type Keyword } from '@/lib/api'
import { useGasToken } from '@/hooks/useGasToken'

declare global { interface Window { THREE: any } }

// ── フォント設定マップ ────────────────────────────────────────
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

// ── ライトモード用フォント色（暗い色に反転）────────────────────
const FONT_CONFIG_LIGHT: Record<string, Partial<typeof FONT_CONFIG[string]>> = {
  ultra:     { color:'rgba(10,20,80,0.96)',   shadowColor:'rgba(30,60,180,0.6)'  },
  condensed: { color:'rgba(20,40,140,0.90)',  shadowColor:'rgba(40,80,200,0.5)'  },
  expanded:  { color:'rgba(30,60,160,0.85)',  shadowColor:'rgba(40,90,200,0.4)'  },
  ghost:     { color:'rgba(30,60,160,0.25)',  shadowColor:'rgba(40,80,200,0.15)' },
  outline:   { color:'rgba(0,0,0,0)',         shadowColor:'rgba(30,80,200,0.5)'  },
  italic:    { color:'rgba(80,30,160,0.85)',  shadowColor:'rgba(100,40,200,0.5)' },
  neon:      { color:'rgba(0,140,100,0.90)',  shadowColor:'rgba(0,180,130,0.6)'  },
  serif:     { color:'rgba(100,60,0,0.85)',   shadowColor:'rgba(140,80,0,0.4)'   },
  serifL:    { color:'rgba(80,50,20,0.70)',   shadowColor:'rgba(120,80,30,0.3)'  },
  waveFont:  { color:'rgba(0,120,160,0.85)',  shadowColor:'rgba(0,160,200,0.5)'  },
}

function getFontConfig(fontKey: string, dark: boolean) {
  const base = FONT_CONFIG[fontKey] || FONT_CONFIG.condensed
  if (dark) return base
  return { ...base, ...(FONT_CONFIG_LIGHT[fontKey] || {}) }
}

// ── キーワード描画 ────────────────────────────────────────────
function drawKeyword(text: string, fontKey: string, dark: boolean): HTMLCanvasElement {
  const cfg = getFontConfig(fontKey, dark)
  const cv  = document.createElement('canvas')
  cv.width = 512; cv.height = 128
  const ctx = cv.getContext('2d')!
  ctx.clearRect(0, 0, 512, 128)
  const charCount = Array.from(text).length
  const fs = Math.min(52, Math.max(28, Math.floor(440 / charCount)))
  ctx.save()
  ctx.font         = `${cfg.style} ${cfg.weight} ${fs}px ${cfg.font}`
  ctx.textBaseline = 'middle'
  ctx.textAlign    = 'center'
  ctx.globalAlpha  = cfg.alpha
  ctx.shadowBlur   = cfg.shadowBlur
  ctx.shadowColor  = cfg.shadowColor

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

// ── アニメーション ────────────────────────────────────────────
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
      else { mesh.position.x = orig.x; mesh.material.opacity = ease * baseAlpha }
      break
    case 'wipe':
      mesh.position.x = orig.x - (1-ease) * 200; mesh.material.opacity = ease * baseAlpha; break
    default:
      mesh.material.opacity = ease * baseAlpha; break
  }
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

  const themeId  = params.get('themeId') || ''
  const themeTxt = params.get('theme')   || ''

  const canvasRef    = useRef<HTMLCanvasElement>(null)
  const sceneRef     = useRef<any>(null)  // Three.js scene への参照
  const [keywords,   setKeywords]   = useState<Keyword[]>([])
  const [loadMsg,    setLoadMsg]    = useState('記憶を取得中...')
  const [loaded,     setLoaded]     = useState(false)
  const [shotLabel,  setShotLabel]  = useState('')
  const [cycleCount, setCycleCount] = useState(0)  // 一巡カウント
  const [refreshing, setRefreshing] = useState(false)
  const [dark,       setDark]       = useState(true)

  useEffect(() => {
    const saved = localStorage.getItem('cs_dark')
    setDark(saved !== '0')  // デフォルトdark
  }, [])

  useEffect(() => { if (status === 'unauthenticated') router.replace('/login') }, [status, router])

  // キーワード取得
  useEffect(() => {
    if (!ready || !themeId) return
    setLoadMsg('キーワードを取得中...')
    getKeywords(token, themeId)
      .then(r => { setKeywords(r.keywords || []); setLoadMsg('空間を構築中...') })
      .catch(() => setLoadMsg('取得に失敗しました'))
  }, [ready, token, themeId])

  // 一巡後にキーワードを再生成して入れ替え
  useEffect(() => {
    if (cycleCount === 0 || !ready || !themeTxt || refreshing) return
    setRefreshing(true)
    setLoadMsg('新しいひらめきを生成中...')
    createTheme(token, { text: themeTxt })
      .then(r => {
        setKeywords(r.keywords || [])
        setRefreshing(false)
        setLoadMsg('')
      })
      .catch(e => {
        console.error(e)
        setRefreshing(false)
        setLoadMsg('')
      })
  }, [cycleCount])

  // Three.js 初期化
  useEffect(() => {
    if (!canvasRef.current || keywords.length === 0) return
    let ren: any, animId: number

    function buildScene() {
      const THREE = window.THREE
      const cv    = canvasRef.current!
      const W     = window.innerWidth, H = window.innerHeight
      const dpr   = Math.min(devicePixelRatio || 1, 2)

      ren = new THREE.WebGLRenderer({ canvas: cv, antialias: true })
      ren.setPixelRatio(dpr); ren.setSize(W, H)
      ren.setClearColor(dark ? 0x020810 : 0xfafbff, 1)

      const scene = new THREE.Scene()
      scene.fog   = new THREE.FogExp2(dark ? 0x020810 : 0xfafbff, 0.00106)
      const cam   = new THREE.PerspectiveCamera(60, W/H, 1, 3000)
      cam.position.set(0, 80, 520)

      // 星（ダークモードのみ）
      if (dark) {
        const sp: number[] = []
        for (let i = 0; i < 1100; i++) sp.push((Math.random()-.5)*3200,(Math.random()-.5)*3200,(Math.random()-.5)*3200)
        const sg = new THREE.BufferGeometry()
        sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3))
        scene.add(new THREE.Points(sg, new THREE.PointsMaterial({ color:0x6a8ad8, size:1.0, transparent:true, opacity:.16 })))
      }

      // キーワードメッシュ構築
      const meshes:    any[]    = []
      const origPos:   any[]    = []
      const animKeys:  string[] = []
      const animStart: number[] = []
      const STAGGER_INTERVAL = 8
      let   frameCount = 0

      function buildMeshes(kws: Keyword[]) {
        // 既存meshを削除
        meshes.forEach(m => { scene.remove(m); m.geometry.dispose(); m.material.dispose() })
        meshes.length = 0; origPos.length = 0; animKeys.length = 0; animStart.length = 0
        frameCount = 0

        kws.forEach((kw, idx) => {
          const kwCanvas = drawKeyword(kw.text, kw.fontKey || 'condensed', dark)
          const tex = new THREE.CanvasTexture(kwCanvas)
          tex.generateMipmaps = false; tex.minFilter = THREE.LinearFilter
          const mat  = new THREE.MeshBasicMaterial({ map:tex, transparent:true, depthWrite:false, side:THREE.DoubleSide, opacity:0 })
          const sh   = 24 + kw.score * 36
          const sw   = sh * (512 / 128)
          const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1,1), mat)
          mesh.scale.set(sw, sh, 1)
          mesh.position.set(kw.posX || 0, kw.posY || 0, kw.posZ || 0)
          mesh.userData.baseScale = { x: sw, y: sh }
          scene.add(mesh)

          const animKey = kw.animKey || 'fadeBlur'
          const orig    = getAnimInit(animKey, mesh)
          meshes.push(mesh)
          origPos.push(orig)
          animKeys.push(animKey)
          animStart.push(animKey === 'stagger' ? idx * STAGGER_INTERVAL : 0)
        })
      }

      buildMeshes(keywords)

      // カメラ巡回
      const SHOTS_PER_CYCLE = keywords.length + 5  // キーワード数+余裕で1巡とみなす
      let shotCount = 0
      let fTimer = 0, fDur = 300
      const dpos = new THREE.Vector3(0, 80, 520)
      const dtgt = new THREE.Vector3(0, 0, 0)
      const ctgt = new THREE.Vector3(0, 0, 0)
      const ANIM_DURATION = 60
      const _tc  = new THREE.Vector3()
      const clk  = new THREE.Clock()

      function nextShot(kws: Keyword[]) {
        shotCount++
        if (shotCount >= SHOTS_PER_CYCLE) {
          shotCount = 0
          setCycleCount(c => c + 1)
        }

        const r = Math.random(), i = Math.floor(Math.random() * kws.length)
        const kw = kws[i]
        if (r < .2) {
          const a = Math.random()*Math.PI*2
          dpos.set(Math.cos(a)*580,(Math.random()-.5)*230,Math.sin(a)*580)
          dtgt.set(0,0,0); fDur=480; setShotLabel('WIDE')
        } else if (r < .55) {
          const p = new THREE.Vector3(kw.posX||0, kw.posY||0, kw.posZ||0)
          const a = Math.random()*Math.PI*2, el=(Math.random()-.5)*Math.PI*.5
          const d = 36+kw.score*62
          dpos.set(p.x+Math.cos(a)*Math.cos(el)*d, p.y+Math.sin(el)*d*.5, p.z+Math.sin(a)*Math.cos(el)*d)
          dtgt.copy(p); fDur=540; setShotLabel('CLOSE')
        } else {
          const p = new THREE.Vector3(kw.posX||0, kw.posY||0, kw.posZ||0)
          const a = Math.random()*Math.PI*2, el=(Math.random()-.5)*Math.PI*.7
          const d = 75+kw.score*155
          dpos.set(p.x+Math.cos(a)*Math.cos(el)*d, p.y+Math.sin(el)*d*.48, p.z+Math.sin(a)*Math.cos(el)*d)
          dtgt.copy(p); fDur=480; setShotLabel('FLY')
        }
      }

      let currentKws = [...keywords]
      nextShot(currentKws)
      setLoaded(true); setLoadMsg('')

      // キーワード更新を外から受け取るための参照
      sceneRef.current = {
        updateKeywords: (newKws: Keyword[]) => {
          currentKws = newKws
          buildMeshes(newKws)
          nextShot(newKws)
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
          const elev = Math.asin(Math.max(-1, Math.min(1, _tc.y)))
          mesh.rotateX(-elev * .42)
        })

        fTimer++
        if (fTimer >= fDur) { fTimer = 0; nextShot(currentKws) }
        const drift = new THREE.Vector3(
          Math.sin(t*.17)*20+Math.sin(t*.07)*10,
          Math.cos(t*.13)*13+Math.cos(t*.08)*6,
          Math.sin(t*.20)*18+Math.sin(t*.06)*8)
        cam.position.lerp(dpos.clone().add(drift), .012)
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
  }, [keywords, dark])

  // キーワード更新時にシーンを更新
  useEffect(() => {
    if (sceneRef.current && keywords.length > 0 && loaded) {
      sceneRef.current.updateKeywords(keywords)
    }
  }, [keywords])

  const bgColor = dark ? '#020810' : '#fafbff'
  const textColor = dark ? 'rgba(200,220,255,0.85)' : 'rgba(10,30,100,0.85)'
  const subColor  = dark ? 'rgba(120,150,210,0.28)' : 'rgba(30,60,150,0.28)'
  const btnBg     = dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,80,0.06)'
  const btnBorder = dark ? 'rgba(90,115,220,0.18)' : 'rgba(60,90,200,0.20)'

  return (
    <div style={{ position:'relative', width:'100vw', height:'100vh', background:bgColor, overflow:'hidden' }}>
      <canvas ref={canvasRef} style={{ position:'absolute', inset:0, width:'100%', height:'100%' }}/>

      {/* ローディング */}
      {!loaded && (
        <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', background:bgColor, zIndex:10, gap:12 }}>
          <div style={{ fontFamily:'"Space Mono",monospace', fontSize:11, color:dark?'rgba(130,160,250,0.3)':'rgba(30,60,180,0.3)', letterSpacing:'0.16em' }}>
            {loadMsg || 'LOADING...'}
          </div>
          <div style={{ width:100, height:1, background:'rgba(70,95,190,0.1)', overflow:'hidden' }}>
            <div style={{ height:'100%', width:'60%', background:'rgba(100,140,255,0.4)', animation:'loading 1s ease-in-out infinite alternate' }}/>
          </div>
        </div>
      )}

      {/* 更新中インジケーター */}
      {refreshing && loaded && (
        <div style={{ position:'absolute', bottom:50, left:'50%', transform:'translateX(-50%)', fontFamily:'"Space Mono",monospace', fontSize:10, color:dark?'rgba(130,160,250,0.5)':'rgba(30,60,180,0.5)', letterSpacing:'0.12em', zIndex:5 }}>
          新しいひらめきを生成中...
        </div>
      )}

      {/* UI オーバーレイ */}
      {loaded && (
        <div style={{ position:'absolute', inset:0, pointerEvents:'none', zIndex:4 }}>
          <div style={{ position:'absolute', top:20, left:24, fontFamily:'"Space Mono",monospace', fontSize:15, fontWeight:700, color:textColor, letterSpacing:'0.18em' }}>CLOUD SYNAPSE</div>
          <div style={{ position:'absolute', top:46, left:24, fontFamily:'"Space Mono",monospace', fontSize:9, color:subColor, letterSpacing:'0.12em' }}>THEME : {themeTxt}</div>
          <div style={{ position:'absolute', top:20, right:180, fontFamily:'"Space Mono",monospace', fontSize:9, color:subColor, letterSpacing:'0.08em' }}>{shotLabel}</div>
          <div style={{ position:'absolute', bottom:20, left:20, fontFamily:'"Space Mono",monospace', fontSize:10, color:subColor, letterSpacing:'0.05em' }}>{keywords.length} keywords</div>
          <div style={{ position:'absolute', bottom:20, right:100, fontFamily:'"Space Mono",monospace', fontSize:9, color:subColor }}>cycle {cycleCount}</div>

          {/* ボタン群 */}
          <div style={{ position:'absolute', top:14, right:18, pointerEvents:'all', display:'flex', gap:8 }}>
            <button
              onClick={() => { setDark(d => { localStorage.setItem('cs_dark', d?'0':'1'); return !d }) }}
              style={{ background:btnBg, border:`0.5px solid ${btnBorder}`, borderRadius:6, padding:'7px 12px', fontSize:13, color:dark?'rgba(180,200,255,0.55)':'rgba(40,60,160,0.55)', cursor:'pointer' }}
            >
              {dark ? '☀' : '🌙'}
            </button>
            <button
              onClick={() => router.push('/feed')}
              style={{ background:btnBg, border:`0.5px solid ${btnBorder}`, borderRadius:6, padding:'7px 15px', fontSize:11, color:dark?'rgba(130,165,240,0.48)':'rgba(40,80,180,0.55)', cursor:'pointer', fontFamily:'"Space Mono",monospace', letterSpacing:'0.06em' }}
            >
              ← BACK
            </button>
          </div>
        </div>
      )}

      <style>{`@keyframes loading { from { transform: translateX(-100%) } to { transform: translateX(200%) } }`}</style>
    </div>
  )
}

function Loader({ msg, dark }: { msg: string; dark: boolean }) {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background:dark?'#020810':'#fafbff' }}>
      <span style={{ color:'rgba(140,165,230,0.3)', fontFamily:'monospace', fontSize:11, letterSpacing:'0.16em' }}>{msg}</span>
    </div>
  )
}
