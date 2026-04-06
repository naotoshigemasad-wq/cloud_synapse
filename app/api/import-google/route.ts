import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/authOptions'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { gasToken, platformKey } = body

    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const refreshToken = (session as any).googleRefreshToken as string
    let accessToken    = (session as any).googleAccessToken  as string

    // リフレッシュトークンで新しいアクセストークンを取得
    if (refreshToken) {
      const refreshRes  = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id:     process.env.GOOGLE_CLIENT_ID!,
          client_secret: process.env.GOOGLE_CLIENT_SECRET!,
          refresh_token: refreshToken,
          grant_type:    'refresh_token',
        }),
      })
      const refreshData = await refreshRes.json()
      if (refreshData.access_token) accessToken = refreshData.access_token
    }

    if (!accessToken) return NextResponse.json({ error: 'Please re-login.' }, { status: 400 })

    // ── YouTube または Google Drive から直接データ取得 ──────────
    const videos: any[] = []
    const docs:   any[] = []

    if (platformKey === 'youtube') {
      for (const playlistId of ['LL', 'WL']) {
        let pageToken = ''
        for (let i = 0; i < 10; i++) {
          const url = `https://www.googleapis.com/youtube/v3/playlistItems?playlistId=${playlistId}&part=snippet&maxResults=50${pageToken ? '&pageToken=' + pageToken : ''}`
          const res  = await fetch(url, { headers: { Authorization: 'Bearer ' + accessToken } })
          if (!res.ok) break
          const data  = await res.json()
          for (const item of data.items || []) {
            const videoId = item.snippet?.resourceId?.videoId
            if (videoId) videos.push({
              url:       'https://www.youtube.com/watch?v=' + videoId,
              title:     item.snippet?.title || '',
              thumbnail: item.snippet?.thumbnails?.medium?.url || '',
            })
          }
          if (!data.nextPageToken) break
          pageToken = data.nextPageToken
        }
      }
    }

    if (platformKey === 'google_docs') {
      let pageToken = ''
      for (let i = 0; i < 10; i++) {
        const url = `https://www.googleapis.com/drive/v3/files?q=mimeType%3D%27application%2Fvnd.google-apps.document%27+and+trashed%3Dfalse&fields=nextPageToken,files(id,name,webViewLink)&pageSize=50&orderBy=modifiedTime+desc${pageToken ? '&pageToken=' + pageToken : ''}`
        const res  = await fetch(url, { headers: { Authorization: 'Bearer ' + accessToken } })
        if (!res.ok) break
        const data = await res.json()
        for (const file of data.files || []) {
          if (file.webViewLink) docs.push({ url: file.webViewLink, title: file.name || '' })
        }
        if (!data.nextPageToken) break
        pageToken = data.nextPageToken
      }
    }

    const items = platformKey === 'youtube' ? videos : docs
    console.log('fetched items:', items.length)

    // ── GASにデータを渡して保存 ─────────────────────────────────
    const GAS_URL = process.env.NEXT_PUBLIC_GAS_API_URL!
    const gasRes  = await fetch(`${GAS_URL}?path=/integrations/bulk-save`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      redirect: 'follow',
      body: JSON.stringify({
        token:        gasToken,
        path:         '/integrations/bulk-save',
        platform_key: platformKey,
        items,
      }),
    })

    const text = await gasRes.text()
    console.log('GAS bulk-save response:', text.slice(0, 200))
    try {
      return NextResponse.json(JSON.parse(text))
    } catch {
      return NextResponse.json({ error: 'GAS error: ' + text.slice(0, 200) })
    }
  } catch(e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}