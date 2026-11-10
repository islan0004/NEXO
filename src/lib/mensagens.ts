import { METODOS, brl, labelVariant, qtd, type Attrs } from './supabase'

/** Link do WhatsApp: com telefone abre a conversa; sem telefone deixa escolher o contato. */
export function abrirWhatsApp(texto: string, telefone?: string | null) {
  let n = (telefone ?? '').replace(/\D/g, '')
  if (n.length === 10 || n.length === 11) n = '55' + n
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(texto)}` : `https://wa.me/?text=${encodeURIComponent(texto)}`
}

export function textoComprovante(p: {
  loja: string; numero: number; data: string; cliente?: string | null
  itens: { product_name: string; attributes: Attrs; quantity: number; unit_price: number; line_total: number }[]
  subtotal: number; desconto: number; total: number; pagamentos: { method: string; amount: number }[]
  saldoFiado?: number | null
}) {
  const linhas = [
    `*${p.loja}*`,
    `Comprovante da venda #${p.numero} · ${new Date(p.data).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}`,
    p.cliente ? `Cliente: ${p.cliente}` : null,
    '',
    ...p.itens.map((i) => {
      const v = Object.keys(i.attributes ?? {}).length ? ` (${labelVariant(i.attributes)})` : ''
      return `• ${qtd(i.quantity)}x ${i.product_name}${v} — ${brl(i.line_total)}`
    }),
    '',
    p.desconto > 0 ? `Subtotal: ${brl(p.subtotal)}\nDesconto: −${brl(p.desconto)}` : null,
    `*Total: ${brl(p.total)}*`,
    `Pagamento: ${p.pagamentos.map((x) => `${METODOS[x.method] ?? x.method} ${brl(x.amount)}`).join(' + ')}`,
    p.saldoFiado && p.saldoFiado > 0 ? `\nSeu saldo em aberto na loja: ${brl(p.saldoFiado)}` : null,
    '',
    'Obrigado pela preferência! 💜',
  ]
  return linhas.filter((l) => l !== null).join('\n')
}

export function textoResumoDia(p: {
  loja: string; data: string; vendido: number; lucro: number; vendas: number; ticket: number
  metodos: { method: string; total: number }[]
  recebidoFiado: number; aReceber: number; atrasados: number
  estoqueBaixo: string[]
}) {
  const l = [
    `*Resumo do dia · ${p.loja}*`,
    p.data,
    '',
    `💰 Vendido: ${brl(p.vendido)} em ${p.vendas} venda(s)`,
    `📈 Lucro bruto: ${brl(p.lucro)}`,
    p.vendas > 0 ? `🧾 Ticket médio: ${brl(p.ticket)}` : null,
    p.metodos.length ? `\nPor forma de pagamento:\n${p.metodos.map((m) => `• ${METODOS[m.method] ?? m.method}: ${brl(m.total)}`).join('\n')}` : null,
    '',
    `📒 Fiado recebido hoje: ${brl(p.recebidoFiado)}`,
    `📒 Fiado a receber: ${brl(p.aReceber)}${p.atrasados > 0 ? ` (${p.atrasados} cliente(s) em atraso)` : ''}`,
    p.estoqueBaixo.length ? `\n⚠️ Estoque baixo:\n${p.estoqueBaixo.slice(0, 10).map((x) => `• ${x}`).join('\n')}${p.estoqueBaixo.length > 10 ? `\n• e mais ${p.estoqueBaixo.length - 10}` : ''}` : null,
    '',
    '— enviado pelo NEXO',
  ]
  return l.filter((x) => x !== null).join('\n')
}
