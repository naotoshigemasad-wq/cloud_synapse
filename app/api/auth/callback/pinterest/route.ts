// app/api/auth/callback/pinterest/route.ts
// ② Pinterest が認証後にリダイレクトしてくるコールバック

import { getServerSession } from 'next-auth'
import { NextRequest, NextResponse } from 'next/server'
import { authOptions } from '@/lib/authOptions'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const code  = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')

  const baseUrl = process.env.NEXTAUTH_URL!

  // ── エラーハンドリング ──────────────────────────────────────
  if (error) {
    // ユーザーが「キャンセル」を押した場合など
    console.error('Pinterest OAuth error:', error)
    return NextResponse.redirect(
      `${baseUrl}/settings?error=pinterest_denied`
    )
  }

  if (!code) {
    return NextResponse.redirect(
      `${baseUrl}/settings?error=pinterest_no_code`
    )
  }

  // ── セッション確認 ─────────────────────────────────────────
  const session = await getServerSession(authOptions)
  if (!session?.gasToken) {
    return NextResponse.redirect(`${baseUrl}/login`)
  }

  // ── アクセストークン取得（code → token 交換）──────────────
  const clientId     = process.env.PINTEREST_CLIENT_ID!
  const clientSecret = process.env.PINTEREST_CLIENT_SECRET!
  const redirectUri  = `${baseUrl}/api/auth/callback/pinterest`

  // Basic 認証ヘッダー（Pinterest API 仕様）
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')

  let tokenData: {
    access_token:  string
    refresh_token: string
    expires_in:    number
    token_type:    string
  }

  try {
    const tokenRes = await fetch('https://api.pinterest.com/v5/oauth/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${basicAuth}`,
        'Content-Type':  'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type:   'authorization_code',
        code,
        redirect_uri: redirectUri,
      }).toString(),
    })

    if (!tokenRes.ok) {
      const err = await tokenRes.text()
      console.error('Pinterest token exchange failed:', err)
      return NextResponse.redirect(
        `${baseUrl}/settings?error=pinterest_token_failed`
      )
    }

    tokenData = await tokenRes.json()

  } catch (e) {
    console.error('Pinterest token fetch error:', e)
    return NextResponse.redirect(
      `${baseUrl}/settings?error=pinterest_network_error`
    )
  }

  // ── GAS にトークンを保存 ───────────────────────────────────
  const expiresAt = new Date(
    Date.now() + (tokenData.expires_in || 3600) * 1000
  ).toISOString()

  const GAS_URL    = process.env.NEXT_PUBLIC_GAS_API_URL!
  const gasPayload = {
    token:         session.gasToken,
    platform_key:  'pinterest',
    access_token:  tokenData.access_token,
    refresh_token: tokenData.refresh_token || '',
    expires_at:    expiresAt,
  }

  try {
    const gasRes = await fetch(`${GAS_URL}?path=/integrations/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(gasPayload),
    })
    const gasData = await gasRes.json()

    if (gasData.error) {
      console.error('GAS save error:', gasData.error)
      return NextResponse.redirect(
        `${baseUrl}/settings?error=pinterest_save_failed`
      )
    }
  } catch (e) {
    console.error('GAS save fetch error:', e)
    return NextResponse.redirect(
      `${baseUrl}/settings?error=pinterest_save_failed`
    )
  }

  // ── 成功 → 設定画面に戻る ─────────────────────────────────
  return NextResponse.redirect(
    `${baseUrl}/settings?connected=pinterest`
  )
}
