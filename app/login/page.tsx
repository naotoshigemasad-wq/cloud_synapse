'use client'

import { signIn, useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

function isReturning() {
  if (typeof window === 'undefined') return false
  return !!localStorage.getItem('cs_visited')
}
function markVisited() {
  if (typeof window !== 'undefined') localStorage.setItem('cs_visited', '1')
}

export default function LoginPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState('')
  const [returning, setReturning] = useState(false)
  const [mounted,   setMounted]   = useState(false)

  useEffect(() => { setMounted(true); setReturning(isReturning()) }, [])
  useEffect(() => { if (status === 'authenticated') router.replace('/feed') }, [status, router])

  async function handleLogin() {
    setLoading(true); setError(''); markVisited()
    try {
      const res = await signIn('google', { redirect: false })
      if (res?.error) setError('ログインに失敗しました。もう一度お試しください。')
    } catch { setError('予期しないエラーが発生しました。') }
    finally { setLoading(false) }
  }

  if (!mounted || status === 'loading') {
    return (
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background:'#020810' }}>
        <span style={{ color:'rgba(140,165,230,0.3)', fontFamily:'monospace', fontSize:11, letterSpacing:'0.16em' }}>LOADING...</span>
      </div>
    )
  }

  return (
    <div style={s.page}>
      <div style={s.g1}/><div style={s.g2}/><div style={s.g3}/>
      <div style={s.card}>

        {/* ── ロゴ ── */}
        <div style={{ textAlign:'center', marginBottom: returning ? 32 : 24 }}>
          <div style={s.logo}>CLOUD SYNAPSE</div>
          <div style={s.sub}>{returning ? 'WELCOME BACK' : 'YOUR MEMORY · YOUR INSIGHT'}</div>
        </div>

        {/* ── 初回のみ：キャッチ + 機能カード ── */}
        {!returning && (
          <>
            <p style={s.catch}>
              日々の気づきを記録し、<br/>
              テーマを投げかけると<br/>
              AIがひらめきを3D空間に展開する。
            </p>
            <div style={s.feats}>
              {[
                { icon:'📥', title:'記憶を貯める',   desc:'メモ・URL・画像・SNSを一箇所に' },
                { icon:'💡', title:'テーマを投げる', desc:'ひとことのテーマを入力するだけ'   },
                { icon:'🌌', title:'空間で見る',     desc:'キーワードが3D宇宙に広がる'       },
              ].map(f => (
                <div key={f.title} style={s.feat}>
                  <div style={{ fontSize:20, marginBottom:5 }}>{f.icon}</div>
                  <div style={s.featT}>{f.title}</div>
                  <div style={s.featD}>{f.desc}</div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ── 再訪のみ：ウェルカムメッセージ ── */}
        {returning && (
          <p style={{ textAlign:'center', fontSize:14, color:'rgba(160,190,255,0.5)', lineHeight:1.9, marginBottom:32 }}>
            おかえりなさい。<br/>あなたの記憶が待っています。
          </p>
        )}

        {/* ── Google ボタン ── */}
        <button onClick={handleLogin} disabled={loading} style={{ ...s.btn, ...(loading ? s.btnOff : {}) }}>
          <GoogleIcon/>
          <span>{loading ? '接続中...' : returning ? 'Googleでログイン' : 'Googleアカウントではじめる'}</span>
        </button>

        {error && <p style={s.err}>{error}</p>}
        <p style={s.note}>
          {returning ? 'ログインすると前回の記憶が復元されます' : 'データはあなたのGoogleドライブにのみ保存されます'}
        </p>
      </div>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 18 18" style={{ flexShrink:0 }}>
      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"/>
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"/>
      <path fill="#FBBC05" d="M3.964 10.707c-.18-.54-.282-1.117-.282-1.707s.102-1.167.282-1.707V4.961H.957C.347 6.175 0 7.55 0 9s.348 2.825.957 4.039l3.007-2.332z"/>
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.961L3.964 7.293C4.672 5.166 6.656 3.58 9 3.58z"/>
    </svg>
  )
}

const s: Record<string, React.CSSProperties> = {
  page:{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#020810', padding:'24px 20px', position:'relative', overflow:'hidden' },
  g1:{ position:'absolute', top:'10%', left:'15%', width:380, height:380, borderRadius:'50%', background:'rgba(48,100,252,0.07)', filter:'blur(80px)', pointerEvents:'none' },
  g2:{ position:'absolute', bottom:'20%', right:'10%', width:300, height:300, borderRadius:'50%', background:'rgba(112,60,220,0.06)', filter:'blur(70px)', pointerEvents:'none' },
  g3:{ position:'absolute', top:'55%', left:'45%', width:240, height:240, borderRadius:'50%', background:'rgba(30,130,252,0.05)', filter:'blur(60px)', pointerEvents:'none' },
  card:{ position:'relative', zIndex:1, width:'100%', maxWidth:420, background:'rgba(8,12,28,0.84)', border:'0.5px solid rgba(70,105,230,0.18)', borderRadius:18, padding:'44px 36px 36px', backdropFilter:'blur(24px)' },
  logo:{ fontFamily:'"Space Mono",monospace', fontSize:18, fontWeight:700, color:'rgba(200,220,255,0.88)', letterSpacing:'0.2em', marginBottom:6 },
  sub:{ fontFamily:'"Space Mono",monospace', fontSize:9, color:'rgba(120,150,215,0.32)', letterSpacing:'0.15em' },
  catch:{ textAlign:'center', fontSize:14, color:'rgba(160,190,255,0.52)', lineHeight:2, marginBottom:24 },
  feats:{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginBottom:32 },
  feat:{ background:'rgba(255,255,255,0.025)', border:'0.5px solid rgba(70,100,220,0.10)', borderRadius:10, padding:'12px 8px', textAlign:'center' },
  featT:{ fontSize:11, fontWeight:500, color:'rgba(185,210,255,0.65)', marginBottom:4 },
  featD:{ fontSize:10, color:'rgba(130,155,220,0.36)', lineHeight:1.5 },
  btn:{ display:'flex', alignItems:'center', justifyContent:'center', gap:10, width:'100%', padding:'13px 20px', background:'rgba(255,255,255,0.055)', border:'0.5px solid rgba(90,120,240,0.28)', borderRadius:11, color:'rgba(200,220,255,0.85)', fontSize:14, fontWeight:500, cursor:'pointer', transition:'background 0.15s', marginBottom:14 },
  btnOff:{ opacity:0.5, cursor:'not-allowed' },
  err:{ fontSize:12, color:'rgba(255,90,90,0.75)', marginBottom:10, textAlign:'center' },
  note:{ fontSize:11, color:'rgba(100,130,200,0.3)', textAlign:'center', lineHeight:1.65 },
}
