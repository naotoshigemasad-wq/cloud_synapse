'use client'

import { useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState, Suspense } from 'react'
import { getKeywords, type Keyword } from '@/lib/api'
import { useGasToken } from '@/hooks/useGasToken'

// ── Three.js は動的import（SSR回避） ─────────────────────────
declare global { interface Window { THREE: any } }

export default function SynapsePage() {
  return (
    <Suspense fallback={<Loader msg="LOADING..." />}>
      <SynapseInner/>
    </Suspense>
  )
}

function SynapseInner() {
  const { status } = useSession()
  const router      = useRouter()
  const params      = useSearchParams()
  const { token, ready } = useGasToken()

  const themeId  = params.get('themeId') || ''
  const themeTxt = params.get('theme')   || ''

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [keywords, setKeywords] = useState<Keyword[]>([])
  const [loadMsg,  setLoadMsg]  = useState('記憶を取得中...')
  const [loaded,   setLoaded]   = useState(false)
  const [shotLabel, setShotLabel] = useState('')

  useEffect(() => { if (status === 'unauthenticated') router.replace('/login') }, [status, router])

  // キーワード取得
  useEffect(() => {
    if (!ready || !themeId) return
    setLoadMsg('キーワードを取得中...')
    getKeywords(token, themeId)
      .then(r => {
        setKeywords(r.keywords || [])
        setLoadMsg('空間を構築中...')
      })
      .catch(() => setLoadMsg('取得に失敗しました'))
  }, [ready, token, themeId])

  // Three.js 初期化（キーワードが揃ってから）
  useEffect(() => {
    if (!canvasRef.current || keywords.length === 0) return

    let ren: any, animId: number

    async function init() {
      // Three.js を動的ロード
      const script = document.createElement('script')
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js'
      script.onload = () => buildScene()
      document.head.appendChild(script)
    }

    function buildScene() {
      const THREE = (window as any).THREE
      const cv    = canvasRef.current!
      const W     = window.innerWidth, H = window.innerHeight
      const dpr   = Math.min(devicePixelRatio || 1, 2)

      ren = new THREE.WebGLRenderer({ canvas: cv, antialias: true })
      ren.setPixelRatio(dpr); ren.setSize(W, H); ren.setClearColor(0x020810, 1)

      const scene = new THREE.Scene()
      scene.fog   = new THREE.FogExp2(0x020810, 0.00106)
      const cam   = new THREE.PerspectiveCamera(60, W/H, 1, 3000)
      cam.position.set(0, 80, 520)

      // 星
      const sp: number[] = []
      for (let i = 0; i < 1100; i++) sp.push((Math.random()-.5)*3200,(Math.random()-.5)*3200,(Math.random()-.5)*3200)
      const sg = new THREE.BufferGeometry()
      sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3))
      scene.add(new THREE.Points(sg, new THREE.PointsMaterial({ color:0x6a8ad8, size:1.0, transparent:true, opacity:.16 })))

      // キーワードメッシュ
      const meshes: any[] = []
      keywords.forEach(kw => {
        const cv2 = document.createElement('canvas')
        cv2.width = 420; cv2.height = 110
        const ctx = cv2.getContext('2d')!
        ctx.clearRect(0,0,420,110)
        const fs = Math.min(46, Math.floor(420*.74/kw.text.length))
        ctx.font = `700 ${fs}px "Noto Sans JP",sans-serif`
        ctx.textBaseline = 'middle'; ctx.textAlign = 'center'
        ctx.globalAlpha = 0.85
        ctx.shadowBlur = 20; ctx.shadowColor = 'rgba(128,194,255,0.8)'
        ctx.fillStyle  = 'rgba(190,215,255,0.92)'
        ctx.fillText(kw.text, 210, 55)

        const tex = new THREE.CanvasTexture(cv2)
        tex.generateMipmaps = false; tex.minFilter = THREE.LinearFilter
        const mat  = new THREE.MeshBasicMaterial({ map:tex, transparent:true, depthWrite:false, side:THREE.DoubleSide })
        const sh   = 26 + kw.score*34, sw = sh*(420/110)
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1,1), mat)
        mesh.scale.set(sw, sh, 1)
        mesh.position.set(kw.posX || 0, kw.posY || 0, kw.posZ || 0)
        scene.add(mesh)
        meshes.push(mesh)
      })

      // カメラオートパイロット
      const FONT_KEYS = ['expanded','condensed','ultra','neon','italic','outline','waveFont','serif','serifL','ghost']
      let fTimer = 0, fDur = 300
      const dpos = new THREE.Vector3(0, 80, 520)
      const dtgt = new THREE.Vector3(0, 0, 0)
      const ctgt = new THREE.Vector3(0, 0, 0)

      function nextShot() {
        const r = Math.random(), i = Math.floor(Math.random()*keywords.length)
        if (r < .2) {
          const a = Math.random()*Math.PI*2
          dpos.set(Math.cos(a)*580,(Math.random()-.5)*230,Math.sin(a)*580)
          dtgt.set(0,0,0); fDur=480; setShotLabel('WIDE')
        } else if (r < .55) {
          const kw = keywords[i]
          const p  = new THREE.Vector3(kw.posX||0, kw.posY||0, kw.posZ||0)
          const a  = Math.random()*Math.PI*2, el=(Math.random()-.5)*Math.PI*.5
          const d  = 36+kw.score*62
          dpos.set(p.x+Math.cos(a)*Math.cos(el)*d,p.y+Math.sin(el)*d*.5,p.z+Math.sin(a)*Math.cos(el)*d)
          dtgt.copy(p); fDur=540; setShotLabel('CLOSE')
        } else {
          const kw = keywords[i]
          const p  = new THREE.Vector3(kw.posX||0, kw.posY||0, kw.posZ||0)
          const a  = Math.random()*Math.PI*2, el=(Math.random()-.5)*Math.PI*.7
          const d  = 75+kw.score*155
          dpos.set(p.x+Math.cos(a)*Math.cos(el)*d,p.y+Math.sin(el)*d*.48,p.z+Math.sin(a)*Math.cos(el)*d)
          dtgt.copy(p); fDur=480; setShotLabel('FLY')
        }
      }
      nextShot()
      setLoaded(true)
      setLoadMsg('')

      const clk = new THREE.Clock()
      const _tc = new THREE.Vector3()

      function frame() {
        animId = requestAnimationFrame(frame)
        const t = clk.getElapsedTime()

        meshes.forEach(mesh => {
          mesh.lookAt(cam.position)
          _tc.subVectors(cam.position, mesh.position).normalize()
          const elev = Math.asin(Math.max(-1, Math.min(1,_tc.y)))
          mesh.rotateX(-elev*.42)
          mesh.material.opacity = 0.78+Math.sin(t*.30+meshes.indexOf(mesh)*.68)*.10
        })

        fTimer++
        if (fTimer >= fDur) { fTimer = 0; nextShot() }
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
        ren.setSize(W2,H2); cam.aspect=W2/H2; cam.updateProjectionMatrix()
      })
    }

    init()
    return () => { cancelAnimationFrame(animId); ren?.dispose?.() }
  }, [keywords])

  return (
    <div style={{ position:'relative', width:'100vw', height:'100vh', background:'#020810', overflow:'hidden' }}>
      <canvas ref={canvasRef} style={{ position:'absolute', inset:0, width:'100%', height:'100%' }}/>

      {/* ローディングオーバーレイ */}
      {!loaded && (
        <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', background:'#020810', zIndex:10, gap:12 }}>
          <div style={{ fontFamily:'"Space Mono",monospace', fontSize:11, color:'rgba(130,160,250,0.3)', letterSpacing:'0.16em' }}>
            {loadMsg || 'LOADING...'}
          </div>
          <div style={{ width:100, height:1, background:'rgba(70,95,190,0.1)', overflow:'hidden' }}>
            <div style={{ height:'100%', width:'60%', background:'rgba(100,140,255,0.4)', animation:'loading 1s ease-in-out infinite alternate' }}/>
          </div>
        </div>
      )}

      {/* UI オーバーレイ */}
      {loaded && (
        <div style={{ position:'absolute', inset:0, pointerEvents:'none', zIndex:4 }}>
          {/* タイトル */}
          <div style={{ position:'absolute', top:20, left:24, fontFamily:'"Space Mono",monospace', fontSize:15, fontWeight:700, color:'rgba(200,220,255,0.85)', letterSpacing:'0.18em' }}>
            CLOUD SYNAPSE
          </div>
          <div style={{ position:'absolute', top:46, left:24, fontFamily:'"Space Mono",monospace', fontSize:9, color:'rgba(120,150,210,0.28)', letterSpacing:'0.12em' }}>
            THEME : {themeTxt}
          </div>
          {/* ショットラベル */}
          <div style={{ position:'absolute', top:20, right:180, fontFamily:'"Space Mono",monospace', fontSize:9, color:'rgba(120,145,210,0.22)', letterSpacing:'0.08em' }}>
            {shotLabel}
          </div>
          {/* 戻るボタン */}
          <div style={{ position:'absolute', top:14, right:18, pointerEvents:'all' }}>
            <button
              onClick={() => router.push('/feed')}
              style={{ background:'rgba(255,255,255,0.04)', border:'0.5px solid rgba(90,115,220,0.18)', borderRadius:6, padding:'7px 15px', fontSize:11, color:'rgba(130,165,240,0.48)', cursor:'pointer', fontFamily:'"Space Mono",monospace', letterSpacing:'0.06em' }}
            >
              ← BACK
            </button>
          </div>
          {/* キーワード数 */}
          <div style={{ position:'absolute', bottom:20, left:20, fontFamily:'"Space Mono",monospace', fontSize:10, color:'rgba(150,170,230,0.28)', letterSpacing:'0.05em' }}>
            {keywords.length} keywords
          </div>
        </div>
      )}

      <style>{`@keyframes loading { from { transform: translateX(-100%) } to { transform: translateX(200%) } }`}</style>
    </div>
  )
}

function Loader({ msg }: { msg: string }) {
  return (
    <div style={{ display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',background:'#020810' }}>
      <span style={{ color:'rgba(140,165,230,0.3)',fontFamily:'monospace',fontSize:11,letterSpacing:'0.16em' }}>{msg}</span>
    </div>
  )
}
