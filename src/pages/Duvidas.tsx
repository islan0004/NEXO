import { useState } from 'react'
import { usePerfil } from '../lib/perfil'
import { useToast } from '../lib/toast'
import { Button, Card, Modal } from '../components/ui'
import TemaPicker from '../components/TemaPicker'

const FAQ: { grupo: string; itens: [string, string][] }[] = [
  { grupo: 'Começando', itens: [
    ['Como instalo o NEXO no celular?', 'No Android (Chrome), abra o menu do NEXO e toque em “Instalar o app”. No iPhone, abra no Safari, toque em Compartilhar (quadrado com seta) e depois em “Adicionar à Tela de Início”.'],
    ['Por onde começo?', 'Cadastre seus produtos em “Produtos e estoque” com custo, preço e quantidade. Depois é só vender pelo botão “Vender”.'],
    ['Preciso cadastrar tudo de uma vez?', 'Não. Cadastre primeiro os produtos que mais vendem e vá completando com o tempo.'],
  ] },
  { grupo: 'Produtos e estoque', itens: [
    ['Como cadastro tamanho e cor?', 'No cadastro do produto, marque “Este produto tem variações” e escreva os valores separados por vírgula (ex.: Tamanho: P, M, G). O NEXO monta todas as combinações para você colocar o estoque de cada uma.'],
    ['Chegou mercadoria. Como dou entrada?', 'Abra o produto, toque em “Estoque” na variação e escolha “Entrada (compra)”. Se informar o custo da compra, ele vira o novo custo do produto.'],
    ['Contei o estoque e está diferente. E agora?', 'No produto, toque em “Estoque” e escolha “Corrigir contagem”. Digite a quantidade real; o NEXO calcula a diferença e registra no histórico.'],
    ['Por que o custo é importante?', 'Sem o custo, o NEXO não consegue calcular o lucro. Com ele, cada venda mostra quanto você ganhou de verdade.'],
  ] },
  { grupo: 'Vendas', itens: [
    ['Como dou desconto?', 'Na tela de venda, use o campo Desconto em R$ ou em %. O total já é recalculado.'],
    ['O cliente pagou parte no Pix e parte em dinheiro.', 'Toque em “Dividir pagamento” e informe cada valor. Se for dinheiro, digite quanto recebeu para ver o troco.'],
    ['Errei uma venda. Como cancelo?', 'Abra a venda em “Vendas” e toque em “Cancelar venda”. Os produtos voltam para o estoque e a venda sai do faturamento. Só o dono ou gerente pode cancelar.'],
    ['Como mando o comprovante para o cliente?', 'Depois de finalizar, toque em “Enviar comprovante”. Abre o WhatsApp com a mensagem pronta.'],
  ] },
  { grupo: 'Fiado', itens: [
    ['Como vendo fiado?', 'Na tela de venda, escolha a forma de pagamento “Fiado” e selecione ou cadastre o cliente.'],
    ['O cliente pagou uma parte. Como registro?', 'Em “Fiado”, abra o cliente e toque em “Registrar pagamento”. Pode ser qualquer valor até o total da dívida.'],
    ['Quando o fiado vence?', 'O prazo é de 30 dias a partir da compra mais antiga em aberto. Depois disso o cliente aparece como atrasado.'],
    ['Como cobro sem ficar chato?', 'Na ficha do cliente, toque em “Cobrar no WhatsApp”. A mensagem já vai educada, com o valor e o vencimento.'],
  ] },
  { grupo: 'Relatórios e lucro', itens: [
    ['O lucro mostrado já desconta tudo?', 'É o lucro bruto: preço de venda menos o custo dos produtos. Despesas como aluguel e taxas ainda não entram.'],
    ['Venda fiado conta no faturamento?', 'Sim, no dia da venda. O que entra no caixa depois aparece no fiado recebido.'],
  ] },
  { grupo: 'Conta e segurança', itens: [
    ['Meus dados ficam seguros?', 'Cada loja só enxerga os próprios dados. Outra loja não tem acesso a nada seu.'],
    ['Esqueci a senha.', 'Na tela de entrar, toque em “Esqueci a senha” e siga o link enviado para o seu e-mail.'],
  ] },
]

export default function Duvidas() {
  const { perfil, setTour, setTema } = usePerfil()
  const toast = useToast()
  const [aberto, setAberto] = useState<string | null>(null)
  const [tema, setTemaModal] = useState(false)

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dúvidas</h1>
        <p className="text-sm text-muted">Respostas rápidas para o dia a dia</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="ghost" onClick={() => { setTour({}); toast('Tutorial reiniciado') }}>↻ Rever o tutorial</Button>
        <Button variant="ghost" onClick={() => setTemaModal(true)}>🎨 Trocar tema</Button>
      </div>

      {FAQ.map((g) => (
        <Card key={g.grupo} className="p-0">
          <h2 className="px-4 pt-4 text-xs font-semibold uppercase tracking-wide text-muted">{g.grupo}</h2>
          <ul className="divide-y divide-brand-100">
            {g.itens.map(([p, r]) => {
              const k = g.grupo + p
              const open = aberto === k
              return (
                <li key={k}>
                  <button onClick={() => setAberto(open ? null : k)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-medium">
                    {p}<span className={`text-muted transition ${open ? 'rotate-45' : ''}`}>+</span>
                  </button>
                  {open && <p className="nexo-toast px-4 pb-4 text-sm text-muted">{r}</p>}
                </li>
              )
            })}
          </ul>
        </Card>
      ))}

      {tema && perfil && (
        <Modal title="Tema de cores" onClose={() => setTemaModal(false)} wide>
          <TemaPicker value={perfil.theme} onChange={(t) => { setTema(t); toast('Tema aplicado') }} />
        </Modal>
      )}
    </div>
  )
}
