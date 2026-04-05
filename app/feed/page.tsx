'use client'

import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { createItem, getItems, type Item, type ItemType } from '@/lib/api'
import { useGasToken } from '@/hooks/useGasToken'

// ── ダークモード状態（グローバル） ────────────────────────────
function useDarkMode() {
  const [dark, setDark] = useState(false)
  useEffect(() => {
    const saved = localStorage.getItem('cs_dark')
    if (saved === '1') setDark(true)
  }, [])
  function toggle() {
    setDark(d => {
      localStorage.setItem('cs_dark', d ? '0' : '1')
      return !d
    })
  }
  return { dark, toggle }
}

// ── テキスト改行処理（7文字超で単語境界で折り返し）────────────
function formatText(text: string): string {
  if (!text) return ''
  const chars = Array.from(text)
  if (chars.length <= 7) return text
  const half = Math.ceil(chars.length / 2)
  // 句読点・スペース優先で折り返し位置を探す
  const breakChars = ['　', ' ', '。', '、', '・', '！', '？', '…']
  let breakPos = half
  for (let i = half; i >= Math.max(0, half - 4); i--) {
    if (breakChars.includes(chars[i])) { breakPos = i + 1; break }
  }
  return chars.slice(0, breakPos).join('') + '\n' + chars.slice(breakPos).join('')
}

// ── YouTube動画IDを抽出 ──────────────────────────────────────
function extractYouTubeId(url: string): string | null {
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/watch\?v=|youtube\.com\/embed\/)([^&?/\s]{11})/)
  return m ? m[1] : null
}

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
  if (type === 'image')         return '🖼 画像'
  if (platform === 'youtube')   return '▶ YouTube'
  if (platform === 'instagram') return '◉ Instagram'
  if (platform === 'twitter')   return '✦ X'
  if (platform === 'pinterest') return '⊕ Pinterest'
  if (platform === 'notion')    return '◻ Notion'
  if (type === 'web_url')       return '🔗 URL'
  return '✏ メモ'
}

const typeColorDark: Record<string, string> = {
  youtube:'rgba(245,166,35,0.8)',  instagram:'rgba(244,114,182,0.8)',
  twitter:'rgba(77,184,255,0.8)',  pinterest:'rgba(230,50,50,0.8)',
  notion:'rgba(167,139,250,0.8)', web:'rgba(100,170,255,0.7)',
  image:'rgba(110,231,183,0.8)',  '':'rgba(110,231,183,0.8)',
}
const typeColorLight: Record<string, string> = {
  youtube:'rgba(180,110,0,0.85)',  instagram:'rgba(180,60,120,0.85)',
  twitter:'rgba(0,120,200,0.85)',  pinterest:'rgba(180,0,20,0.85)',
  notion:'rgba(100,60,200,0.85)', web:'rgba(30,100,200,0.85)',
  image:'rgba(0,140,100,0.85)',   '':'rgba(0,140,100,0.85)',
}

// ── 画像リサイズ ─────────────────────────────────────────────
function resizeImageToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const MAX = 400
    const reader = new FileReader()
    reader.onerror = reject
    reader.onload = e => {
      const img = new Image()
      img.onerror = reject
      img.onload = () => {
        const ratio = Math.min(MAX / img.width, MAX / img.height, 1)
        const w = Math.round(img.width * ratio), h = Math.round(img.height * ratio)
        const cv = document.createElement('canvas')
        cv.width = w; cv.height = h
        cv.getContext('2d')!.drawImage(img, 0, 0, w, h)
        resolve(cv.toDataURL('image/jpeg', 0.65))
      }
      img.src = e.target!.result as string
    }
    reader.readAsDataURL(file)
  })
}

// ── 外部プラットフォーム ──────────────────────────────────────
type PlatformKey = 'notion'|'youtube'|'x'|'instagram'|'pinterest'|'google'
interface Platform { key:PlatformKey; label:string; icon:string; color:string; connected:boolean; desc:string }
const PLATFORMS: Platform[] = [
  { key:'notion',    label:'Notion',    icon:'◻', color:'rgba(167,139,250,0.75)', connected:false, desc:'ページ・データベースをインポート' },
  { key:'youtube',   label:'YouTube',   icon:'▶', color:'rgba(245,166,35,0.75)',  connected:false, desc:'高評価・保存済み動画を自動取り込み' },
  { key:'x',         label:'X',         icon:'✕', color:'rgba(77,184,255,0.75)',  connected:false, desc:'ブックマークといいねをインポート' },
  { key:'instagram', label:'Instagram', icon:'◉', color:'rgba(244,114,182,0.75)',connected:false,  desc:'保存済み投稿をインポート' },
  { key:'pinterest', label:'Pinterest', icon:'⊕', color:'rgba(230,50,50,0.75)',  connected:false, desc:'ボードのピンをインポート' },
  { key:'google',    label:'Google',    icon:'G', color:'rgba(100,170,255,0.75)', connected:false, desc:'ドキュメント・検索履歴をインポート' },
]

// ── グロー十字アイコン ────────────────────────────────────────
function GlowGridIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="5"  cy="5"  r="2"   fill="rgba(100,130,220,0.25)"/>
      <circle cx="19" cy="5"  r="2"   fill="rgba(100,130,220,0.25)"/>
      <circle cx="5"  cy="19" r="2"   fill="rgba(100,130,220,0.25)"/>
      <circle cx="19" cy="19" r="2"   fill="rgba(100,130,220,0.25)"/>
      <circle cx="12" cy="5"  r="3.2" fill="rgba(140,190,255,0.12)"/>
      <circle cx="5"  cy="12" r="3.2" fill="rgba(140,190,255,0.12)"/>
      <circle cx="12" cy="12" r="3.8" fill="rgba(140,190,255,0.14)"/>
      <circle cx="19" cy="12" r="3.2" fill="rgba(140,190,255,0.12)"/>
      <circle cx="12" cy="19" r="3.2" fill="rgba(140,190,255,0.12)"/>
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
  const { status } = useSession()
  const router     = useRouter()
  const { token, ready } = useGasToken()
  const { dark, toggle: toggleDark } = useDarkMode()

  const [items,        setItems]        = useState<Item[]>([])
  const [input,        setInput]        = useState('')
  const [sending,      setSending]      = useState(false)
  const [loadingItems, setLoadingItems] = useState(true)
  const [themeOpen,    setThemeOpen]    = useState(false)
  const [themeText,    setThemeText]    = useState('')
  const [generating,   setGenerating]   = useState(false)
  const [imagePreview, setImagePreview] = useState<string|null>(null)
  const [isDragging,   setIsDragging]   = useState(false)
  const [sheetOpen,    setSheetOpen]    = useState(false)
  const [selectedPf,   setSelectedPf]   = useState<PlatformKey|null>(null)
  const [platforms,    setPlatforms]    = useState<Platform[]>(PLATFORMS)

  const listRef  = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const fileRef  = useRef<HTMLInputElement>(null)

  useEffect(() => { if (status === 'unauthenticated') router.replace('/login') }, [status, router])
  useEffect(() => {
    if (!ready) return
    getItems(token, { })
      .then(r => setItems(r.items || []))
      .catch(console.error)
      .finally(() => setLoadingItems(false))
  }, [ready, token])
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
  }, [items])

  // ── 画像処理 ──────────────────────────────────────────────
  async function handleImageFile(file: File) {
    if (!file.type.startsWith('image/') || !token) return
    setSending(true)
    try {
      const base64 = await resizeImageToBase64(file)
      setImagePreview(base64)
      const temp: Item = {
        id:`temp_${Date.now()}`, type:'image', displayTitle:'解析中...',
        summaryMemo:'', content:'', url:'', thumbnailUrl:base64,
        platform:'', source:'manual', embeddingAt:'',
        createdAt:new Date().toISOString(), updatedAt:'', tags:[],
      }
      setItems(prev => [...prev, temp])
      setImagePreview(null)
      const created = await createItem(token, { type:'image', content:file.name||'画像', image_base64:base64 } as any)
      setItems(prev => prev.map(i => i.id === temp.id ? { ...temp, ...created, thumbnailUrl:base64 } : i))
    } catch(e) { console.error(e) }
    finally { setSending(false); if (fileRef.current) fileRef.current.value = '' }
  }

  // ── テキスト送信 ──────────────────────────────────────────
  async function handleSend() {
    const text = input.trim()
    if (!text || sending || !token) return
    setSending(true)
    const { type, platform } = detectType(text)
    const temp: Item = {
      id:`temp_${Date.now()}`, type, displayTitle:'保存中...',
      summaryMemo:'', content:type==='note'?text:'',
      url:type!=='note'?text:'', thumbnailUrl:'',
      platform, source:'manual', embeddingAt:'',
      createdAt:new Date().toISOString(), updatedAt:'', tags:[],
    }
    setItems(prev => [...prev, temp])
    setInput('')
    try {
      const created = await createItem(token, { type, content:type==='note'?text:'', url:type!=='note'?text:'', platform })
      setItems(prev => prev.map(i => i.id === temp.id ? { ...temp, ...created, id:created.id } : i))
    } catch {
      setItems(prev => prev.filter(i => i.id !== temp.id))
      setInput(text)
    } finally { setSending(false); inputRef.current?.focus() }
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }
  function handlePaste(e: React.ClipboardEvent) {
    for (let i = 0; i < e.clipboardData.items.length; i++) {
      if (e.clipboardData.items[i].type.startsWith('image/')) {
        e.preventDefault()
        const file = e.clipboardData.items[i].getAsFile()
        if (file) handleImageFile(file)
        return
      }
    }
  }
  function handleDragOver(e: React.DragEvent) { e.preventDefault(); setIsDragging(true) }
  function handleDragLeave() { setIsDragging(false) }
  function handleDrop(e: React.DragEvent) {
    e.preventDefault(); setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleImageFile(file)
  }

  async function handleGenerate() {
    if (!themeText.trim() || generating || !token) return
    setGenerating(true)
    try {
      const { createTheme } = await import('@/lib/api')
      const result = await createTheme(token, { text: themeText.trim() })
      router.push(`/synapse?themeId=${result.themeId}&theme=${encodeURIComponent(themeText.trim())}`)
    } catch(e) { console.error(e); setGenerating(false) }
  }

  function handleConnect(key: PlatformKey) {
    setPlatforms(prev => prev.map(p => p.key===key ? { ...p, connected:true } : p))
  }
  function handleImport(key: PlatformKey) {
    const pf = platforms.find(p => p.key===key)
    if (!pf?.connected) return
    const notif: Item = {
      id:`import_${Date.now()}`, type:'web_url', displayTitle:`${pf.label}からインポート中...`,
      summaryMemo:'', content:'', url:'', thumbnailUrl:'', platform:key, source:'import',
      embeddingAt:'', createdAt:new Date().toISOString(), updatedAt:'', tags:[],
    }
    setItems(prev => [...prev, notif])
    setSheetOpen(false); setSelectedPf(null)
  }

  const { type, platform } = detectType(input)
  const typeColors  = dark ? typeColorDark : typeColorLight
  const detectedColor = typeColors[platform] || typeColors['']
  const showDetect  = input.trim().length > 0
  if (status === 'loading') return <Loader dark={dark}/>
  const currentPf = platforms.find(p => p.key === selectedPf)

  // ── テーマ変数 ────────────────────────────────────────────
  const bg          = dark ? '#020810' : '#ffffff'
  const bgSub       = dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,50,0.04)'
  const border      = dark ? 'rgba(60,90,200,0.12)' : 'rgba(0,0,100,0.10)'
  const textPrimary = dark ? 'rgba(200,220,255,0.88)' : 'rgba(10,20,60,0.90)'
  const textSec     = dark ? 'rgba(150,175,240,0.55)' : 'rgba(30,50,130,0.55)'
  const bubbleBg    = dark ? 'rgba(40,60,160,0.22)' : 'rgba(220,230,255,0.55)'
  const bubbleBorder= dark ? 'rgba(70,110,230,0.2)' : 'rgba(80,120,220,0.25)'
  const inputBg     = dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,80,0.04)'
  const inputBorder = dark ? 'rgba(80,110,230,0.22)' : 'rgba(80,110,200,0.22)'
  const logoColor   = dark ? 'rgba(200,220,255,0.75)' : 'rgba(20,40,120,0.85)'

  return (
    <div
      style={{ display:'flex', flexDirection:'column', height:'100vh', background:bg, overflow:'hidden', position:'relative', transition:'background 0.2s' }}
      onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
    >
      {isDragging && (
        <div style={{ position:'absolute', inset:0, background:dark?'rgba(10,20,50,0.85)':'rgba(200,220,255,0.85)', zIndex:50, display:'flex', alignItems:'center', justifyContent:'center', backdropFilter:'blur(4px)' }}>
          <div style={{ fontSize:16, color:dark?'rgba(160,200,255,0.9)':'rgba(20,60,180,0.9)', fontFamily:'"Space Mono",monospace', letterSpacing:'0.08em' }}>🖼 画像をドロップして追加</div>
        </div>
      )}

      {/* ヘッダー */}
      <header style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 20px', borderBottom:`0.5px solid ${border}`, flexShrink:0 }}>
        <div style={{ fontFamily:'"Space Mono",monospace', fontSize:13, fontWeight:700, color:logoColor, letterSpacing:'0.16em' }}>CLOUD SYNAPSE</div>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          {/* ダーク/ライト切り替え */}
          <button onClick={toggleDark} style={{ width:32, height:32, background:'none', border:`0.5px solid ${border}`, borderRadius:8, cursor:'pointer', fontSize:15, color:textSec, display:'flex', alignItems:'center', justifyContent:'center' }}>
            {dark ? '☀' : '🌙'}
          </button>
          <button onClick={() => setThemeOpen(true)} style={{ padding:'7px 16px', background:dark?'rgba(80,100,240,0.14)':'rgba(60,80,220,0.10)', border:`0.5px solid ${dark?'rgba(90,120,255,0.28)':'rgba(60,100,220,0.28)'}`, borderRadius:20, fontSize:12, color:dark?'rgba(180,200,255,0.75)':'rgba(40,80,200,0.80)', cursor:'pointer', fontFamily:'"Space Mono",monospace', letterSpacing:'0.04em' }}>
            ✦ Creative Wondering
          </button>
          <button onClick={() => signOut({ callbackUrl:'/login' })} style={{ width:32, height:32, background:'none', border:`0.5px solid ${border}`, borderRadius:8, color:textSec, cursor:'pointer', fontSize:14, display:'flex', alignItems:'center', justifyContent:'center' }}>╮</button>
        </div>
      </header>

      {/* メッセージリスト */}
      <div ref={listRef} style={{ flex:1, overflowY:'auto', padding:'20px 16px 8px', display:'flex', flexDirection:'column', gap:10 }}>
        {loadingItems && <div style={{ textAlign:'center', color:textSec, fontSize:12, fontFamily:'monospace', padding:40 }}>記憶を読み込んでいます...</div>}
        {!loadingItems && items.length === 0 && (
          <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', textAlign:'center', padding:40 }}>
            <div style={{ fontSize:28, marginBottom:10 }}>🌱</div>
            <div style={{ fontSize:13, color:textSec, lineHeight:1.8 }}>最初の記憶を追加してみましょう。<br/>メモ・URL・画像など何でも保存できます。</div>
          </div>
        )}

      {items.map(item => (
    <MessageBubble
    key={item.id} item={item} dark={dark}
    bubbleBg={bubbleBg} bubbleBorder={bubbleBorder}
    textPrimary={textPrimary} textSec={textSec}
    typeColors={typeColors}
    onMemoSaved={(itemId, memo) => {
      setItems(prev => prev.map(i => i.id === itemId ? { ...i, summaryMemo: memo } : i))
    }}
  />
))} 
      </div>

      {/* 入力エリア */}
      <div style={{ padding:'10px 14px 16px', borderTop:`0.5px solid ${border}`, flexShrink:0, background:dark?'rgba(4,8,20,0.9)':'rgba(245,247,255,0.95)' }}>
        {imagePreview && (
          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8, padding:'8px 10px', background:bubbleBg, borderRadius:10, border:`0.5px solid ${bubbleBorder}` }}>
            <img src={imagePreview} alt="preview" style={{ width:48, height:48, borderRadius:6, objectFit:'cover' }}/>
            <div style={{ fontSize:12, color:textSec }}>解析中...</div>
          </div>
        )}
        {showDetect && !imagePreview && (
          <div style={{ fontSize:10, fontFamily:'"Space Mono",monospace', letterSpacing:'0.05em', border:`0.5px solid ${detectedColor}`, color:detectedColor, display:'inline-block', padding:'2px 8px', borderRadius:10, marginBottom:6 }}>
            {typeLabel(type, platform)}
          </div>
        )}
        <div style={{ display:'flex', gap:8, alignItems:'flex-end' }}>
          <button onClick={() => { setSheetOpen(true); setSelectedPf(null) }} style={{ width:40, height:40, borderRadius:'50%', background:bgSub, border:`0.5px solid ${inputBorder}`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, cursor:'pointer', padding:0 }}>
            <GlowGridIcon size={18}/>
          </button>
          <button onClick={() => fileRef.current?.click()} style={{ width:40, height:40, borderRadius:'50%', background:bgSub, border:`0.5px solid ${inputBorder}`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, cursor:'pointer', padding:0 }} title="画像を追加">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={dark?'rgba(160,190,255,0.65)':'rgba(60,100,200,0.65)'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
              <path d="M21 15l-5-5L5 21"/>
            </svg>
          </button>
          <input ref={fileRef} type="file" accept="image/*" style={{ display:'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) handleImageFile(f) }}/>
          <textarea
            ref={inputRef} value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey} onPaste={handlePaste}
            placeholder="メモ、URL、画像を貼り付け（Ctrl+V）..."
            style={{ flex:1, background:inputBg, border:`0.5px solid ${inputBorder}`, borderRadius:12, padding:'10px 14px', color:textPrimary, fontSize:14, resize:'none', outline:'none', lineHeight:1.6, maxHeight:120, overflowY:'auto', fontFamily:'inherit' }}
            rows={1}
          />
          <button
            onClick={handleSend} disabled={!input.trim() || sending}
            style={{ width:40, height:40, borderRadius:'50%', background:dark?'rgba(70,110,250,0.5)':'rgba(50,90,220,0.7)', border:'none', color:'white', fontSize:16, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, opacity:(!input.trim()||sending)?0.3:1 }}
          >
            {sending ? '…' : '↑'}
          </button>
        </div>
      </div>

      {/* ボトムシート */}
      {sheetOpen && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', backdropFilter:'blur(6px)', zIndex:40, display:'flex', alignItems:'flex-end' }} onClick={() => { setSheetOpen(false); setSelectedPf(null) }}>
          <div style={{ width:'100%', maxWidth:480, margin:'0 auto', background:dark?'rgba(8,12,28,0.98)':'rgba(245,248,255,0.98)', border:`0.5px solid ${border}`, borderRadius:'18px 18px 0 0', padding:'16px 18px 32px' }} onClick={e => e.stopPropagation()}>
            <div style={{ width:36, height:3, background:'rgba(100,130,220,0.22)', borderRadius:2, margin:'0 auto 16px' }}/>
            <div style={{ fontSize:11, fontFamily:'"Space Mono",monospace', color:textSec, letterSpacing:'0.10em', marginBottom:14 }}>外部データを取り込む</div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10, marginBottom:14 }}>
              {platforms.map(pf => (
                <button key={pf.key} onClick={() => setSelectedPf(pf.key)} style={{ background:selectedPf===pf.key?'rgba(40,60,140,0.28)':bgSub, border:`0.5px solid ${selectedPf===pf.key?pf.color:'rgba(80,100,180,0.15)'}`, borderRadius:12, padding:'14px 8px', textAlign:'center', cursor:'pointer' }}>
                  <div style={{ fontSize:20, marginBottom:5, lineHeight:1 }}>{pf.icon}</div>
                  <div style={{ fontSize:11, fontWeight:500, color:textPrimary }}>{pf.label}</div>
                  <div style={{ fontSize:9, marginTop:2, color:pf.connected?'rgba(110,231,183,0.6)':textSec }}>{pf.connected?'連携済み':'未連携'}</div>
                </button>
              ))}
            </div>
            {currentPf && (
              <div style={{ background:bgSub, border:`0.5px solid ${border}`, borderRadius:12, padding:'14px 16px', marginBottom:12 }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                  <span style={{ fontSize:12, fontWeight:500, color:currentPf.color }}>{currentPf.label}</span>
                  <span style={{ fontSize:9, padding:'2px 8px', borderRadius:8, background:currentPf.connected?'rgba(110,231,183,0.1)':'rgba(100,120,200,0.1)', color:currentPf.connected?'rgba(110,231,183,0.65)':'rgba(140,165,220,0.4)' }}>{currentPf.connected?'連携済み':'未連携'}</span>
                </div>
                <div style={{ fontSize:12, color:textSec, marginBottom:12, lineHeight:1.6 }}>{currentPf.desc}</div>
                {currentPf.connected ? (
                  <div style={{ display:'flex', gap:8 }}>
                    <button onClick={() => handleImport(currentPf.key)} style={{ flex:1, padding:'10px', background:'rgba(70,110,240,0.22)', border:'0.5px solid rgba(90,130,255,0.32)', borderRadius:9, fontSize:12, color:dark?'rgba(190,215,255,0.85)':'rgba(40,80,200,0.9)', cursor:'pointer' }}>全件インポート</button>
                    <button style={{ flex:1, padding:'10px', background:bgSub, border:`0.5px solid ${border}`, borderRadius:9, fontSize:12, color:textSec, cursor:'pointer' }}>件数を選ぶ</button>
                  </div>
                ) : (
                  <button onClick={() => handleConnect(currentPf.key)} style={{ width:'100%', padding:'10px', background:'rgba(70,110,240,0.22)', border:'0.5px solid rgba(90,130,255,0.32)', borderRadius:9, fontSize:12, color:dark?'rgba(190,215,255,0.85)':'rgba(40,80,200,0.9)', cursor:'pointer' }}>{currentPf.label} と連携する →</button>
                )}
              </div>
            )}
            <button onClick={() => { setSheetOpen(false); setSelectedPf(null) }} style={{ width:'100%', padding:10, background:'none', border:'none', color:textSec, fontSize:13, cursor:'pointer' }}>キャンセル</button>
          </div>
        </div>
      )}

      {/* テーマモーダル */}
      {themeOpen && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.65)', backdropFilter:'blur(8px)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:50, padding:20 }} onClick={() => setThemeOpen(false)}>
          <div style={{ width:'100%', maxWidth:440, background:dark?'rgba(8,12,28,0.97)':'rgba(245,248,255,0.97)', border:`0.5px solid ${border}`, borderRadius:18, padding:'36px 32px' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontFamily:'"Space Mono",monospace', fontSize:15, fontWeight:700, color:dark?'rgba(200,220,255,0.85)':'rgba(20,40,140,0.90)', letterSpacing:'0.12em', marginBottom:10 }}>✦ Creative Wondering</div>
            <p style={{ fontSize:13, color:textSec, lineHeight:1.8, marginBottom:20 }}>テーマを入力すると、あなたの記憶から<br/>AIがひらめきを活性化する記憶の可視化を行います。</p>
            <textarea value={themeText} onChange={e => setThemeText(e.target.value)} placeholder="例：2050年の都市交通" style={{ width:'100%', background:inputBg, border:`0.5px solid ${inputBorder}`, borderRadius:10, padding:'12px 16px', color:textPrimary, fontSize:15, resize:'none', outline:'none', lineHeight:1.6, fontFamily:'inherit', marginBottom:16 }} rows={2} autoFocus/>
            <button onClick={handleGenerate} disabled={!themeText.trim()||generating} style={{ width:'100%', padding:'13px 20px', background:dark?'rgba(70,110,250,0.5)':'rgba(50,90,220,0.7)', border:'0.5px solid rgba(90,130,255,0.45)', borderRadius:11, color:'white', fontSize:14, fontWeight:500, cursor:'pointer', letterSpacing:'0.05em', marginBottom:10, opacity:(!themeText.trim()||generating)?0.35:1 }}>
            {generating ? '生成中...' : 'Creative Wondering →'}
            </button>
            <button onClick={() => setThemeOpen(false)} style={{ width:'100%', padding:10, background:'none', border:'none', color:textSec, fontSize:13, cursor:'pointer' }}>キャンセル</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── メッセージバブル ──────────────────────────────────────────
interface BubbleProps {
  item: Item; dark: boolean
  bubbleBg: string; bubbleBorder: string
  textPrimary: string; textSec: string
  typeColors: Record<string, string>
  onMemoSaved: (itemId: string, memo: string) => void
}

function MessageBubble({ item, dark, bubbleBg, bubbleBorder, textPrimary, textSec, typeColors, onMemoSaved }: BubbleProps) {
  const isImage   = item.type === 'image'
  const isVideo   = item.type === 'video'
  const isSnsPost = item.type === 'sns_post'
  const isUrl     = !isImage && !isVideo && !isSnsPost && item.type !== 'note'
  const color     = typeColors[item.platform] || typeColors[isImage ? 'image' : ''] || typeColors['']
  const label     = typeLabel(item.type, item.platform)

  const rawTitle     = item.type === 'note'
    ? (typeof item.content === 'string' ? item.content : '')
    : (item.displayTitle || item.url?.slice(0, 60) || '')
  const displayTitle = formatText(rawTitle)
  const ytId         = isVideo ? extractYouTubeId(item.url || '') : null

  const [memoOpen,  setMemoOpen]  = useState(false)
  const [memoInput, setMemoInput] = useState(item.summaryMemo || '')
  const [saving,    setSaving]    = useState(false)
  const { token } = useGasToken()

  async function saveMemo() {
    if (!token || saving) return
    setSaving(true)
    try {
      const { updateItem } = await import('@/lib/api')
      await updateItem(token, item.id, { summary_memo: memoInput })
      onMemoSaved(item.id, memoInput)
      setMemoOpen(false)
} catch(e) {
      console.error(e)
    } finally {
      setSaving(false)
    }

  const memoColor   = dark ? 'rgba(160,190,255,0.60)' : 'rgba(40,80,180,0.60)'
  const inputBorder = dark ? 'rgba(80,110,230,0.22)' : 'rgba(80,110,200,0.22)'
  const inputBg     = dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,80,0.04)'

  return (
    <div style={{ display:'flex', justifyContent:'flex-end' }}>
      <div style={{ maxWidth:'78%', background:bubbleBg, border:`0.5px solid ${bubbleBorder}`, borderRadius:'16px 16px 4px 16px', padding:'10px 14px' }}>
        <div style={{ fontSize:10, fontFamily:'"Space Mono",monospace', letterSpacing:'0.05em', marginBottom:5, border:`0.5px solid ${color}`, color, display:'inline-block', padding:'1px 7px', borderRadius:10 }}>{label}</div>

        {displayTitle && (
          <div style={{ fontSize:13, color:textPrimary, lineHeight:1.6, marginBottom:4, fontWeight:500, whiteSpace:'pre-line' }}>
            {displayTitle}
          </div>
        )}

        {/* 補足メモ表示 */}
        {item.summaryMemo && !memoOpen && (
          <div style={{ fontSize:11, color:memoColor, lineHeight:1.6, marginBottom:4, borderLeft:`2px solid ${inputBorder}`, paddingLeft:8 }}>
            {item.summaryMemo}
          </div>
        )}

{/* URL */}
{(isUrl || isSnsPost) && item.url && (
  
    href={item.url}
    target="_blank"
    rel="noopener noreferrer"
    style={{ fontSize:10, color:textSec, fontFamily:'monospace', wordBreak:'break-all', marginBottom:4, display:'block', textDecoration:'none', opacity:0.7 }}
  >
    {item.url.slice(0,60)}{item.url.length > 60 ? '…' : ''}
  </a>
)}

        {/* YouTube embed */}
        {isVideo && ytId && (
          <div style={{ marginTop:8, borderRadius:10, overflow:'hidden', position:'relative', paddingBottom:'56.25%', height:0 }}>
            <iframe
              src={`https://www.youtube.com/embed/${ytId}`}
              style={{ position:'absolute', top:0, left:0, width:'100%', height:'100%', border:'none' }}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        )}
        {isVideo && !ytId && item.thumbnailUrl && (
          <img src={item.thumbnailUrl} alt="" style={{ width:'100%', borderRadius:8, marginTop:8, maxHeight:160, objectFit:'cover' }}/>
        )}

        {/* 画像 */}
        {isImage && item.thumbnailUrl && (
          <img src={item.thumbnailUrl} alt="" style={{ width:'100%', borderRadius:10, marginTop:6, maxHeight:260, objectFit:'contain', background:dark?'rgba(0,0,0,0.2)':'rgba(0,0,50,0.05)' }}/>
        )}

        {/* URL・SNSサムネイル */}
        {(isUrl || isSnsPost) && item.thumbnailUrl && !item.thumbnailUrl.startsWith('data:') && (
          <img src={item.thumbnailUrl} alt="" style={{ width:'100%', borderRadius:8, marginTop:8, maxHeight:200, objectFit:'cover' }}/>
        )}

        {/* メモ入力エリア */}
        {memoOpen && (
          <div style={{ marginTop:8 }}>
            <textarea
              value={memoInput}
              onChange={e => setMemoInput(e.target.value)}
              placeholder="補足メモを入力..."
              autoFocus
              style={{ width:'100%', background:inputBg, border:`0.5px solid ${inputBorder}`, borderRadius:8, padding:'8px 10px', color:textPrimary, fontSize:12, resize:'none', outline:'none', lineHeight:1.6, fontFamily:'inherit' }}
              rows={3}
            />
            <div style={{ display:'flex', gap:6, marginTop:6 }}>
              <button
                onClick={saveMemo}
                disabled={saving}
                style={{ flex:1, padding:'6px', background:dark?'rgba(70,110,240,0.35)':'rgba(50,90,220,0.18)', border:`0.5px solid ${inputBorder}`, borderRadius:7, fontSize:11, color:dark?'rgba(190,215,255,0.85)':'rgba(40,80,200,0.85)', cursor:'pointer' }}
              >
                {saving ? '保存中...' : '保存'}
              </button>
              <button
                onClick={() => { setMemoOpen(false); setMemoInput(item.summaryMemo || '') }}
                style={{ padding:'6px 10px', background:'none', border:`0.5px solid ${inputBorder}`, borderRadius:7, fontSize:11, color:textSec, cursor:'pointer' }}
              >
                キャンセル
              </button>
            </div>
          </div>
        )}

        {/* 下部：時刻 + メモボタン */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:6 }}>
          <button
            onClick={() => setMemoOpen(o => !o)}
            style={{ background:'none', border:'none', fontSize:10, color:textSec, cursor:'pointer', padding:0, opacity:0.7 }}
          >
            {memoOpen ? '✕ 閉じる' : item.summaryMemo ? '✏ メモを編集' : '＋ メモを追加'}
          </button>
          <div style={{ fontSize:10, color:textSec, fontFamily:'monospace' }}>
            {item.createdAt ? new Date(item.createdAt).toLocaleTimeString('ja-JP',{hour:'2-digit',minute:'2-digit'}) : ''}
          </div>
        </div>
      </div>
    </div>
  )
}

function Loader({ dark }: { dark: boolean }) {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background:dark?'#020810':'#ffffff' }}>
      <span style={{ color:'rgba(140,165,230,0.4)', fontFamily:'monospace', fontSize:11, letterSpacing:'0.16em' }}>LOADING...</span>
    </div>
  )
}
