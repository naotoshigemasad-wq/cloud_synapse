import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { gasToken, platformKey, googleAccessToken } = body

    if (!googleAccessToken) {
      return NextResponse.json({ error: 'Google access token not found' }, { status: 400 })
    }

    const GAS_URL = process.env.NEXT_PUBLIC_GAS_API_URL!
    const gasRes  = await fetch(GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      redirect: 'follow',
      body: JSON.stringify({
        token: gasToken,
        path: '/integrations/token',
        platform_key: platformKey,
        google_access_token: googleAccessToken,
      }),
    })

    const text = await gasRes.text()
    try {
      return NextResponse.json(JSON.parse(text))
    } catch {
      return NextResponse.json({ error: 'GAS response error: ' + text.slice(0, 100) })
    }
  } catch(e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}