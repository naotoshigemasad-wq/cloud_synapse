'use client'

import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { createItem, getItems, type Item, type ItemType } from '@/lib/api'
import { useGasToken } from '@/hooks/useGasToken'

// ── コンテンツタイプ自動検出 ──────────────────────────────────
function detectType(text: string): { type: ItemType; platform: string } {
  const t = text.trim()
  if (/youtu\.be|youtube\.com\/watch/i.test(t))  return { type:'video',    platform:'youtube'   }
  if (/instagram\.com\//i.test(t))               return { type:'sns_post', platform:'instagram' }
  if (/(twitter|x)\.com\//i.test(t))             return { type:'sns_post', platform:'twitter'   }
  if (/pinterest\.(com|jp)\//i.test(t))          return { type:'sns_post', platform:'pinterest' }
  if (/notion\.so\//i.test(t))                   return { type:'web_url',  platform:'notion'    }
  if (/^https?:\/\//i.test(t))                   return { type:'web_url',  platform:'web'       }
  return { type:'note', platform:'' }
}

function typeLabel(type: ItemType, platform: string) {
  if (platform === 'youtube')   return '▶ YouTube'
  if (platform === 'instagram') return '◉ Instagram'
  if (platform === 'twitter')   return '✦ X'
  if (platform === 'pinterest') return '⊕ Pinterest'
  if (platform === 'notion')    return '◻ Notion'
  if (type === 'web_url')       return '🔗 URL'
  return '✏ メモ'
}

const typeColor: Record<string, string> = {
  youtube:'rgba(245,166,35,0.7)',  instagram:'rgba(244,114,182,0.7)',
  twitter:'rgba(77,184,255,0.7)',  pinterest:'rgba(230,50,50,0.7)',
  notion:'rgba(167,139,250,0.7)', web:'rgba(100,170,255,0.6)',
  '':'rgba(110,231,183,0.7)',
}

// ── 外部プラットフォーム設定 ──────────────────────────────────
type PlatformKey = 'notion'|'youtube'|'x'|'instagram'|'pinterest'|'google'

interface Platform {
  key:       PlatformKey
  label:     string
  icon:      string
  color:     string
  connected: boolean
  desc:      string
  count?:    string
}

const PLATFORMS: Platform[] = [
  { key:'notion',    label:'Notion',    icon:'◻', color:'rgba(167,139,250,0.75)', connected:false, desc:'ページ・データベースをインポート' },
  { key:'youtube',  label:'YouTube',   icon:'▶', color:'rgba(245,166,35,0.75)',  connected:false, desc:'高評価・保存済み動画を自動取り込み' },
  { key:'x',        label:'X',         icon:'✕', color:'rgba(77,184,255,0.75)',  connected:false, desc:'ブックマークといいねをインポート' },
  { key:'instagram',label:'Instagram', icon:'◉', color:'rgba(244,114,182,0.75)',connected:false, desc:'保存済み投稿をインポート' },
  { key:'pinterest',label:'Pinterest', icon:'⊕', color:'rgba(230,50,50,0.75)',  connected:false, desc:'ボードのピンをインポート' },
  { key:'google',   label:'Google',    icon:'G', color:'rgba(100,170,255,0.75)', connected:false, desc:'ドキュメント・検索履歴をインポート' },
]

// ── グロー十字アイコン ────────────────────────────────────────
function GlowGridIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {/* 四隅 — 暗め */}
      <circle cx="5"  cy="5"  r="2"   fill="rgba(100,130,220,0.25)"/>
      <circle cx="19" cy="5"  r="2"   fill="rgba(100,130,220,0.25)"/>
      <circle cx="5"  cy="19" r="2"   fill="rgba(100,130,220,0.25)"/>
      <circle cx="19" cy="19" r="2"   fill="rgba(100,130,220,0.25)"/>
      {/* 十字 — グロー外輪 */}
      <circle cx="12" cy="5"  r="3.2" fill="rgba(140,190,255,0.12)"/>
      <circle cx="5"  cy="12" r="3.2" fill="rgba(140,190,255,0.12)"/>
      <circle cx="12" cy="12" r="3.8" fill="rgba(140,190,255,0.14)"/>
      <circle cx="19" cy="12" r="3.2" fill="rgba(140,190,255,0.12)"/>
      <circle cx="12" cy="19" r="3.2" fill="rgba(140,190,255,0.12)"/>
      {/* 十字 — コア */}
      <circle cx="12" cy="5"  r="2"   fill="rgba(180,215,255,0.92)"/>
      <circle cx="5"  cy="12" r="2"   fill="rgba(180,215,255,0.92)"/>
      <circle cx="12" cy="12" r="2.5" fill="rgba(210,235,255,1)"/>
      <circle cx="19" cy="12" r="2"   fill="rgba(180,215,255,0.92)"/>
      <circle cx="12" cy="19" r="2"   fill="rgba(180,215,255,0.92)"/>
    </svg>
  )
}

// ── メインページ ──────────────────────────────────────────────
export default function FeedPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const { token, ready } = useGasToken()

  const [items,        setItems]        = useState<Item[]>([])
  const [input,        setInput]        = useState('')
  const [sending,      setSending]      = useState(false)
  const [loadingItems, setLoadingItems] = useState(true)
  const [themeOpen,    setThemeOpen]    = useState(false)
  const [themeText,    setThemeText]    = useState('')
  const [generating,   setGenerating]   = useState(false)

  // ボトムシート
  const [sheetOpen,    setSheetOpen]    = useState(false)
  const [selectedPf,   setSelectedPf]   = useState<PlatformKey|null>(null)
  const [platforms,    setPlatforms]    = useState<Platform[]>(PLATFORMS)

  const listRef  = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { if (status === 'unauthenticated') router.replace('/login') }, [status, router])

  useEffect(() => {
    if (!ready) return
    getItems(token, { limit:50 })
      .then(r => setItems(r.items || []))
      .catch(console.error)
      .finally(() => setLoadingItems(false))
  }, [ready, token])

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
  }, [items])

  // 送信
  async function handleSend() {
    const text = input.trim()
    if (!text || sending || !token) return
    setSending(true)
    const { type, platform } = detectType(text)
    const temp: Item = {
      id: `temp_${Date.now()}`, type, displayTitle:'保存中...',
      summaryMemo:'', content:text, url: type !== 'note' ? text : '',
      thumbnailUrl:'', platform, source:'manual',
      embeddingAt:'', createdAt: new Date().toISOString(), updatedAt:'', tags:[],
    }
    setItems(prev => [...prev, temp])
    setInput('')
    try {
      const created = await createItem(token, {
        type, content: type === 'note' ? text : '',
        url: type !== 'note' ? text : '', platform,
      })
      setItems(prev => prev.map(i => i.id === temp.id ? { ...temp, ...created, id: created.id } : i))
    } catch {
      setItems(prev => prev.filter(i => i.id !== temp.id))
      setInput(text)
    } finally {
      setSending(false)
      inputRef.current?.focus()
    }
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  // ひらめき生成
  async function handleGenerate() {
    if (!themeText.trim() || generating || !token) return
    setGenerating(true)
    try {
      const { createTheme } = await import('@/lib/api')
      const result = await createTheme(token, { text: themeText.trim() })
      router.push(`/synapse?themeId=${result.themeId}&theme=${encodeURIComponent(themeText.trim())}`)
    } catch(e) {
      console.error(e)
      setGenerating(false)
    }
  }

  // 外部連携 — モック（実装時は OAuth フローへ）
  function handleConnect(key: PlatformKey) {
    setPlatforms(prev => prev.map(p =>
      p.key === key ? { ...p, connected: true, count: '準備中...' } : p
    ))
    // 実装時: router.push(`/api/auth/connect/${key}`)
  }

  function handleImport(key: PlatformKey) {
    const pf = platforms.find(p => p.key === key)
    if (!pf?.connected) return
    // インポート完了をフィードに通知バブルとして追加
    const notif: Item = {
      id: `import_${Date.now()}`, type:'web_url', displayTitle:`${pf.label}からインポート中...`,
      summaryMemo:'', content:'', url:'', thumbnailUrl:'',
      platform: key, source:'import',
      embeddingAt:'', createdAt: new Date().toISOString(), updatedAt:'', tags:[],
    }
    setItems(prev => [...prev, notif])
    setSheetOpen(false)
    setSelectedPf(null)
  }

  const { type, platform } = detectType(input)
  const detectedColor = typeColor[platform] || typeColor['']
  const showDetect    = input.trim().length > 0

  if (status === 'loading') return <Loader/>

  const currentPf = platforms.find(p => p.key === selectedPf)

  return (
    <div style={s.page}>

      {/* ── ヘッダー ── */}
      <header style={s.header}>
        <div style={s.headerLogo}>CLOUD SYNAPSE</div>
        <div style={s.headerRight}>
          <button onClick={() => setThemeOpen(true)} style={s.sparkBtn}>
            ✦ ひらめきを生成
          </button>
          <button onClick={() => signOut({ callbackUrl:'/login' })} style={s.signOutBtn}>╮</button>
        </div>
      </header>

      {/* ── メッセージリスト ── */}
      <div ref={listRef} style={s.list}>
        {loadingItems && <div style={s.loadingHint}>記憶を読み込んでいます...</div>}
        {!loadingItems && items.length === 0 && (
          <div style={s.emptyHint}>
            <div style={{ fontSize:28, marginBottom:10 }}>🌱</div>
            <div style={{ fontSize:13, color:'rgba(150,175,240,0.45)', lineHeight:1.8 }}>
              最初の記憶を追加してみましょう。<br/>
              メモ・URL・YouTube・SNSリンクなど<br/>
              何でも貼り付けるだけで保存できます。
            </div>
          </div>
        )}
        {items.map(item => <MessageBubble key={item.id} item={item}/>)}
      </div>

      {/* ── 入力エリア ── */}
      <div style={s.inputArea}>
        {showDetect && (
          <div style={{ ...s.badge, color: detectedColor, borderColor: detectedColor }}>
            {typeLabel(type, platform)}
          </div>
        )}
        <div style={s.inputRow}>
          {/* グロー十字ボタン */}
          <button
            onClick={() => { setSheetOpen(true); setSelectedPf(null) }}
            style={s.gridBtn}
            title="外部データを取り込む"
          >
            <GlowGridIcon size={18}/>
          </button>

          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="メモ、URL、YouTube、SNSリンクを貼り付け..."
            style={s.textarea}
            rows={1}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || sending}
            style={{ ...s.sendBtn, ...((!input.trim() || sending) ? s.sendOff : {}) }}
          >
            {sending ? '…' : '↑'}
          </button>
        </div>
      </div>

      {/* ── ボトムシートオーバーレイ ── */}
      {sheetOpen && (
        <div style={s.sheetOverlay} onClick={() => { setSheetOpen(false); setSelectedPf(null) }}>
          <div style={s.sheet} onClick={e => e.stopPropagation()}>
            {/* ハンドル */}
            <div style={s.sheetHandle}/>
            <div style={s.sheetTitle}>外部データを取り込む</div>

            {/* プラットフォームグリッド */}
            <div style={s.pfGrid}>
              {platforms.map(pf => (
                <button
                  key={pf.key}
                  onClick={() => setSelectedPf(pf.key)}
                  style={{
                    ...s.pfCard,
                    ...(selectedPf === pf.key ? { border:`0.5px solid ${pf.color}`, background:'rgba(40,60,140,0.28)' } : {}),
                  }}
                >
                  <div style={{ fontSize:20, marginBottom:5, lineHeight:1 }}>{pf.icon}</div>
                  <div style={s.pfLabel}>{pf.label}</div>
                  <div style={{
                    fontSize:9, marginTop:2,
                    color: pf.connected ? 'rgba(110,231,183,0.6)' : 'rgba(130,155,210,0.32)',
                  }}>
                    {pf.connected ? '連携済み' : '未連携'}
                  </div>
                </button>
              ))}
            </div>

            {/* 選択時のアクションエリア */}
            {currentPf && (
              <div style={s.pfAction}>
                <div style={s.pfActionHeader}>
                  <span style={{ ...s.pfActionName, color: currentPf.color }}>{currentPf.label}</span>
                  <span style={{
                    fontSize:9, padding:'2px 8px', borderRadius:8,
                    background: currentPf.connected ? 'rgba(110,231,183,0.1)' : 'rgba(100,120,200,0.1)',
                    color: currentPf.connected ? 'rgba(110,231,183,0.65)' : 'rgba(140,165,220,0.4)',
                  }}>
                    {currentPf.connected ? '連携済み' : '未連携'}
                  </span>
                </div>
                <div style={s.pfActionDesc}>{currentPf.desc}</div>
                {currentPf.count && (
                  <div style={{ fontSize:11, color:'rgba(150,175,240,0.5)', marginBottom:12 }}>{currentPf.count}</div>
                )}

                {currentPf.connected ? (
                  <div style={s.pfBtnRow}>
                    <button onClick={() => handleImport(currentPf.key)} style={s.pfBtnPrimary}>
                      全件インポート
                    </button>
                    <button style={s.pfBtnSecondary}>件数を選ぶ</button>
                  </div>
                ) : (
                  <button onClick={() => handleConnect(currentPf.key)} style={s.pfBtnPrimary}>
                    {currentPf.label} と連携する →
                  </button>
                )}
              </div>
            )}

            <button onClick={() => { setSheetOpen(false); setSelectedPf(null) }} style={s.sheetCancel}>
              キャンセル
            </button>
          </div>
        </div>
      )}

      {/* ── テーマ入力モーダル ── */}
      {themeOpen && (
        <div style={s.overlay} onClick={() => setThemeOpen(false)}>
          <div style={s.modal} onClick={e => e.stopPropagation()}>
            <div style={s.modalTitle}>✦ ひらめきを生成</div>
            <p style={s.modalDesc}>
              テーマを入力すると、あなたの記憶から<br/>
              AIがキーワードを生成して3D空間に展開します。
            </p>
            <textarea
              value={themeText}
              onChange={e => setThemeText(e.target.value)}
              placeholder="例：2050年の都市交通"
              style={s.themeInput}
              rows={2}
              autoFocus
            />
            <button
              onClick={handleGenerate}
              disabled={!themeText.trim() || generating}
              style={{ ...s.generateBtn, ...(!themeText.trim() || generating ? s.generateOff : {}) }}
            >
              {generating ? '生成中...' : '空間を生成する →'}
            </button>
            <button onClick={() => setThemeOpen(false)} style={s.cancelBtn}>キャンセル</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── メッセージバブル ──────────────────────────────────────────
function MessageBubble({ item }: { item: Item }) {
  const isUrl  = item.type !== 'note'
  const color  = typeColor[item.platform] || typeColor['']
  const label  = typeLabel(item.type, item.platform)

  return (
    <div style={s.bubbleWrap}>
      <div style={s.bubble}>
        <div style={{ ...s.bubbleBadge, color, borderColor: color }}>{label}</div>
        <div style={s.bubbleTitle}>
          {item.displayTitle || item.content?.slice(0,40) || item.url?.slice(0,40)}
        </div>
        {isUrl && item.url && (
          <div style={s.bubbleUrl}>{item.url.slice(0,60)}{item.url.length > 60 ? '…' : ''}</div>
        )}
        {item.thumbnailUrl && <img src={item.thumbnailUrl} alt="" style={s.thumb}/>}
        <div style={s.bubbleTime}>
          {item.createdAt ? new Date(item.createdAt).toLocaleTimeString('ja-JP',{hour:'2-digit',minute:'2-digit'}) : ''}
        </div>
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
  page:{ display:'flex', flexDirection:'column', height:'100vh', background:'#020810', overflow:'hidden' },

  header:{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 20px', borderBottom:'0.5px solid rgba(60,90,200,0.12)', flexShrink:0 },
  headerLogo:{ fontFamily:'"Space Mono",monospace', fontSize:13, fontWeight:700, color:'rgba(200,220,255,0.75)', letterSpacing:'0.16em' },
  headerRight:{ display:'flex', alignItems:'center', gap:10 },
  sparkBtn:{ padding:'7px 16px', background:'rgba(80,100,240,0.14)', border:'0.5px solid rgba(90,120,255,0.28)', borderRadius:20, fontSize:12, color:'rgba(180,200,255,0.75)', cursor:'pointer', fontFamily:'"Space Mono",monospace', letterSpacing:'0.04em' },
  signOutBtn:{ width:32, height:32, background:'none', border:'0.5px solid rgba(80,100,200,0.15)', borderRadius:8, color:'rgba(120,145,220,0.4)', cursor:'pointer', fontSize:14, display:'flex', alignItems:'center', justifyContent:'center' },

  list:{ flex:1, overflowY:'auto', padding:'20px 16px 8px', display:'flex', flexDirection:'column', gap:10 },
  loadingHint:{ textAlign:'center', color:'rgba(130,155,230,0.3)', fontSize:12, fontFamily:'monospace', letterSpacing:'0.08em', padding:40 },
  emptyHint:{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', textAlign:'center', padding:40 },

  bubbleWrap:{ display:'flex', justifyContent:'flex-end' },
  bubble:{ maxWidth:'72%', background:'rgba(40,60,160,0.22)', border:'0.5px solid rgba(70,110,230,0.2)', borderRadius:'16px 16px 4px 16px', padding:'10px 14px' },
  bubbleBadge:{ fontSize:10, fontFamily:'"Space Mono",monospace', letterSpacing:'0.05em', marginBottom:5, border:'0.5px solid', display:'inline-block', padding:'1px 7px', borderRadius:10 },
  bubbleTitle:{ fontSize:13, color:'rgba(210,225,255,0.85)', lineHeight:1.6, marginBottom:3, fontWeight:500 },
  bubbleUrl:{ fontSize:10, color:'rgba(110,140,220,0.45)', fontFamily:'monospace', wordBreak:'break-all' },
  thumb:{ width:'100%', borderRadius:8, marginTop:8, maxHeight:140, objectFit:'cover' },
  bubbleTime:{ fontSize:10, color:'rgba(100,130,210,0.3)', marginTop:5, textAlign:'right', fontFamily:'monospace' },

  inputArea:{ padding:'10px 14px 16px', borderTop:'0.5px solid rgba(60,90,200,0.12)', flexShrink:0, background:'rgba(4,8,20,0.9)' },
  badge:{ fontSize:10, fontFamily:'"Space Mono",monospace', letterSpacing:'0.05em', border:'0.5px solid', display:'inline-block', padding:'2px 8px', borderRadius:10, marginBottom:6 },
  inputRow:{ display:'flex', gap:8, alignItems:'flex-end' },

  // グロー十字ボタン
  gridBtn:{ width:40, height:40, borderRadius:'50%', background:'rgba(255,255,255,0.05)', border:'0.5px solid rgba(80,110,230,0.25)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, cursor:'pointer', padding:0 },

  textarea:{ flex:1, background:'rgba(255,255,255,0.04)', border:'0.5px solid rgba(80,110,230,0.22)', borderRadius:12, padding:'10px 14px', color:'rgba(210,225,255,0.85)', fontSize:14, resize:'none', outline:'none', lineHeight:1.6, maxHeight:120, overflowY:'auto', fontFamily:'inherit' },
  sendBtn:{ width:40, height:40, borderRadius:'50%', background:'rgba(70,110,250,0.5)', border:'none', color:'white', fontSize:16, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 },
  sendOff:{ opacity:0.3, cursor:'not-allowed' },

  // ボトムシート
  sheetOverlay:{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', backdropFilter:'blur(6px)', zIndex:40, display:'flex', alignItems:'flex-end' },
  sheet:{ width:'100%', maxWidth:480, margin:'0 auto', background:'rgba(8,12,28,0.98)', border:'0.5px solid rgba(80,110,240,0.2)', borderRadius:'18px 18px 0 0', padding:'16px 18px 32px' },
  sheetHandle:{ width:36, height:3, background:'rgba(100,130,220,0.22)', borderRadius:2, margin:'0 auto 16px' },
  sheetTitle:{ fontSize:11, fontFamily:'"Space Mono",monospace', color:'rgba(120,150,210,0.4)', letterSpacing:'0.10em', marginBottom:14 },
  pfGrid:{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10, marginBottom:14 },
  pfCard:{ background:'rgba(255,255,255,0.03)', border:'0.5px solid rgba(80,100,180,0.15)', borderRadius:12, padding:'14px 8px', textAlign:'center', cursor:'pointer', transition:'all 0.12s' },
  pfLabel:{ fontSize:11, fontWeight:500, color:'rgba(185,210,255,0.65)' },

  pfAction:{ background:'rgba(255,255,255,0.03)', border:'0.5px solid rgba(80,110,230,0.15)', borderRadius:12, padding:'14px 16px', marginBottom:12 },
  pfActionHeader:{ display:'flex', alignItems:'center', gap:8, marginBottom:6 },
  pfActionName:{ fontSize:12, fontWeight:500 },
  pfActionDesc:{ fontSize:12, color:'rgba(150,175,240,0.5)', marginBottom:12, lineHeight:1.6 },
  pfBtnRow:{ display:'flex', gap:8 },
  pfBtnPrimary:{ flex:1, padding:'10px', background:'rgba(70,110,240,0.22)', border:'0.5px solid rgba(90,130,255,0.32)', borderRadius:9, fontSize:12, color:'rgba(190,215,255,0.85)', cursor:'pointer' },
  pfBtnSecondary:{ flex:1, padding:'10px', background:'rgba(255,255,255,0.03)', border:'0.5px solid rgba(80,110,200,0.15)', borderRadius:9, fontSize:12, color:'rgba(140,165,230,0.5)', cursor:'pointer' },
  sheetCancel:{ width:'100%', padding:10, background:'none', border:'none', color:'rgba(120,145,220,0.3)', fontSize:13, cursor:'pointer' },

  // テーマモーダル
  overlay:{ position:'fixed', inset:0, background:'rgba(0,0,0,0.65)', backdropFilter:'blur(8px)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:50, padding:20 },
  modal:{ width:'100%', maxWidth:440, background:'rgba(8,12,28,0.97)', border:'0.5px solid rgba(80,115,240,0.25)', borderRadius:18, padding:'36px 32px' },
  modalTitle:{ fontFamily:'"Space Mono",monospace', fontSize:15, fontWeight:700, color:'rgba(200,220,255,0.85)', letterSpacing:'0.12em', marginBottom:10 },
  modalDesc:{ fontSize:13, color:'rgba(150,180,255,0.45)', lineHeight:1.8, marginBottom:20 },
  themeInput:{ width:'100%', background:'rgba(255,255,255,0.04)', border:'0.5px solid rgba(80,115,240,0.25)', borderRadius:10, padding:'12px 16px', color:'rgba(210,225,255,0.85)', fontSize:15, resize:'none', outline:'none', lineHeight:1.6, fontFamily:'inherit', marginBottom:16 },
  generateBtn:{ width:'100%', padding:'13px 20px', background:'rgba(70,110,250,0.5)', border:'0.5px solid rgba(90,130,255,0.45)', borderRadius:11, color:'rgba(210,230,255,0.9)', fontSize:14, fontWeight:500, cursor:'pointer', letterSpacing:'0.05em', marginBottom:10 },
  generateOff:{ opacity:0.35, cursor:'not-allowed' },
  cancelBtn:{ width:'100%', padding:10, background:'none', border:'none', color:'rgba(120,145,220,0.35)', fontSize:13, cursor:'pointer' },
}
