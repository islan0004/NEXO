import { useStore, type Plano } from './store'

export const ORDEM: Record<Plano, number> = { start: 1, pro: 2, black: 3 }

export const PLANOS: { id: Plano; nome: string; frase: string; usuarios: string; itens: string[] }[] = [
  {
    id: 'start', nome: 'Komando Start', frase: 'Para quem vende sozinho e quer sair do caderno', usuarios: '1 usuário',
    itens: ['Vendas, valor avulso e estoque', 'Fiado com cobrança no WhatsApp', 'Comprovante e Fechar o dia', 'Caixa do dia (abrir e fechar)', 'Relatório do mês atual', 'Backup em planilha'],
  },
  {
    id: 'pro', nome: 'Komando Pro', frase: 'Para a loja que já tem equipe e rotina', usuarios: 'Até 3 usuários',
    itens: ['Tudo do Start', 'Tamanhos e cores (variações)', 'Despesas, taxa da maquininha e lucro líquido', 'Catálogo online com pedido no WhatsApp', 'Relatórios de qualquer período', 'Meta do mês e produtos parados', 'Leitor de código de barras pela câmera', 'Trocas e devoluções', 'Importar produtos por planilha', '4 temas de cores'],
  },
  {
    id: 'black', nome: 'Komando Black', frase: 'Para a loja que quer crescer e fidelizar', usuarios: 'Usuários ilimitados',
    itens: ['Tudo do Pro', 'Clientes sumidos e aniversariantes', 'Cartão fidelidade digital', 'Equipe sem limite de usuários', 'Tema exclusivo Noir Dourado', 'Atendimento prioritário no WhatsApp', 'Novidades em primeira mão'],
  },
]

/** Recursos e o plano mínimo de cada um */
export const RECURSOS = {
  variacoes: 'pro', despesas: 'pro', catalogo: 'pro', periodos: 'pro', fotos: 'pro', temas: 'pro', noir: 'black',
  meta: 'pro', parados: 'pro', codigo: 'pro', trocas: 'pro', importar: 'pro',
  clientes: 'black', fidelidade: 'black',
} as const
export type Recurso = keyof typeof RECURSOS

export const nomePlano = (p: Plano) => PLANOS.find((x) => x.id === p)!.nome

export function usePlano() {
  const { assinatura } = useStore()
  const plano: Plano = assinatura?.effective_plan ?? 'black'
  const pode = (r: Recurso) => ORDEM[plano] >= ORDEM[RECURSOS[r]]
  return { plano, pode, emTeste: assinatura?.status === 'trial', assinatura }
}
