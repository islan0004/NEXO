import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Logo } from '../components/ui'

const ATUALIZADO = '18/11/2026'

function Pagina({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="min-h-full bg-white">
      <div className="mx-auto max-w-2xl px-5 py-8">
        <Link to="/"><Logo /></Link>
        <h1 className="mt-6 text-2xl font-semibold tracking-tight">{titulo}</h1>
        <p className="mt-1 text-xs text-muted">Atualizado em {ATUALIZADO}</p>
        <div className="mt-6 space-y-5 text-sm leading-relaxed text-ink [&_h2]:mt-6 [&_h2]:text-base [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc">
          {children}
        </div>
        <div className="mt-10 flex gap-4 border-t border-brand-100 pt-4 text-sm">
          <Link to="/termos" className="text-brand-700 hover:underline">Termos de uso</Link>
          <Link to="/privacidade" className="text-brand-700 hover:underline">Política de privacidade</Link>
        </div>
      </div>
    </div>
  )
}

export function Termos() {
  return (
    <Pagina titulo="Termos de uso do NEXO">
      <p>Estes termos valem para quem cria uma conta no NEXO, sistema on-line de gestão de vendas, estoque, fiado e finanças para pequenos negócios. Ao criar a conta, você concorda com eles.</p>

      <h2>1. O serviço</h2>
      <p>O NEXO permite registrar produtos, vendas, clientes, contas a receber (fiado), despesas e relatórios. Os recursos disponíveis dependem do plano contratado (Start, Pro ou Black), conforme descrito na tela Planos dentro do sistema.</p>

      <h2>2. Conta e acesso</h2>
      <ul>
        <li>Você é responsável pelas informações cadastradas e por manter sua senha em segurança.</li>
        <li>O dono da loja pode convidar outras pessoas (vendedores e gerentes) e é responsável pelo que elas fazem na conta da loja.</li>
        <li>É proibido usar o NEXO para atividades ilegais ou para tentar acessar dados de outras lojas.</li>
      </ul>

      <h2>3. Teste grátis, planos e pagamento</h2>
      <ul>
        <li>Lojas novas ganham um período de teste grátis com todos os recursos. O prazo aparece dentro do sistema.</li>
        <li>Depois do teste, para continuar usando, é preciso assinar um plano. A cobrança é mensal e processada pelo Asaas, por Pix, boleto ou cartão.</li>
        <li>O plano é liberado automaticamente após a confirmação do pagamento.</li>
        <li>Se a mensalidade não for paga, o acesso é pausado alguns dias após o vencimento. Seus dados continuam guardados e o acesso volta assim que o pagamento é confirmado.</li>
        <li>Você pode trocar de plano pela tela Planos. Para cancelar a assinatura, fale com a equipe NEXO pelo WhatsApp informado no sistema.</li>
        <li>Os preços podem mudar. Qualquer mudança é avisada com antecedência e vale a partir da cobrança seguinte.</li>
      </ul>

      <h2>4. Seus dados</h2>
      <p>Os dados que você cadastra (produtos, vendas, clientes) são seus. Você pode baixá-los a qualquer momento em Planilhas. O tratamento de dados pessoais segue a nossa <Link to="/privacidade" className="text-brand-700 underline">Política de privacidade</Link>.</p>

      <h2>5. Disponibilidade e responsabilidade</h2>
      <ul>
        <li>Trabalhamos para manter o NEXO no ar e funcionando, mas podem ocorrer instabilidades e manutenções.</li>
        <li>O NEXO é uma ferramenta de apoio à gestão. Os números mostrados dependem das informações registradas por você. Decisões financeiras, fiscais e contábeis são de responsabilidade do negócio. O NEXO não emite nota fiscal e não substitui um contador.</li>
        <li>Recomendamos baixar um backup em planilha periodicamente.</li>
      </ul>

      <h2>6. Encerramento</h2>
      <p>Você pode parar de usar o NEXO quando quiser. Podemos suspender contas que violem estes termos. Se o serviço for encerrado, avisaremos com antecedência para que você possa baixar seus dados.</p>

      <h2>7. Contato</h2>
      <p>Dúvidas sobre estes termos: fale com a equipe NEXO pelo WhatsApp disponível na tela Planos do sistema.</p>
    </Pagina>
  )
}

export function Privacidade() {
  return (
    <Pagina titulo="Política de privacidade do NEXO">
      <p>Esta política explica quais dados o NEXO coleta, para que usa e como você pode exercer seus direitos, conforme a Lei Geral de Proteção de Dados (LGPD, Lei 13.709/2018).</p>

      <h2>1. Dados que coletamos</h2>
      <ul>
        <li><strong>Da sua conta:</strong> nome, e-mail e senha (guardada de forma criptografada).</li>
        <li><strong>Da sua loja:</strong> nome, segmento e as respostas do questionário inicial.</li>
        <li><strong>Para a cobrança:</strong> nome e CPF ou CNPJ do responsável, enviados ao Asaas para emitir a cobrança. Não guardamos dados de cartão.</li>
        <li><strong>O que você registra:</strong> produtos, vendas, despesas e dados dos seus clientes (como nome, telefone e aniversário).</li>
      </ul>

      <h2>2. Para que usamos</h2>
      <ul>
        <li>Para fazer o sistema funcionar e mostrar seus relatórios.</li>
        <li>Para cobrar a assinatura e liberar o plano.</li>
        <li>Para dar suporte e avisar sobre mudanças importantes no serviço.</li>
      </ul>
      <p>Não vendemos seus dados e não usamos os dados dos seus clientes para outra finalidade.</p>

      <h2>3. Dados dos seus clientes</h2>
      <p>Quando você cadastra seus clientes no NEXO, a sua loja é a responsável por esses dados (controladora), e o NEXO apenas os guarda e processa para você (operador). Cadastre somente o necessário e informe seus clientes quando for o caso.</p>

      <h2>4. Com quem compartilhamos</h2>
      <p>Usamos serviços de terceiros para operar o NEXO:</p>
      <ul>
        <li><strong>Supabase:</strong> banco de dados e login.</li>
        <li><strong>Vercel:</strong> hospedagem do site.</li>
        <li><strong>Asaas:</strong> processamento dos pagamentos da assinatura.</li>
      </ul>
      <p>Esses serviços podem armazenar dados fora do Brasil, com medidas de segurança próprias.</p>

      <h2>5. Segurança</h2>
      <p>O acesso é protegido por senha, e cada loja só enxerga os próprios dados. Dentro da loja, cada pessoa vê apenas o que o seu cargo permite.</p>

      <h2>6. Seus direitos</h2>
      <p>Você pode pedir para acessar, corrigir, baixar ou excluir seus dados. Boa parte pode ser feita no próprio sistema, como editar cadastros e baixar planilhas. Para os demais pedidos, fale com a equipe NEXO pelo WhatsApp informado na tela Planos.</p>

      <h2>7. Por quanto tempo guardamos</h2>
      <p>Enquanto sua conta estiver ativa. Se você pedir a exclusão, apagamos os dados, exceto o que a lei obriga a manter, como registros de pagamento.</p>

      <h2>8. Mudanças</h2>
      <p>Se esta política mudar, a data no topo é atualizada e as mudanças importantes são avisadas no sistema.</p>
    </Pagina>
  )
}
