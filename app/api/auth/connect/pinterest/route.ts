// app/api/auth/connect/pinterest/route.ts
// ① Pinterest の認証ページへリダイレクトする

import { getServerSession } from 'next-auth'
import { NextResponse }     from 'next/server'
import { authOptions }      from '@/lib/authOptions'

// Pinterest OAuth に要求するスコープ
const SCOPES = [
  'boards:read',   // ボード一覧
  'pins:read',     // 保存済みピン
].join(',')

export async function GET() {
  // ログイン状態確認
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.redirect(new URL('/login', process.env.NEXTAUTH_URL!))
  }

  const clientId    = process.env.PINTEREST_CLIENT_ID!
  const redirectUri = `${process.env.NEXTAUTH_URL}/api/auth/callback/pinterest`

  // state パラメータ: CSRF対策 + セッション識別用
  // ※ 本番では crypto.randomUUID() + セッションストアへの保存を推奨
  const state = Buffer.from(
    JSON.stringify({ ts: Date.now(), userId: session.userId })
  ).toString('base64url')

  const authUrl = new URL('https://www.pinterest.com/oauth/')
  authUrl.searchParams.set('client_id',     clientId)
  authUrl.searchParams.set('redirect_uri',  redirectUri)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('scope',         SCOPES)
  authUrl.searchParams.set('state',         state)

  return NextResponse.redirect(authUrl.toString())
}
