// Datas no fuso da loja (todas as lojas atuais estão em America/Sao_Paulo)
const TZ = 'America/Sao_Paulo'

/** Data de hoje (YYYY-MM-DD) no fuso da loja */
export function hoje(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

const add = (iso: string, dias: number) => {
  const d = new Date(iso + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

export type Atalho = 'hoje' | '7d' | '30d' | 'mes' | 'mes_anterior'

export function periodo(a: Atalho): { de: string; ate: string } {
  const h = hoje()
  const [y, m] = h.split('-').map(Number)
  switch (a) {
    case 'hoje': return { de: h, ate: h }
    case '7d': return { de: add(h, -6), ate: h }
    case '30d': return { de: add(h, -29), ate: h }
    case 'mes': return { de: `${h.slice(0, 7)}-01`, ate: h }
    case 'mes_anterior': {
      const py = m === 1 ? y - 1 : y, pm = m === 1 ? 12 : m - 1
      const ini = `${py}-${String(pm).padStart(2, '0')}-01`
      return { de: ini, ate: add(`${h.slice(0, 7)}-01`, -1) }
    }
  }
}

export const dataBR = (iso: string) => {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}
