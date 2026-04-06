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
          scope: [
            'openid',
            'email',
            'profile',
            'https://www.googleapis.com/auth/youtube.readonly',
            'https://www.googleapis.com/auth/documents.readonly',
            'https://www.googleapis.com/auth/calendar.readonly',
            'https://www.googleapis.com/auth/drive.readonly',
          ].join(' '),
          access_type: 'offline',
          prompt:      'consent',
        },
      },
    }),
  ],

  callbacks: {
    async jwt({ token, account }) {
      if (account?.id_token) {
        // GASでJWT取得
        try {
          const result = await loginWithGoogle(account.id_token)
          token.gasToken    = result.token
          token.userId      = result.user?.id
          token.userEmail   = result.user?.email
          token.userDisplay = result.user?.displayName
        } catch(e) {
          console.error('GAS auth error:', e)
        }
        // GoogleトークンをJWTに保存
        token.googleAccessToken  = account.access_token  ?? ''
        token.googleRefreshToken = account.refresh_token ?? ''
        token.googleExpiresAt    = account.expires_at    ?? 0
      }
      return token
    },

    async session({ session, token }) {
      session.gasToken          = token.gasToken          as string
      session.userId            = token.userId            as string
      session.userDisplay       = token.userDisplay       as string
      session.googleAccessToken = token.googleAccessToken as string
      session.googleRefreshToken = token.googleRefreshToken as string
      return session
    },
  },

  pages: {
    signIn: '/login',
  },

  secret: process.env.NEXTAUTH_SECRET,
}