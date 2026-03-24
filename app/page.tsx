'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

export default function Home() {
  const { data: session, status } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (status === 'loading') return
    if (session) {
      router.replace('/feed')
    } else {
      router.replace('/login')
    }
  }, [session, status, router])

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '100vh', background: '#020810',
    }}>
      <div style={{ color: 'rgba(150,170,230,0.4)', fontFamily: 'monospace', fontSize: 12, letterSpacing: '0.15em' }}>
        LOADING...
      </div>
    </div>
  )
}
