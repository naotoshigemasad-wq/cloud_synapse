'use client'

import { useSession } from 'next-auth/react'

export function useGasToken() {
  const { data: session, status } = useSession()
  return {
    token:   session?.gasToken ?? '',
    loading: status === 'loading',
    ready:   status === 'authenticated' && !!session?.gasToken,
  }
}
