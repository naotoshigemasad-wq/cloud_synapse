'use client'

import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { createItem, getItems, updateItem, type Item, type ItemType } from '@/lib/api'
import { useGasToken } from '@/hooks/useGasToken'

function useDarkMode() {
  const [dark, setDark] = useState(false)
  useEffect(() => { const s = localStorage.getItem('cs_dark'); if (s === '1') setDark(true) }, [])
  function toggle() { setDark(d => { localStorage.setItem('cs_dark', d ? '0' : '1'); return !d }) }
  return { dark, toggle }
}

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

function formatText(text: string): string {
  if (!text) return ''
  const chars = Array.from(text)
  if (chars.length <= 7) return text
  const half = Math.ceil(chars.length / 2)
  const breakChars = ['　', ' ', '。', '、', '・', '！', '？', '…']
  let breakPos = half
  for (let i = half; i >= Math.max(0, half - 4); i--) {
    if (breakChars.includes(chars[i])) { breakPos = i + 1; break }
  }
  return chars.slice(0, breakPos).join('') + '\n' + chars.slice(breakPos).join('')
}

function extractYouTubeId(url: string): string | null {
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/watch\?v=|youtube\.com\/embed\/)([^&?/\s]{11})/)
  return m ? m[1] : null
}

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
  youtube:'rgba(245,166,35,0.8)', instagram:'rgba(244,114,182,0.8)',
  twitter:'rgba(77,184,255,0.8)', pinterest:'rgba(230,50,50,0.8)',
  notion:'rgba(167,139,250,0.8)', web:'rgba(100,170,255,0.7)',
  image:'rgba(110,231,183,0.8)', '':'rgba(110,231,183,0.8)',
}
const typeColorLight: Record<string, string> = {
  youtube:'rgba(180,110,0,0.85)', instagram:'rgba(180,60,120,0.85)',
  twitter:'rgba(0,120,200,0.85)', pinterest:'rgba(180,0,20,0.85)',
  notion:'rgba(100,60,200,0.85)', web:'rgba(30,100,200,0.85)',
  image:'rgba(0,140,100,0.85)', '':'rgba(0,140,100,0.85)',
}

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

type PlatformKey = 'notion'|'youtube'|'x'|'instagram'|'pinterest'|'google'
interface Platform { key:PlatformKey; label:string; icon:string; color:string; connected:boolean; desc:string }
const PLATFORMS: Platform[] = [
  { key:'notion',    label:'Notion',    icon:'◻', color:'rgba(167,139,250,0.75)', connected:false, desc:'ページ・データベースをインポート' },
  { key:'youtube',   label:'YouTube',   icon:'▶', color:'rgba(245,166,35,0.75)',  connected:false, desc:'高評価・保存済み動画を自動取り込み' },
  { key:'x',         label:'X',         icon:'✕', color:'rgba(77,184,255,0.75)',  connected:false, desc:'ブックマークといいねをインポート' },
  { key:'instagram', label:'Instagram', icon:'◉', color:'rgba(244,114,182,0.75)', connected:false, desc:'保存済み投稿をインポート' },
  { key:'pinterest', label:'Pinterest', icon:'⊕', color:'rgba(230,50,50,0.75)',   connected:false, desc:'ボードのピンをインポート' },
  { key:'google',    label:'Google',    icon:'G',  color:'rgba(100,170,255,0.75)', connected:false, desc:'ドキュメント・検索履歴をインポート' },
]

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

export default function FeedPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const { token, ready } = useGasToken()
  const { dark, toggle: toggleDark } = useDarkMode()
  const isMobile = useIsMobile()

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
  const [platforms, setPlatforms] = useState<Platform[]>(
PLATFORMS.map(p => p.key === 'youtube' || p.key === 'google' ? { ...p, connected: true } : p)
)
  const [notionModal,  setNotionModal]  = useState(false)
  const [notionToken,  setNotionToken]  = useState('')
  const [importing,    setImporting]    = useState(false)
  const [importResult, setImportResult] = useState<string|null>(null)
  const [dateFrom,     setDateFrom]     = useState('')
  const [dateTo,       setDateTo]       = useState('')
  const [filterOpen,   setFilterOpen]   = useState(false)

  const listRef  = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const fileRef  = useRef<HTMLInputElement>(null)

  useEffect(() => { if (status === 'unauthenticated') router.replace('/login') }, [status, router])
  useEffect(() => {
    if (!ready) return
    getItems(token, {}).then(r => setItems(r.items || [])).catch(console.error).finally(() => setLoadingItems(false))
  }, [ready, token])
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
  }, [items])

  async function handleImageFile(file: File) {
    if (!file.type.startsWith('image/') || !token) return
    setSending(true)
    try {
      const base64 = await resizeImageToBase64(file)
      setImagePreview(base64)
      const temp: Item = { id:`temp_${Date.now()}`, type:'image', displayTitle:'解析中...', summaryMemo:'', content:'', url:'', thumbnailUrl:base64, platform:'', source:'manual', embeddingAt:'', createdAt:new Date().toISOString(), updatedAt:'', tags:[] }
      setItems(prev => [...prev, temp])
      setImagePreview(null)
      const created = await createItem(token, { type:'image', content:file.name||'画像', image_base64:base64 } as any)
      setItems(prev => prev.map(i => i.id === temp.id ? { ...temp, ...created, thumbnailUrl:base64 } : i))
    } catch(e) { console.error(e) }
    finally { setSending(false); if (fileRef.current) fileRef.current.value = '' }
  }

  async function handleSend() {
    const text = input.trim()
    if (!text || sending || !token) return
    setSending(true)
    const { type, platform } = detectType(text)
    const temp: Item = { id:`temp_${Date.now()}`, type, displayTitle:'保存中...', summaryMemo:'', content:type==='note'?text:'', url:type!=='note'?text:'', thumbnailUrl:'', platform, source:'manual', embeddingAt:'', createdAt:new Date().toISOString(), updatedAt:'', tags:[] }
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
  function handleDrop(e: React.DragEvent) { e.preventDefault(); setIsDragging(false); const file = e.dataTransfer.files[0]; if (file) handleImageFile(file) }

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
  if (key === 'notion') { setNotionModal(true); setSheetOpen(false); return }
  setPlatforms(prev => prev.map(p => p.key === key ? { ...p, connected: true } : p))
}

async function handleImport(key: PlatformKey) {
  if (key === 'notion') { setNotionModal(true); setSheetOpen(false); return }

  const pf = platforms.find(p => p.key === key)
  if (!pf) return

  // YouTube・Google は直接インポート実行
if (key === 'youtube' || key === 'google') {
  setSheetOpen(false)
  const platformKey = key === 'google' ? 'google_docs' : 'youtube'
  const googleAccessToken = (session as any)?.googleAccessToken || ''
  console.log('token:', googleAccessToken ? googleAccessToken.slice(0,20) : 'なし')
  if (!googleAccessToken) {
    alert('再ログインしてください。')
    return
  }
  const notif: Item = {
    id:`import_${Date.now()}`, type:'note',
    displayTitle:`${pf.label}からインポート中...`,
    summaryMemo:'', content:'', url:'', thumbnailUrl:'',
    platform:key, source:'import', embeddingAt:'',
    createdAt:new Date().toISOString(), updatedAt:'', tags:[],
  }
  setItems(prev => [...prev, notif])
  try {
    const GAS_URL = process.env.NEXT_PUBLIC_GAS_API_URL!
    const res = await fetch('/api/import/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        gasToken: token,
        platformKey,
        googleAccessToken,
      }),
    })
    const res = await fetch(`${GAS_URL}?${params.toString()}`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({
        token,
        path: '/integrations/token',
        platform_key: platformKey,
        google_access_token: googleAccessToken,
      }),
    })
    const data = await res.json()
    console.log('import result:', data)
    setItems(prev => prev.filter(i => i.id !== notif.id))
    if (data.error) throw new Error(data.error)
    const count = data.imported || 0
    const result: Item = {
      id:`result_${Date.now()}`, type:'note',
      displayTitle:`✓ ${pf.label} ${count}件インポート完了`,
      summaryMemo:'', content:'', url:'', thumbnailUrl:'',
      platform:key, source:'import', embeddingAt:'',
      createdAt:new Date().toISOString(), updatedAt:'', tags:[],
    }
    setItems(prev => [...prev, result])
    getItems(token, {}).then(r => setItems(r.items || [])).catch(console.error)
  } catch(e: any) {
    setItems(prev => prev.filter(i => i.id !== notif.id))
    alert('インポートエラー: ' + e.message)
  }
  return
}

  const notif: Item = {
    id:`import_${Date.now()}`, type:'web_url',
    displayTitle:`${pf.label}からインポート中...`,
    summaryMemo:'', content:'', url:'', thumbnailUrl:'',
    platform:key, source:'import', embeddingAt:'',
    createdAt:new Date().toISOString(), updatedAt:'', tags:[],
  }
  setItems(prev => [...prev, notif])
  setSheetOpen(false); setSelectedPf(null)
}

async function handleNotionConnect() {
  if (!notionToken.trim() || !token) return
  setImporting(true); setImportResult(null)
  try {
    const GAS_URL = process.env.NEXT_PUBLIC_GAS_API_URL!
    const controller = new AbortController()
    const timeoutId  = setTimeout(() => controller.abort(), 300000)  // 5分

    const res = await fetch(`${GAS_URL}?path=/integrations/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ token, path:'/integrations/token', platform_key:'notion', access_token:notionToken.trim(), refresh_token:'', expires_at:'' }),
      signal: controller.signal,
    })
    clearTimeout(timeoutId)
    const data = await res.json()
    if (data.error) throw new Error(data.error)
    setImportResult(`✓ ${data.imported || 0}件のページをインポートしました`)
    setPlatforms(prev => prev.map(p => p.key === 'notion' ? { ...p, connected: true } : p))
    getItems(token, {}).then(r => setItems(r.items || [])).catch(console.error)
  } catch(e: any) {
    if (e.name === 'AbortError') {
      setImportResult('✗ タイムアウト：件数が多い場合はGASで直接実行してください')
    } else {
      setImportResult('✗ エラー: ' + (e.message || 'インポートに失敗しました'))
    }
  } finally { setImporting(false) }
}

  const { type, platform } = detectType(input)
  const typeColors    = dark ? typeColorDark : typeColorLight
  const detectedColor = typeColors[platform] || typeColors['']
  const showDetect    = input.trim().length > 0
  const filteredItems = items.filter(item => {
  if (!item.createdAt) return true
  const d = new Date(item.createdAt)
  if (dateFrom && d < new Date(dateFrom)) return false
  if (dateTo   && d > new Date(dateTo + 'T23:59:59')) return false
  return true
  })
  const hasFilter = dateFrom || dateTo
  if (status === 'loading') return <Loader dark={dark}/>
  const currentPf = platforms.find(p => p.key === selectedPf)

  // テーマカラー
  const bg           = dark ? '#020810' : '#ffffff'
  const bgSub        = dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,50,0.04)'
  const border       = dark ? 'rgba(60,90,200,0.12)' : 'rgba(0,0,100,0.10)'
  const textPrimary  = dark ? 'rgba(200,220,255,0.88)' : 'rgba(10,20,60,0.90)'
  const textSec      = dark ? 'rgba(150,175,240,0.55)' : 'rgba(30,50,130,0.55)'
  const bubbleBg     = dark ? 'rgba(40,60,160,0.22)' : 'rgba(220,230,255,0.55)'
  const bubbleBorder = dark ? 'rgba(70,110,230,0.2)' : 'rgba(80,120,220,0.25)'
  const inputBg      = dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,80,0.04)'
  const inputBorder  = dark ? 'rgba(80,110,230,0.22)' : 'rgba(80,110,200,0.22)'
  const logoColor    = dark ? 'rgba(200,220,255,0.75)' : 'rgba(20,40,120,0.85)'

  // モバイル用の値
  const hp = isMobile ? '10px 12px' : '14px 20px'  // header padding
  const ip = isMobile ? '8px 10px 14px' : '10px 14px 16px'  // input area padding

  return (
    <div
      style={{ display:'flex', flexDirection:'column', height:'100vh', background:bg, overflow:'hidden', position:'relative', transition:'background 0.2s' }}
      onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
    >
      {isDragging && (
        <div style={{ position:'absolute', inset:0, background:dark?'rgba(10,20,50,0.85)':'rgba(200,220,255,0.85)', zIndex:50, display:'flex', alignItems:'center', justifyContent:'center', backdropFilter:'blur(4px)' }}>
          <div style={{ fontSize:14, color:dark?'rgba(160,200,255,0.9)':'rgba(20,60,180,0.9)', fontFamily:'"Space Mono",monospace' }}>🖼 ドロップして追加</div>
        </div>
      )}

      {/* ヘッダー */}
      <header style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:hp, borderBottom:`0.5px solid ${border}`, flexShrink:0 }}>
        <div style={{ fontFamily:'"Space Mono",monospace', fontSize:isMobile?10:13, fontWeight:700, color:logoColor, letterSpacing:isMobile?'0.08em':'0.16em' }}>
          {isMobile ? 'C·SYNAPSE' : 'CLOUD SYNAPSE'}
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:isMobile?5:8 }}>
          <button
  onClick={() => setFilterOpen(f => !f)}
  style={{ width:isMobile?28:32, height:isMobile?28:32, background:hasFilter?dark?'rgba(70,110,240,0.3)':'rgba(50,90,220,0.15)':'none', border:`0.5px solid ${hasFilter?'rgba(90,130,255,0.4)':border}`, borderRadius:8, cursor:'pointer', fontSize:12, color:hasFilter?dark?'rgba(160,200,255,0.9)':'rgba(40,80,200,0.9)':textSec, display:'flex', alignItems:'center', justifyContent:'center' }}
  title="日付で絞り込む"
>
  🗓
</button>
          <button onClick={toggleDark} style={{ width:isMobile?28:32, height:isMobile?28:32, background:'none', border:`0.5px solid ${border}`, borderRadius:8, cursor:'pointer', fontSize:isMobile?13:15, color:textSec, display:'flex', alignItems:'center', justifyContent:'center' }}>
            {dark ? '☀' : '🌙'}
          </button>
          <button onClick={() => setThemeOpen(true)} style={{ padding:isMobile?'5px 10px':'7px 16px', background:dark?'rgba(80,100,240,0.14)':'rgba(60,80,220,0.10)', border:`0.5px solid ${dark?'rgba(90,120,255,0.28)':'rgba(60,100,220,0.28)'}`, borderRadius:20, fontSize:isMobile?10:12, color:dark?'rgba(180,200,255,0.75)':'rgba(40,80,200,0.80)', cursor:'pointer', fontFamily:'"Space Mono",monospace', letterSpacing:'0.02em', whiteSpace:'nowrap' }}>
            {isMobile ? '✦ CW' : '✦ Creative Wondering'}
          </button>
          <button onClick={() => signOut({ callbackUrl:'/login' })} style={{ width:isMobile?28:32, height:isMobile?28:32, background:'none', border:`0.5px solid ${border}`, borderRadius:8, color:textSec, cursor:'pointer', fontSize:14, display:'flex', alignItems:'center', justifyContent:'center' }}>╮</button>
        </div>
      </header>
      {filterOpen && (
  <div style={{ padding:isMobile?'10px 12px':'10px 16px', borderBottom:`0.5px solid ${border}`, background:dark?'rgba(10,15,35,0.8)':'rgba(235,240,255,0.8)', flexShrink:0, backdropFilter:'blur(8px)' }}>
    <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
      <span style={{ fontSize:11, color:textSec, fontFamily:'"Space Mono",monospace', letterSpacing:'0.06em', flexShrink:0 }}>📅 期間</span>
      <input
        type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
        style={{ background:inputBg, border:`0.5px solid ${inputBorder}`, borderRadius:8, padding:'5px 10px', color:textPrimary, fontSize:12, outline:'none', cursor:'pointer' }}
      />
      <span style={{ fontSize:11, color:textSec }}>〜</span>
      <input
        type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
        style={{ background:inputBg, border:`0.5px solid ${inputBorder}`, borderRadius:8, padding:'5px 10px', color:textPrimary, fontSize:12, outline:'none', cursor:'pointer' }}
      />
      {hasFilter && (
        <button onClick={() => { setDateFrom(''); setDateTo('') }} style={{ padding:'5px 10px', background:'none', border:`0.5px solid ${inputBorder}`, borderRadius:8, fontSize:11, color:textSec, cursor:'pointer' }}>
          ✕ リセット
        </button>
      )}
      <span style={{ fontSize:11, color:textSec, marginLeft:'auto' }}>
        {hasFilter ? `${filteredItems.length} / ${items.length}件` : `${items.length}件`}
      </span>
    </div>
  </div>
)}
      {/* メッセージリスト */}
      <div ref={listRef} style={{ flex:1, overflowY:'auto', padding:isMobile?'14px 10px 6px':'20px 16px 8px', display:'flex', flexDirection:'column', gap:8 }}>
        {loadingItems && <div style={{ textAlign:'center', color:textSec, fontSize:12, fontFamily:'monospace', padding:40 }}>記憶を読み込んでいます...</div>}
        {!loadingItems && filteredItems.length === 0 && (
          <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', textAlign:'center', padding:40 }}>
          <div style={{ fontSize:28, marginBottom:10 }}>{hasFilter ? '🔍' : '🌱'}</div>
          <div style={{ fontSize:13, color:textSec, lineHeight:1.8 }}>
            {hasFilter ? '該当する記憶がありません。\n日付の範囲を変えてみてください。' : '最初の記憶を追加してみましょう。\nメモ・URL・画像など何でも保存できます。'}
          </div>
        </div>
        )}
        {filteredItems.map(item => (
          <MessageBubble
            key={item.id} item={item} dark={dark} token={token} isMobile={isMobile}
            bubbleBg={bubbleBg} bubbleBorder={bubbleBorder}
            textPrimary={textPrimary} textSec={textSec} typeColors={typeColors}
            onMemoSaved={(itemId, memo) => setItems(prev => prev.map(i => i.id === itemId ? { ...i, summaryMemo: memo } : i))}
          />
        ))}
      </div>

      {/* 入力エリア */}
      <div style={{ padding:ip, borderTop:`0.5px solid ${border}`, flexShrink:0, background:dark?'rgba(4,8,20,0.9)':'rgba(245,247,255,0.95)', paddingBottom:`calc(${isMobile?'14px':'16px'} + env(safe-area-inset-bottom))` }}>
        {imagePreview && (
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8, padding:'7px 10px', background:bubbleBg, borderRadius:10, border:`0.5px solid ${bubbleBorder}` }}>
            <img src={imagePreview} alt="preview" style={{ width:40, height:40, borderRadius:6, objectFit:'cover' }}/>
            <div style={{ fontSize:12, color:textSec }}>解析中...</div>
          </div>
        )}
        {showDetect && !imagePreview && (
          <div style={{ fontSize:10, fontFamily:'"Space Mono",monospace', letterSpacing:'0.05em', border:`0.5px solid ${detectedColor}`, color:detectedColor, display:'inline-block', padding:'2px 7px', borderRadius:10, marginBottom:5 }}>
            {typeLabel(type, platform)}
          </div>
        )}
        <div style={{ display:'flex', gap:isMobile?6:8, alignItems:'flex-end' }}>
          <button onClick={() => { setSheetOpen(true); setSelectedPf(null) }} style={{ width:isMobile?36:40, height:isMobile?36:40, borderRadius:'50%', background:bgSub, border:`0.5px solid ${inputBorder}`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, cursor:'pointer', padding:0 }}>
            <GlowGridIcon size={isMobile?16:18}/>
          </button>
          <button onClick={() => fileRef.current?.click()} style={{ width:isMobile?36:40, height:isMobile?36:40, borderRadius:'50%', background:bgSub, border:`0.5px solid ${inputBorder}`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, cursor:'pointer', padding:0 }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={dark?'rgba(160,190,255,0.65)':'rgba(60,100,200,0.65)'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
              <path d="M21 15l-5-5L5 21"/>
            </svg>
          </button>
          <input ref={fileRef} type="file" accept="image/*" style={{ display:'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) handleImageFile(f) }}/>
          <textarea
            ref={inputRef} value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey} onPaste={handlePaste}
            placeholder={isMobile ? 'メモ・URL・画像を追加...' : 'メモ、URL、画像を貼り付け（Ctrl+V）...'}
            style={{ flex:1, background:inputBg, border:`0.5px solid ${inputBorder}`, borderRadius:12, padding:isMobile?'9px 12px':'10px 14px', color:textPrimary, fontSize:16, resize:'none', outline:'none', lineHeight:1.6, maxHeight:100, overflowY:'auto', fontFamily:'inherit' }}
            rows={1}
          />
          <button onClick={handleSend} disabled={!input.trim()||sending} style={{ width:isMobile?36:40, height:isMobile?36:40, borderRadius:'50%', background:dark?'rgba(70,110,250,0.5)':'rgba(50,90,220,0.7)', border:'none', color:'white', fontSize:16, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, opacity:(!input.trim()||sending)?0.3:1 }}>
            {sending ? '…' : '↑'}
          </button>
        </div>
      </div>

      {/* ボトムシート */}
      {sheetOpen && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', backdropFilter:'blur(6px)', zIndex:40, display:'flex', alignItems:'flex-end' }} onClick={() => { setSheetOpen(false); setSelectedPf(null) }}>
          <div style={{ width:'100%', background:dark?'rgba(8,12,28,0.98)':'rgba(245,248,255,0.98)', border:`0.5px solid ${border}`, borderRadius:'18px 18px 0 0', padding:`16px 16px calc(28px + env(safe-area-inset-bottom))` }} onClick={e => e.stopPropagation()}>
            <div style={{ width:36, height:3, background:'rgba(100,130,220,0.22)', borderRadius:2, margin:'0 auto 14px' }}/>
            <div style={{ fontSize:11, fontFamily:'"Space Mono",monospace', color:textSec, letterSpacing:'0.10em', marginBottom:12 }}>外部データを取り込む</div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8, marginBottom:12 }}>
              {platforms.map(pf => (
                <button key={pf.key} onClick={() => setSelectedPf(pf.key)} style={{ background:selectedPf===pf.key?'rgba(40,60,140,0.28)':bgSub, border:`0.5px solid ${selectedPf===pf.key?pf.color:'rgba(80,100,180,0.15)'}`, borderRadius:12, padding:isMobile?'12px 6px':'14px 8px', textAlign:'center', cursor:'pointer' }}>
                  <div style={{ fontSize:isMobile?18:20, marginBottom:4, lineHeight:1 }}>{pf.icon}</div>
                  <div style={{ fontSize:isMobile?10:11, fontWeight:500, color:textPrimary }}>{pf.label}</div>
                  <div style={{ fontSize:9, marginTop:2, color:pf.connected?'rgba(110,231,183,0.6)':textSec }}>{pf.connected?'連携済み':'未連携'}</div>
                </button>
              ))}
            </div>
            {currentPf && (
              <div style={{ background:bgSub, border:`0.5px solid ${border}`, borderRadius:12, padding:'12px 14px', marginBottom:10 }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                  <span style={{ fontSize:12, fontWeight:500, color:currentPf.color }}>{currentPf.label}</span>
                  <span style={{ fontSize:9, padding:'2px 8px', borderRadius:8, background:currentPf.connected?'rgba(110,231,183,0.1)':'rgba(100,120,200,0.1)', color:currentPf.connected?'rgba(110,231,183,0.65)':'rgba(140,165,220,0.4)' }}>{currentPf.connected?'連携済み':'未連携'}</span>
                </div>
                <div style={{ fontSize:12, color:textSec, marginBottom:10, lineHeight:1.6 }}>{currentPf.desc}</div>
                {currentPf.connected ? (
                  <div style={{ display:'flex', gap:8 }}>
                    <button onClick={() => handleImport(currentPf.key)} style={{ flex:1, padding:'9px', background:'rgba(70,110,240,0.22)', border:'0.5px solid rgba(90,130,255,0.32)', borderRadius:9, fontSize:12, color:dark?'rgba(190,215,255,0.85)':'rgba(40,80,200,0.9)', cursor:'pointer' }}>全件インポート</button>
                    <button style={{ flex:1, padding:'9px', background:bgSub, border:`0.5px solid ${border}`, borderRadius:9, fontSize:12, color:textSec, cursor:'pointer' }}>件数を選ぶ</button>
                  </div>
                ) : (
                  <button onClick={() => handleConnect(currentPf.key)} style={{ width:'100%', padding:'9px', background:'rgba(70,110,240,0.22)', border:'0.5px solid rgba(90,130,255,0.32)', borderRadius:9, fontSize:12, color:dark?'rgba(190,215,255,0.85)':'rgba(40,80,200,0.9)', cursor:'pointer' }}>{currentPf.label} と連携する →</button>
                )}
              </div>
            )}
            <button onClick={() => { setSheetOpen(false); setSelectedPf(null) }} style={{ width:'100%', padding:10, background:'none', border:'none', color:textSec, fontSize:13, cursor:'pointer' }}>キャンセル</button>
          </div>
        </div>
      )}

      {/* Creative Wondering モーダル */}
      {themeOpen && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.65)', backdropFilter:'blur(8px)', display:'flex', alignItems:isMobile?'flex-end':'center', justifyContent:'center', zIndex:50, padding:isMobile?0:20 }} onClick={() => setThemeOpen(false)}>
          <div style={{ width:'100%', maxWidth:440, background:dark?'rgba(8,12,28,0.97)':'rgba(245,248,255,0.97)', border:`0.5px solid ${border}`, borderRadius:isMobile?'18px 18px 0 0':18, padding:isMobile?'28px 20px calc(28px + env(safe-area-inset-bottom))':'36px 32px' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontFamily:'"Space Mono",monospace', fontSize:isMobile?13:15, fontWeight:700, color:dark?'rgba(200,220,255,0.85)':'rgba(20,40,140,0.90)', letterSpacing:'0.10em', marginBottom:8 }}>✦ Creative Wondering</div>
            <p style={{ fontSize:12, color:textSec, lineHeight:1.8, marginBottom:16 }}>テーマを入力すると、あなたの記憶から<br/>ひらめきを活性化する記憶の可視化を行います。</p>
            <textarea value={themeText} onChange={e => setThemeText(e.target.value)} placeholder="例：2050年の都市交通" style={{ width:'100%', background:inputBg, border:`0.5px solid ${inputBorder}`, borderRadius:10, padding:'12px 14px', color:textPrimary, fontSize:16, resize:'none', outline:'none', lineHeight:1.6, fontFamily:'inherit', marginBottom:14 }} rows={2} autoFocus/>
            <button onClick={handleGenerate} disabled={!themeText.trim()||generating} style={{ width:'100%', padding:'12px 20px', background:dark?'rgba(70,110,250,0.5)':'rgba(50,90,220,0.7)', border:'0.5px solid rgba(90,130,255,0.45)', borderRadius:11, color:'white', fontSize:14, fontWeight:500, cursor:'pointer', marginBottom:10, opacity:(!themeText.trim()||generating)?0.35:1 }}>
              {generating ? '生成中...' : 'Creative Wondering →'}
            </button>
            <button onClick={() => setThemeOpen(false)} style={{ width:'100%', padding:10, background:'none', border:'none', color:textSec, fontSize:13, cursor:'pointer' }}>キャンセル</button>
          </div>
        </div>
      )}

      {/* Notion モーダル */}
      {notionModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.65)', backdropFilter:'blur(8px)', display:'flex', alignItems:isMobile?'flex-end':'center', justifyContent:'center', zIndex:50, padding:isMobile?0:20 }} onClick={() => { setNotionModal(false); setImportResult(null) }}>
          <div style={{ width:'100%', maxWidth:440, background:dark?'rgba(8,12,28,0.97)':'rgba(245,248,255,0.97)', border:`0.5px solid ${border}`, borderRadius:isMobile?'18px 18px 0 0':18, padding:isMobile?'28px 20px calc(28px + env(safe-area-inset-bottom))':'32px 28px' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontFamily:'"Space Mono",monospace', fontSize:13, fontWeight:700, color:dark?'rgba(200,220,255,0.85)':'rgba(20,40,140,0.90)', letterSpacing:'0.10em', marginBottom:8 }}>◻ Notion 連携</div>
            <p style={{ fontSize:12, color:textSec, lineHeight:1.8, marginBottom:14 }}>
              Notion Integration Token を入力してください。<br/>
              <a href="https://www.notion.so/my-integrations" target="_blank" rel="noopener noreferrer" style={{ color:dark?'rgba(130,170,255,0.7)':'rgba(40,90,200,0.7)', fontSize:11 }}>notion.so/my-integrations</a> で作成できます。
            </p>
            <input
              type="password" value={notionToken} onChange={e => setNotionToken(e.target.value)}
              placeholder="secret_xxxxxxxxxxxx"
              style={{ width:'100%', background:inputBg, border:`0.5px solid ${inputBorder}`, borderRadius:10, padding:'12px 14px', color:textPrimary, fontSize:16, outline:'none', fontFamily:'monospace', marginBottom:8, boxSizing:'border-box' as any }}
              autoFocus
            />
            <p style={{ fontSize:11, color:textSec, lineHeight:1.7, marginBottom:14 }}>
              ※ インポートしたいページでNotionを開き、<br/>
              右上「…」→「接続先」→ インテグレーションを選択。
            </p>
            {importResult && (
              <div style={{ fontSize:12, color:importResult.startsWith('✓')?'rgba(110,231,183,0.8)':'rgba(255,120,120,0.8)', marginBottom:12, padding:'8px 12px', background:importResult.startsWith('✓')?'rgba(110,231,183,0.08)':'rgba(255,100,100,0.08)', borderRadius:8 }}>
                {importResult}
              </div>
            )}
            <button onClick={handleNotionConnect} disabled={!notionToken.trim()||importing} style={{ width:'100%', padding:'12px', background:dark?'rgba(70,110,250,0.5)':'rgba(50,90,220,0.7)', border:'0.5px solid rgba(90,130,255,0.45)', borderRadius:11, color:'white', fontSize:13, cursor:'pointer', marginBottom:10, opacity:(!notionToken.trim()||importing)?0.4:1 }}>
              {importing ? 'インポート中...' : 'インポート開始'}
            </button>
            <button onClick={() => { setNotionModal(false); setImportResult(null) }} style={{ width:'100%', padding:10, background:'none', border:'none', color:textSec, fontSize:12, cursor:'pointer' }}>キャンセル</button>
          </div>
        </div>
      )}

      <style>{`
        * { -webkit-tap-highlight-color: transparent; box-sizing: border-box; }
        @keyframes loading { from { transform: translateX(-100%) } to { transform: translateX(200%) } }
      `}</style>
    </div>
  )
}

interface BubbleProps {
  item: Item; dark: boolean; token: string; isMobile: boolean
  bubbleBg: string; bubbleBorder: string
  textPrimary: string; textSec: string
  typeColors: Record<string, string>
  onMemoSaved: (itemId: string, memo: string) => void
}

function MessageBubble({ item, dark, token, isMobile, bubbleBg, bubbleBorder, textPrimary, textSec, typeColors, onMemoSaved }: BubbleProps) {
  const isImage   = item.type === 'image'
  const isVideo   = item.type === 'video'
  const isSnsPost = item.type === 'sns_post'
  const isUrl     = !isImage && !isVideo && !isSnsPost && item.type !== 'note'
  const color     = typeColors[item.platform] || typeColors[isImage ? 'image' : ''] || typeColors['']
  const label     = typeLabel(item.type, item.platform)
  const rawTitle  = item.type === 'note'
    ? (typeof item.content === 'string' ? item.content : '')
    : (item.displayTitle || item.url?.slice(0, 60) || '')
  const displayTitle = formatText(rawTitle)
  const ytId = isVideo ? extractYouTubeId(item.url || '') : null

  const [memoOpen,  setMemoOpen]  = useState(false)
  const [memoInput, setMemoInput] = useState(item.summaryMemo || '')
  const [saving,    setSaving]    = useState(false)

  async function saveMemo() {
    if (!token || saving) return
    setSaving(true)
    try {
      await updateItem(token, item.id, { summary_memo: memoInput })
      onMemoSaved(item.id, memoInput)
      setMemoOpen(false)
    } catch(e) { console.error(e) }
    finally { setSaving(false) }
  }

  const memoColor   = dark ? 'rgba(160,190,255,0.60)' : 'rgba(40,80,180,0.60)'
  const inputBorder = dark ? 'rgba(80,110,230,0.22)' : 'rgba(80,110,200,0.22)'
  const inputBg     = dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,80,0.04)'

  return (
    <div style={{ display:'flex', justifyContent:'flex-end' }}>
      <div style={{ maxWidth:isMobile?'92%':'78%', background:bubbleBg, border:`0.5px solid ${bubbleBorder}`, borderRadius:'14px 14px 3px 14px', padding:isMobile?'8px 12px':'10px 14px' }}>
        <div style={{ fontSize:10, fontFamily:'"Space Mono",monospace', letterSpacing:'0.05em', marginBottom:4, border:`0.5px solid ${color}`, color, display:'inline-block', padding:'1px 7px', borderRadius:10 }}>{label}</div>

        {displayTitle && (
          <div style={{ fontSize:isMobile?12:13, color:textPrimary, lineHeight:1.6, marginBottom:3, fontWeight:500, whiteSpace:'pre-line' }}>{displayTitle}</div>
        )}

        {item.summaryMemo && !memoOpen && (
          <div style={{ fontSize:11, color:memoColor, lineHeight:1.6, marginBottom:3, borderLeft:`2px solid ${inputBorder}`, paddingLeft:8 }}>{item.summaryMemo}</div>
        )}

        {(isUrl || isSnsPost) && item.url && (
          <a href={item.url} target="_blank" rel="noopener noreferrer" style={{ fontSize:10, color:textSec, fontFamily:'monospace', wordBreak:'break-all', marginBottom:3, display:'block', textDecoration:'none', opacity:0.7 }}>
            {item.url.slice(0,50)}{item.url.length > 50 ? '…' : ''}
          </a>
        )}

        {isVideo && ytId && (
          <div style={{ marginTop:8, borderRadius:10, overflow:'hidden', position:'relative', paddingBottom:'56.25%', height:0 }}>
            <iframe src={`https://www.youtube.com/embed/${ytId}`} style={{ position:'absolute', top:0, left:0, width:'100%', height:'100%', border:'none' }} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen/>
          </div>
        )}
        {isVideo && !ytId && item.thumbnailUrl && (
          <img src={item.thumbnailUrl} alt="" style={{ width:'100%', borderRadius:8, marginTop:6, maxHeight:160, objectFit:'cover' }}/>
        )}
        {isImage && item.thumbnailUrl && (
          <img src={item.thumbnailUrl} alt="" style={{ width:'100%', borderRadius:10, marginTop:5, maxHeight:isMobile?200:260, objectFit:'contain', background:dark?'rgba(0,0,0,0.2)':'rgba(0,0,50,0.05)' }}/>
        )}
        {(isUrl || isSnsPost) && item.thumbnailUrl && !item.thumbnailUrl.startsWith('data:') && (
          <img src={item.thumbnailUrl} alt="" style={{ width:'100%', borderRadius:8, marginTop:6, maxHeight:isMobile?160:200, objectFit:'cover' }}/>
        )}

        {memoOpen && (
          <div style={{ marginTop:8 }}>
            <textarea value={memoInput} onChange={e => setMemoInput(e.target.value)} placeholder="補足メモを入力..." autoFocus style={{ width:'100%', background:inputBg, border:`0.5px solid ${inputBorder}`, borderRadius:8, padding:'8px 10px', color:textPrimary, fontSize:isMobile?16:12, resize:'none', outline:'none', lineHeight:1.6, fontFamily:'inherit' }} rows={3}/>
            <div style={{ display:'flex', gap:6, marginTop:6 }}>
              <button onClick={saveMemo} disabled={saving} style={{ flex:1, padding:'7px', background:dark?'rgba(70,110,240,0.35)':'rgba(50,90,220,0.18)', border:`0.5px solid ${inputBorder}`, borderRadius:7, fontSize:12, color:dark?'rgba(190,215,255,0.85)':'rgba(40,80,200,0.85)', cursor:'pointer' }}>
                {saving ? '保存中...' : '保存'}
              </button>
              <button onClick={() => { setMemoOpen(false); setMemoInput(item.summaryMemo || '') }} style={{ padding:'7px 12px', background:'none', border:`0.5px solid ${inputBorder}`, borderRadius:7, fontSize:12, color:textSec, cursor:'pointer' }}>キャンセル</button>
            </div>
          </div>
        )}

        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:5 }}>
          <button onClick={() => setMemoOpen(o => !o)} style={{ background:'none', border:'none', fontSize:10, color:textSec, cursor:'pointer', padding:0, opacity:0.7 }}>
            {memoOpen ? '✕ 閉じる' : item.summaryMemo ? '✏ メモを編集' : '＋ メモを追加'}
          </button>
          <div style={{ fontSize:10, color:textSec, fontFamily:'monospace' }}>
            {item.createdAt ? new Date(item.createdAt).toLocaleTimeString('ja-JP', { hour:'2-digit', minute:'2-digit' }) : ''}
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