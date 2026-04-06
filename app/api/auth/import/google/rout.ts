import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/authOptions'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { gasToken, platformKey, googleAccessToken } = body

  if (!googleAccessToken) {
    return NextResponse.json({ error: 'Google access token not found. Please re-login.' }, { status: 400 })
  }

  const GAS_URL = process.env.NEXT_PUBLIC_GAS_API_URL!

  // サーバーサイドからGASを叩く（リダイレクト問題なし）
  const gasRes = await fetch(GAS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    redirect: 'follow',
    body: JSON.stringify({
      token: gasToken,
      path: '/integrations/token',
      platform_key: platformKey,
      google_access_token: googleAccessToken,
    }),
  })

  const data = await gasRes.json()
  return NextResponse.json(data)
}