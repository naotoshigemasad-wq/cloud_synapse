import NextAuth from 'next-auth'

declare module 'next-auth' {
  interface Session {
    gasToken:          string
    userId:            string
    userDisplay:       string
    googleAccessToken: string
    googleRefreshToken?: string
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    gasToken:           string
    userId:             string
    userDisplay:        string
    googleAccessToken:  string
    googleRefreshToken: string
    googleExpiresAt:    number
  }
}

declare module 'next-auth' {
  interface Session {
    gasToken?: string
    googleAccessToken?: string  
  }
}