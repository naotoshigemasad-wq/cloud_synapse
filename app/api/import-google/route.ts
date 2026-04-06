import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/authOptions'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { gasToken, platformKey } = body

    // サーバーサイドでセッションを取得
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const refreshToken = (session as any).googleRefreshToken as string
    let accessToken    = (session as any).googleAccessToken  as string

    // デバッグログ
    console.log('refreshToken:', refreshToken ? refreshToken.slice(0,20) : 'なし')
    console.log('accessToken:', accessToken ? accessToken.slice(0,20) : 'なし')

    // リフレッシュトークンで新しいアクセストークンを取得
    if (refreshToken) {
      const refreshRes = await fetch('https://oauth2.googleapis.com/token', {
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
      if (refreshData.access_token) {
        accessToken = refreshData.access_token
      }
    }

    if (!accessToken) {
      return NextResponse.json({ error: 'Google access token not found. Please re-login.' }, { status: 400 })
    }

    const GAS_URL = process.env.NEXT_PUBLIC_GAS_API_URL!
    const url     = `${GAS_URL}?path=/integrations/token`

    const gasRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      redirect: 'follow',
      body: JSON.stringify({
        token: gasToken,
        path: '/integrations/token',
        platform_key: platformKey,
        google_access_token: accessToken,
      }),
    })

    const text = await gasRes.text()
    try {
      return NextResponse.json(JSON.parse(text))
    } catch {
      return NextResponse.json({ error: 'GAS error: ' + text.slice(0, 200) })
    }
  } catch(e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

const refreshData = await refreshRes.json()
      console.log('refreshData:', JSON.stringify(refreshData).slice(0, 100))
      if (refreshData.access_token) {
        accessToken = refreshData.access_token
        console.log('new accessToken:', accessToken.slice(0, 20))
      }