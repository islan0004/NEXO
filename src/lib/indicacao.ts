/** Código de indicação (?ref=XXXXXX): guardado no aparelho por 30 dias até a loja ser criada. */
const CHAVE = 'nexo.ref'
const VALIDADE = 30 * 24 * 60 * 60 * 1000

export function capturarIndicacao() {
  try {
    const ref = new URLSearchParams(window.location.search).get('ref')?.trim().toUpperCase()
    if (ref && /^[A-Z2-9]{6}$/.test(ref)) localStorage.setItem(CHAVE, JSON.stringify({ code: ref, at: Date.now() }))
  } catch { /* sem armazenamento: segue sem indicação */ }
}

export function codigoIndicacao(): string | null {
  try {
    const v = JSON.parse(localStorage.getItem(CHAVE) ?? 'null') as { code: string; at: number } | null
    if (!v || Date.now() - v.at > VALIDADE) return null
    return v.code
  } catch { return null }
}

export function limparIndicacao() {
  try { localStorage.removeItem(CHAVE) } catch { /* nada */ }
}

export const linkIndicacao = (code: string) => `https://usekomando.vercel.app/?ref=${code}`
