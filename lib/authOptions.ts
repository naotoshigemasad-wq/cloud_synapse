// lib/authOptions.ts
// NextAuth の設定を一箇所に集約
// → [...nextauth]/route.ts と Pinterest callbackの両方から import する

import type { NextAuthOptions } from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'
import { loginWithGoogle } from '@/lib/api'

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId:     process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          // YouTube の高評価・保存済み動画 + Google Docs + Calendar にアクセス
          scope: [
            'openid',
            'email',
            'profile',
            'https://www.googleapis.com/auth/youtube.readonly',
            'https://www.googleapis.com/auth/documents.readonly',
            'https://www.googleapis.com/auth/calendar.readonly',
            'https://www.googleapis.com/auth/drive.readonly',
          ].join(' '),
          // 毎回 refresh_token を取得するために必要
          access_type: 'offline',
          prompt:      'consent',
        },
      },
    }),
  ],

  callbacks: {
    async jwt({ token, account }) {
    // Googleログイン時にaccess_tokenを保存
    if (account?.provider === 'google') {
    token.googleAccessToken = account.access_token ?? ''    }
    return token
  },
  async session({ session, token }) {
    // セッションにgoogleAccessTokenを含める
    (session as any).googleAccessToken = token.googleAccessToken
    // 既存のgasTokenの処理はそのまま
    return session
  },
    async jwt({ token, account }) {
      if (account?.id_token) {
        // GAS に Google ID トークンを渡して JWT を取得
        try {
          const result = await loginWithGoogle(account.id_token)
          token.gasToken      = result.token
          token.userId        = result.user?.id
          token.userEmail     = result.user?.email
          token.userDisplay   = result.user?.displayName
        } catch (e) {
          console.error('GAS auth error:', e)
        }

        // Google の OAuth トークンも保持（YouTube/Docs/Calendar用）
        token.googleAccessToken  = account.access_token  ?? ''
        token.googleRefreshToken = account.refresh_token ?? ''
        token.googleExpiresAt    = account.expires_at    ?? 0
      }
      return token
    },

    async session({ session, token }) {
      session.gasToken           = token.gasToken           as string
      session.userId             = token.userId             as string
      session.userDisplay        = token.userDisplay        as string
      // Google トークンもセッションに渡す（クライアントから使う場合）
      session.googleAccessToken  = token.googleAccessToken  as string
      return session
    },
  },

  pages: {
    signIn: '/login',
  },

  secret: process.env.NEXTAUTH_SECRET,
}
