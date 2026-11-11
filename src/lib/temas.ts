export type Tema = 'nexo' | 'noir' | 'oceano' | 'esmeralda' | 'rose'

export const TEMAS: { id: Tema; nome: string; descricao: string; cores: [string, string, string]; meta: string }[] = [
  { id: 'nexo', nome: 'NEXO', descricao: 'Roxo e lavanda, o padrão', cores: ['#6d28d9', '#ede9fe', '#ffffff'], meta: '#6d28d9' },
  { id: 'noir', nome: 'Noir Dourado', descricao: 'Preto e dourado, sofisticado', cores: ['#d4af37', '#1b1710', '#0e0c09'], meta: '#0e0c09' },
  { id: 'oceano', nome: 'Oceano', descricao: 'Azul calmo e profissional', cores: ['#0369a1', '#e0f2fe', '#ffffff'], meta: '#0369a1' },
  { id: 'esmeralda', nome: 'Esmeralda', descricao: 'Verde fresco e natural', cores: ['#047857', '#d1fae5', '#ffffff'], meta: '#047857' },
  { id: 'rose', nome: 'Rosé', descricao: 'Rosa elegante, delicado', cores: ['#be123c', '#ffe4e6', '#ffffff'], meta: '#be123c' },
]

const KEY = 'nexo.tema'

export function aplicarTema(t: Tema) {
  const valido = TEMAS.find((x) => x.id === t) ? t : 'nexo'
  document.documentElement.dataset.theme = valido
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', TEMAS.find((x) => x.id === valido)!.meta)
  try { localStorage.setItem(KEY, valido) } catch { /* sem storage */ }
}

export function temaSalvo(): Tema {
  try { return (localStorage.getItem(KEY) as Tema) || 'nexo' } catch { return 'nexo' }
}
