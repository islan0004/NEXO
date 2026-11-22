import { useState } from 'react'
import { usePerfil } from '../lib/perfil'
import { useToast } from '../lib/toast'
import { Button, Card, Modal } from '../components/ui'
import TemaPicker from '../components/TemaPicker'

const FAQ: { grupo: string; itens: [string, string][] }[] = [
  { grupo: 'Começando', itens: [
    ['Como instalo o Komando no celular?', 'No Android (Chrome), abra o menu do Komando e toque em “Instalar o app”. No iPhone, abra no Safari, toque em Compartilhar (quadrado com seta) e depois em “Adicionar à Tela de Início”.'],
    ['Por onde começo?', 'Pode começar vendendo direto: toque em “Vender” e use “Valor avulso” para lançar só o valor. Quando der, cadastre os produtos que mais vendem para controlar estoque e lucro.'],
    ['Preciso cadastrar produto para vender?', 'Não. Na tela de venda, toque em “Valor avulso” e digite só o valor (e, se quiser, o que foi vendido). Venda avulsa não mexe no estoque.'],
    ['Preciso cadastrar tudo de uma vez?', 'Não. Cadastre primeiro os produtos que mais vendem e vá completando com o tempo.'],
  ] },
  { grupo: 'Produtos e estoque', itens: [
    ['Como cadastro tamanho e cor?', 'No cadastro do produto, marque “Tem tamanhos ou cores diferentes” e escreva as opções separadas por vírgula (ex.: Tamanho: P, M, G). O Komando monta as combinações para você colocar a quantidade de cada uma.'],
    ['Chegou mercadoria. Como dou entrada?', 'Abra o produto, toque em “Ajustar estoque” e escolha “Chegou mercadoria”. Se informar quanto pagou, esse vira o novo custo do produto.'],
    ['Contei o estoque e está diferente. E agora?', 'No produto, toque em “Ajustar estoque” e escolha “Contei e está diferente”. Digite quantas tem de verdade; o Komando acerta sozinho.'],
    ['Por que o custo é importante?', 'Sem o custo, o Komando não consegue calcular o lucro. Com ele, cada venda mostra quanto você ganhou de verdade.'],
  ] },
  { grupo: 'Vendas', itens: [
    ['Como dou desconto?', 'Na tela de venda, use o campo Desconto em R$ ou em %. O total já é recalculado.'],
    ['O cliente pagou parte no Pix e parte em dinheiro.', 'Toque em “Dividir pagamento” e informe cada valor. Se for dinheiro, digite quanto recebeu para ver o troco.'],
    ['O produto acabou no estoque. Consigo vender?', 'Consegue. O Komando não trava a venda: o estoque fica negativo e aparece em vermelho, para você acertar depois em “Ajustar estoque”.'],
    ['Errei uma venda. Como cancelo?', 'Abra a venda em “Vendas” e toque em “Cancelar venda”. Os produtos voltam para o estoque e a venda sai do faturamento. Só o dono ou gerente pode cancelar.'],
    ['Como mando o comprovante para o cliente?', 'Depois de finalizar, toque em “Enviar comprovante”. Abre o WhatsApp com a mensagem pronta.'],
  ] },
  { grupo: 'Fiado', itens: [
    ['Como vendo fiado?', 'Na tela de venda, escolha a forma de pagamento “Fiado” e selecione ou cadastre o cliente.'],
    ['O cliente pagou uma parte. Como registro?', 'Em “Fiado”, abra o cliente e toque em “Pagou uma parte”. Pode ser qualquer valor até o total da dívida.'],
    ['O cliente pagou tudo. Como marco?', 'Na ficha do cliente, toque em “✓ Pagou tudo” e escolha como ele pagou. O saldo zera e ele aparece como “Quitado”.'],
    ['Como passo o fiado do caderno para o app?', 'Cadastre o cliente e preencha “Já deve alguma coisa?”, ou abra a ficha dele e toque em “Lançar dívida anterior”. Esse valor entra no saldo e na cobrança, mas não conta como venda no faturamento nem no lucro. Só o dono e o gerente podem lançar.'],
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
    ['Como indico o Komando para outro lojista?', 'No menu, toque em “Indique o Komando” e mande o seu link pelo WhatsApp. Quem criar a loja por ele testa grátis por 14 dias em vez de 7. A loja aparece na sua lista de indicadas.'],
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
