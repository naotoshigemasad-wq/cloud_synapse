// ============================================================
//  lib/integrations.ts  /  外部連携APIクライアント
// ============================================================

const GAS_URL = process.env.NEXT_PUBLIC_GAS_API_URL || ''

async function gasPost(path: string, token: string, body: Record<string, unknown>) {
  const params = new URLSearchParams({ path })
  const res = await fetch(`${GAS_URL}?${params}`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },  // ← application/json から変更
    body: JSON.stringify({ ...body, token }),
  })
  return res.json()
}

async function gasGet(path: string, token: string, extra: Record<string, string> = {}) {
  const params = new URLSearchParams({ path, token, ...extra })
  const res = await fetch(`${GAS_URL}?${params}`)
  return res.json()
}

// ── 型定義 ──────────────────────────────────────────────────

export type PlatformKey = 'notion' | 'youtube' | 'pinterest' | 'google'

export interface Integration {
  platformKey: PlatformKey
  connected:   boolean
  connectedAt: string
  lastSyncAt:  string
  scope:       Record<string, boolean>
}

export interface ImportResult {
  success:  boolean
  imported: number
  total:    number
  error?:   string
}

// ── 連携状況取得 ─────────────────────────────────────────────

export async function getIntegrations(token: string): Promise<{ integrations: Integration[] }> {
  return gasGet('/integrations', token)
}

// ── トークン保存 ─────────────────────────────────────────────

/** Notion Integration Token を保存 */
export async function saveNotionToken(token: string, apiKey: string) {
  return gasPost('/integrations/token', token, {
    platform_key: 'notion',
    api_key: apiKey,
  })
}

/** YouTube/Google の OAuth トークンを保存 */
export async function saveGoogleToken(
  token: string,
  platformKey: 'youtube' | 'google',
  data: { access_token: string; refresh_token?: string; expires_at?: string }
) {
  return gasPost('/integrations/token', token, {
    platform_key: platformKey,
    ...data,
  })
}

/** Pinterest の OAuth トークンを保存 */
export async function savePinterestToken(
  token: string,
  data: { access_token: string; refresh_token?: string; expires_at?: string }
) {
  return gasPost('/integrations/token', token, {
    platform_key: 'pinterest',
    ...data,
  })
}

// ── インポート実行 ───────────────────────────────────────────

/** Notionからページをインポート */
export async function importFromNotion(token: string, limit = 20): Promise<ImportResult> {
  return gasPost('/integrations/import', token, {
    platform_key: 'notion',
    limit,
  })
}

/** YouTubeから動画をインポート */
export async function importFromYouTube(
  token: string,
  type: 'liked' | 'saved' = 'liked',
  limit = 20
): Promise<ImportResult> {
  return gasPost('/integrations/import', token, {
    platform_key: 'youtube',
    type,
    limit,
  })
}

/** PinterestのボードIDまたは全ピンをインポート */
export async function importFromPinterest(
  token: string,
  opts: { board_id?: string; limit?: number } = {}
): Promise<ImportResult> {
  return gasPost('/integrations/import', token, {
    platform_key: 'pinterest',
    ...opts,
    limit: opts.limit || 20,
  })
}

/** Pinterestのボード一覧取得 */
export async function getPinterestBoards(token: string) {
  return gasGet('/integrations/pinterest/boards', token)
}

/** Google Docsからドキュメントをインポート */
export async function importFromGoogleDocs(token: string, limit = 10): Promise<ImportResult> {
  return gasPost('/integrations/import', token, {
    platform_key: 'google_docs',
    limit,
  })
}

/** Google Calendarからイベントをインポート */
export async function importFromGoogleCalendar(
  token: string,
  days = 30,
  limit = 20
): Promise<ImportResult> {
  return gasPost('/integrations/import', token, {
    platform_key: 'google_calendar',
    days,
    limit,
  })
}
