// ============================================================
//  lib/api.ts  /  GAS APIクライアント
// ============================================================

const GAS_URL = process.env.NEXT_PUBLIC_GAS_API_URL || ''

type ApiOptions = {
  token?: string
  body?: Record<string, unknown>
}

// ── 共通fetch関数 ─────────────────────────────────────────────

async function gasGet(path: string, opts: ApiOptions = {}) {
  const params = new URLSearchParams({ path })
  if (opts.token) params.set('token', opts.token)

  const res = await fetch(`${GAS_URL}?${params.toString()}`)
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}

async function gasPost(path: string, opts: ApiOptions = {}) {
  const body = { ...opts.body, token: opts.token, path }
  const params = new URLSearchParams({ path })

  const res = await fetch(`${GAS_URL}?${params.toString()}`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}

// ── 認証 ──────────────────────────────────────────────────────

/**
 * Google IDトークンをGASに送り、JWTを取得する
 */
export async function loginWithGoogle(idToken: string) {
  return gasPost('/auth/google', { body: { id_token: idToken } })
}

/**
 * JWTを検証して有効かチェック
 */
export async function verifyToken(token: string) {
  return gasGet('/auth/verify', { token })
}

/**
 * 現在のユーザー情報を取得
 */
export async function getMe(token: string) {
  return gasGet('/me', { token })
}

// ── アイテム ──────────────────────────────────────────────────

export type ItemType = 'note' | 'web_url' | 'image' | 'video' | 'sns_post'

export interface Item {
  id: string
  type: ItemType
  displayTitle: string
  summaryMemo: string
  content: string
  url: string
  thumbnailUrl: string
  platform: string
  source: string
  embeddingAt: string
  createdAt: string
  updatedAt: string
  tags: Tag[]
}

export async function getItems(
  token: string,
  opts: { tag_id?: string; type?: ItemType; limit?: number; offset?: number } = {}
) {
  const params = new URLSearchParams({ path: '/items', token })
  if (opts.tag_id) params.set('tag_id', opts.tag_id)
  if (opts.type)   params.set('type',   opts.type)
  if (opts.limit)  params.set('limit',  String(opts.limit))
  if (opts.offset) params.set('offset', String(opts.offset))
  const res = await fetch(`${GAS_URL}?${params.toString()}`)
  return res.json() as Promise<{ items: Item[]; total: number }>
}

export async function createItem(
  token: string,
  data: { type: ItemType; content?: string; url?: string; summary_memo?: string; platform?: string }
) {
  return gasPost('/items', { token, body: data })
}

export async function updateItem(
  token: string,
  itemId: string,
  data: { display_title?: string; summary_memo?: string }
) {
  return gasPost(`/items/${itemId}`, { token, body: data })
}

export async function deleteItem(token: string, itemId: string) {
  return gasPost(`/items/${itemId}`, { token, body: { _method: 'DELETE' } })
}

// ── タグ ──────────────────────────────────────────────────────

export interface Tag {
  id: string
  name: string
  colorHex: string
  description: string
  isSystem: boolean
  itemCount: number
  createdAt: string
}

export async function getTags(token: string) {
  return gasGet('/tags', { token }) as Promise<{ tags: Tag[] }>
}

export async function createTag(
  token: string,
  data: { name: string; color_hex: string; description?: string }
) {
  return gasPost('/tags', { token, body: data })
}

export async function deleteTag(token: string, tagId: string) {
  return gasPost(`/tags/${tagId}`, { token, body: { _method: 'DELETE' } })
}

export async function addItemTag(token: string, itemId: string, tagId: string) {
  return gasPost('/item-tags', { token, body: { item_id: itemId, tag_id: tagId } })
}

export async function removeItemTag(token: string, itemId: string, tagId: string) {
  return gasPost('/item-tags', { token, body: { item_id: itemId, tag_id: tagId, _method: 'DELETE' } })
}

// ── ひらめき生成 ──────────────────────────────────────────────

export interface Keyword {
  id: string
  text: string
  score: number
  sourceItemIds: string[]
  posX: number
  posY: number
  posZ: number
  fontKey: string
  animKey: string
}

export async function createTheme(
  token: string,
  data: { text: string; tag_ids?: string[] }
) {
  return gasPost('/themes', { token, body: data }) as Promise<{
    themeId: string
    text: string
    keywords: Keyword[]
    topItems: { id: string; displayTitle: string; score: number }[]
    createdAt: string
  }>
}

export async function getKeywords(token: string, themeId: string) {
  return gasGet(`/themes/${themeId}/keywords`, { token }) as Promise<{
    themeId: string
    keywords: Keyword[]
  }>
}
