'use client'

import { useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState, Suspense } from 'react'
import { useGasToken } from '@/hooks/useGasToken'
import {
  getIntegrations, saveNotionToken,
  importFromNotion, importFromYouTube,
  importFromPinterest, importFromGoogleDocs, importFromGoogleCalendar,
  getPinterestBoards,
  type Integration,
} from '@/lib/integrations'

// ── プラットフォーム定義 ──────────────────────────────────────
const PLATFORMS = [
  {
    key:    'notion' as const,
    label:  'Notion',
    icon:   '◻',
    color:  'rgba(167,139,250,0.75)',
    bg:     'rgba(167,139,250,0.10)',
    border: 'rgba(167,139,250,0.30)',
    desc:   'ページ・データベースをインポート',
    authType: 'token' as const,   // Integration Token 方式
  },
  {
    key:    'youtube' as const,
    label:  'YouTube',
    icon:   '▶',
    color:  'rgba(245,166,35,0.80)',
    bg:     'rgba(245,166,35,0.10)',
    border: 'rgba(245,166,35,0.30)',
    desc:   '高評価・保存済み動画をインポート',
    authType: 'oauth' as const,
  },
  {
    key:    'pinterest' as const,
    label:  'Pinterest',
    icon:   '⊕',
    color:  'rgba(230,50,50,0.75)',
    bg:     'rgba(230,50,50,0.08)',
    border: 'rgba(230,50,50,0.28)',
    desc:   '保存済みピン・ボードをインポート',
    authType: 'oauth' as const,
  },
  {
    key:    'google' as const,
    label:  'Google',
    icon:   'G',
    color:  'rgba(100,170,255,0.80)',
    bg:     'rgba(100,170,255,0.08)',
    border: 'rgba(100,170,255,0.28)',
    desc:   'Docs・Calendarをインポート',
    authType: 'oauth' as const,
  },
]

type StatusMap = Record<string, Integration | undefined>

export default function SettingsPage() {
  return (
    <Suspense fallback={<Loader/>}>
      <SettingsInner/>
    </Suspense>
  )
}

function SettingsInner() {
  const { status }    = useSession()
  const router        = useRouter()
  const searchParams  = useSearchParams()
  const { token, ready } = useGasToken()

  const [statusMap, setStatusMap]   = useState<StatusMap>({})
  const [loading,   setLoading]     = useState(true)
  const [selected,  setSelected]    = useState<string | null>(null)
  const [notionKey, setNotionKey]   = useState('')
  const [importing, setImporting]   = useState(false)
  const [msg,       setMsg]         = useState('')

  useEffect(() => { if (status === 'unauthenticated') router.replace('/login') }, [status, router])

  // Pinterest OAuthコールバック後のフィードバック
  useEffect(() => {
    const connected = searchParams.get('connected')
    const error     = searchParams.get('error')
    if (connected === 'pinterest') {
      setMsg('Pinterestと連携しました')
      setSelected('pinterest')
    } else if (error) {
      const errorMessages: Record<string, string> = {
        pinterest_denied:       'Pinterestの連携をキャンセルしました',
        pinterest_token_failed: 'Pinterestの認証に失敗しました。もう一度お試しください',
        pinterest_save_failed:  'トークンの保存に失敗しました',
        pinterest_network_error:'ネットワークエラーが発生しました',
      }
      setMsg(errorMessages[error] || '連携エラーが発生しました')
      setSelected('pinterest')
    }
    // URLのクエリパラメータをクリア
    if (connected || error) {
      router.replace('/settings', { scroll: false })
    }
  }, [searchParams, router])

  useEffect(() => {
    if (!ready) return
    getIntegrations(token)
      .then(r => {
        const map: StatusMap = {}
        r.integrations?.forEach(i => { map[i.platformKey] = i })
        setStatusMap(map)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [ready, token])

  // Notion: Integration Token で直接保存
  async function handleNotionSave() {
    if (!notionKey.trim()) return
    setImporting(true); setMsg('')
    try {
      await saveNotionToken(token, notionKey.trim())
      setMsg('Notionと連携しました')
      setNotionKey('')
      // ステータスを更新
      const r = await getIntegrations(token)
      const map: StatusMap = {}
      r.integrations?.forEach((i: Integration) => { map[i.platformKey] = i })
      setStatusMap(map)
    } catch { setMsg('連携に失敗しました') }
    finally { setImporting(false) }
  }

  // インポート実行
  async function handleImport(key: string, subType?: string) {
    setImporting(true); setMsg('')
    try {
      let result
      if (key === 'notion')             result = await importFromNotion(token)
      else if (key === 'youtube')       result = await importFromYouTube(token, 'liked')
      else if (key === 'pinterest')     result = await importFromPinterest(token)
      else if (key === 'google_docs')   result = await importFromGoogleDocs(token)
      else if (key === 'google_cal')    result = await importFromGoogleCalendar(token)
      else return

      if (result?.success) {
        setMsg(`${result.imported}件インポートしました`)
      } else {
        setMsg(result?.error || 'インポートに失敗しました')
      }
    } catch { setMsg('インポートに失敗しました') }
    finally { setImporting(false) }
  }

  if (status === 'loading' || loading) return <Loader/>

  const sel = PLATFORMS.find(p => p.key === selected)

  return (
    <div style={s.page}>
      {/* ヘッダー */}
      <header style={s.header}>
        <button onClick={() => router.back()} style={s.backBtn}>← 戻る</button>
        <div style={s.headerTitle}>外部連携</div>
        <div style={{ width:60 }}/>
      </header>

      <div style={s.body}>
        {/* プラットフォームリスト */}
        <div style={s.list}>
          {PLATFORMS.map(pf => {
            const integ    = statusMap[pf.key]
            const connected = !!integ?.connected
            return (
              <button
                key={pf.key}
                onClick={() => setSelected(selected === pf.key ? null : pf.key)}
                style={{
                  ...s.pfRow,
                  ...(selected === pf.key ? { background: pf.bg, borderColor: pf.border } : {}),
                }}
              >
                <div style={{ ...s.pfIcon, background: pf.bg, border: `0.5px solid ${pf.border}` }}>
                  {pf.icon}
                </div>
                <div style={s.pfInfo}>
                  <div style={{ ...s.pfLabel, color: selected === pf.key ? pf.color : 'rgba(195,215,255,0.80)' }}>
                    {pf.label}
                  </div>
                  <div style={s.pfDesc}>{pf.desc}</div>
                </div>
                <div style={{
                  ...s.pfBadge,
                  background: connected ? 'rgba(110,231,183,0.10)' : 'rgba(100,120,200,0.08)',
                  color:      connected ? 'rgba(110,231,183,0.70)' : 'rgba(130,155,210,0.38)',
                }}>
                  {connected ? '連携済み' : '未連携'}
                </div>
              </button>
            )
          })}
        </div>

        {/* 詳細パネル */}
        {sel && (
          <div style={s.panel}>
            <div style={{ ...s.panelTitle, color: sel.color }}>{sel.label}</div>

            {/* Notion: Token入力 */}
            {sel.key === 'notion' && (
              <>
                <p style={s.panelDesc}>
                  Notion の設定 → インテグレーション から<br/>
                  「Internal Integration Token」を作成して貼り付けてください。
                </p>
                <input
                  value={notionKey}
                  onChange={e => setNotionKey(e.target.value)}
                  placeholder="secret_xxxxxxxxxxxxxxxxxxxxxxxx"
                  style={s.tokenInput}
                />
                <button
                  onClick={handleNotionSave}
                  disabled={!notionKey.trim() || importing}
                  style={{ ...s.primaryBtn, ...(importing ? s.btnOff : {}) }}
                >
                  {importing ? '保存中...' : '連携する'}
                </button>
                {statusMap['notion']?.connected && (
                  <button
                    onClick={() => handleImport('notion')}
                    disabled={importing}
                    style={{ ...s.secondaryBtn, ...(importing ? s.btnOff : {}) }}
                  >
                    {importing ? 'インポート中...' : 'ページをインポート（最新20件）'}
                  </button>
                )}
              </>
            )}

            {/* YouTube */}
            {sel.key === 'youtube' && (
              <>
                <p style={s.panelDesc}>
                  Googleアカウントの連携で自動的に利用できます。<br/>
                  高評価した動画を記憶として取り込みます。
                </p>
                {statusMap['youtube']?.connected ? (
                  <button
                    onClick={() => handleImport('youtube')}
                    disabled={importing}
                    style={{ ...s.primaryBtn, ...(importing ? s.btnOff : {}) }}
                  >
                    {importing ? 'インポート中...' : '高評価動画をインポート（最新20件）'}
                  </button>
                ) : (
                  <div style={s.oauthNote}>
                    Googleログイン時に自動連携されます。<br/>
                    連携されていない場合は一度サインアウトして再ログインしてください。
                  </div>
                )}
              </>
            )}

            {/* Pinterest */}
            {sel.key === 'pinterest' && (
              <>
                <p style={s.panelDesc}>
                  Pinterest Developer App を作成してOAuth連携します。<br/>
                  保存済みのピンをまとめてインポートできます。
                </p>
                {statusMap['pinterest']?.connected ? (
                  <button
                    onClick={() => handleImport('pinterest')}
                    disabled={importing}
                    style={{ ...s.primaryBtn, ...(importing ? s.btnOff : {}) }}
                  >
                    {importing ? 'インポート中...' : 'ピンをインポート（最新20件）'}
                  </button>
                ) : (
                  <button
                    onClick={() => router.push('/api/auth/connect/pinterest')}
                    style={s.primaryBtn}
                  >
                    Pinterestと連携する →
                  </button>
                )}
              </>
            )}

            {/* Google */}
            {sel.key === 'google' && (
              <>
                <p style={s.panelDesc}>
                  Googleアカウント連携でDocsとCalendarにアクセスできます。
                </p>
                <div style={s.subBtnGroup}>
                  <button
                    onClick={() => handleImport('google_docs')}
                    disabled={importing || !statusMap['google']?.connected}
                    style={{ ...s.secondaryBtn, ...(importing ? s.btnOff : {}) }}
                  >
                    {importing ? '...' : 'Google Docs（最新10件）'}
                  </button>
                  <button
                    onClick={() => handleImport('google_cal')}
                    disabled={importing || !statusMap['google']?.connected}
                    style={{ ...s.secondaryBtn, ...(importing ? s.btnOff : {}) }}
                  >
                    {importing ? '...' : 'Calendar（過去30日）'}
                  </button>
                </div>
                {!statusMap['google']?.connected && (
                  <div style={s.oauthNote}>
                    Googleログイン時に自動連携されます。
                  </div>
                )}
              </>
            )}

            {/* フィードバックメッセージ */}
            {msg && (
              <div style={{
                ...s.msgBox,
                color: msg.includes('失敗') ? 'rgba(255,90,90,0.75)' : 'rgba(110,231,183,0.75)',
                borderColor: msg.includes('失敗') ? 'rgba(255,90,90,0.2)' : 'rgba(110,231,183,0.2)',
              }}>
                {msg}
              </div>
            )}

            {/* 最終同期日時 */}
            {statusMap[sel.key]?.lastSyncAt && (
              <div style={s.syncTime}>
                最終同期: {new Date(statusMap[sel.key]!.lastSyncAt).toLocaleString('ja-JP')}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function Loader() {
  return (
    <div style={{ display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',background:'#020810' }}>
      <span style={{ color:'rgba(140,165,230,0.3)',fontFamily:'monospace',fontSize:11,letterSpacing:'0.16em' }}>LOADING...</span>
    </div>
  )
}

// ── スタイル ──────────────────────────────────────────────────
const s: Record<string, React.CSSProperties> = {
  page:{ display:'flex', flexDirection:'column', minHeight:'100vh', background:'#020810' },
  header:{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 20px', borderBottom:'0.5px solid rgba(60,90,200,0.12)', flexShrink:0 },
  backBtn:{ background:'none', border:'none', color:'rgba(130,160,240,0.55)', cursor:'pointer', fontSize:13, fontFamily:'"Space Mono",monospace', letterSpacing:'0.04em' },
  headerTitle:{ fontFamily:'"Space Mono",monospace', fontSize:13, fontWeight:700, color:'rgba(200,220,255,0.75)', letterSpacing:'0.14em' },

  body:{ flex:1, padding:'20px 16px', maxWidth:520, margin:'0 auto', width:'100%' },

  list:{ display:'flex', flexDirection:'column', gap:8, marginBottom:16 },
  pfRow:{ display:'flex', alignItems:'center', gap:12, padding:'12px 14px', background:'rgba(255,255,255,0.025)', border:'0.5px solid rgba(70,100,220,0.12)', borderRadius:12, cursor:'pointer', transition:'all 0.12s', textAlign:'left' },
  pfIcon:{ width:38, height:38, borderRadius:10, display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, flexShrink:0 },
  pfInfo:{ flex:1 },
  pfLabel:{ fontSize:13, fontWeight:500, marginBottom:2 },
  pfDesc:{ fontSize:11, color:'rgba(130,155,220,0.40)' },
  pfBadge:{ fontSize:10, padding:'2px 8px', borderRadius:8, fontFamily:'"Space Mono",monospace', letterSpacing:'0.04em', flexShrink:0 },

  panel:{ background:'rgba(8,12,28,0.85)', border:'0.5px solid rgba(80,110,230,0.18)', borderRadius:14, padding:'20px 18px' },
  panelTitle:{ fontFamily:'"Space Mono",monospace', fontSize:14, fontWeight:700, letterSpacing:'0.12em', marginBottom:10 },
  panelDesc:{ fontSize:13, color:'rgba(150,175,240,0.50)', lineHeight:1.8, marginBottom:16 },

  tokenInput:{ width:'100%', background:'rgba(255,255,255,0.04)', border:'0.5px solid rgba(80,110,230,0.22)', borderRadius:9, padding:'10px 14px', color:'rgba(210,225,255,0.85)', fontSize:13, outline:'none', fontFamily:'monospace', marginBottom:10 },

  primaryBtn:{ width:'100%', padding:'11px', background:'rgba(70,110,250,0.30)', border:'0.5px solid rgba(90,130,255,0.40)', borderRadius:9, fontSize:13, color:'rgba(200,220,255,0.88)', cursor:'pointer', marginBottom:8, letterSpacing:'0.02em' },
  secondaryBtn:{ flex:1, padding:'10px', background:'rgba(255,255,255,0.04)', border:'0.5px solid rgba(80,110,200,0.15)', borderRadius:9, fontSize:12, color:'rgba(155,180,240,0.60)', cursor:'pointer' },
  btnOff:{ opacity:0.4, cursor:'not-allowed' },

  subBtnGroup:{ display:'flex', gap:8, marginBottom:8 },
  oauthNote:{ fontSize:12, color:'rgba(130,155,220,0.38)', lineHeight:1.8, padding:'10px 12px', background:'rgba(255,255,255,0.02)', borderRadius:8, marginBottom:8 },

  msgBox:{ fontSize:12, padding:'10px 12px', borderRadius:8, border:'0.5px solid', marginTop:8, lineHeight:1.6 },
  syncTime:{ fontSize:11, color:'rgba(100,130,210,0.30)', marginTop:10, fontFamily:'"Space Mono",monospace' },
}
