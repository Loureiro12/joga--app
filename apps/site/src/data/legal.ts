/**
 * Textos legais. Base: handoff do site. ATENÇÃO — REVISÃO JURÍDICA OBRIGATÓRIA ANTES DE PUBLICAR.
 *
 * Dois trechos foram ajustados em relação ao handoff porque descreviam algo que o app NÃO faz
 * (uma política de privacidade com afirmação falsa é pior do que uma que diverge do rascunho):
 *   - Privacidade §2 "Convidados": o handoff dizia que o convidado gera um identificador temporário apagado
 *     ao fim da sala. Na prática o convidado é uma conta anônima que guarda histórico até ser excluída.
 *   - Excluir conta, passo 1: o handoff dizia "confirme com sua senha ou com o login social".
 *     O app confirma numa janela, sem pedir a senha de novo.
 */
export const lastUpdated = '20 de setembro de 2026';

export const privacy = [
  { title: '1. Quem somos', text: 'O Jogaê é um aplicativo de jogos sociais operado por Jogaê Tecnologia Ltda. Esta política explica quais dados coletamos, por quê e o que você pode fazer a respeito. Ela vale para o app (iOS e Android) e para este site.' },
  {
    title: '2. Dados que coletamos',
    text: 'Conta: nome, @username, e-mail e cor de avatar. No login social, recebemos da Apple ou do Google apenas nome e e-mail (o Apple permite ocultar o e-mail real).\nPartidas: salas de que você participou, pontos, conquistas e amizades.\nTécnicos: modelo do aparelho, versão do sistema, versão do app, idioma e logs de erro.\nAssinatura: o status é confirmado pela loja; nunca vemos os dados do seu cartão.\nConvidados: quem joga sem cadastro usa uma conta anônima, sem e-mail. O histórico dessa conta fica guardado até você excluí-la em Configurações — ou passa para a sua conta definitiva, se você se cadastrar.',
  },
  { title: '3. O que não coletamos', text: 'Não usamos a câmera para nada além de ler o QR Code — a imagem não é gravada nem enviada. Não acessamos contatos, localização, microfone, fotos nem histórico de navegação. Não vendemos dados e não exibimos publicidade de terceiros.' },
  { title: '4. Para que usamos', text: 'Criar e manter salas em tempo real, mostrar o placar do grupo, guardar seu histórico e conquistas, processar sua assinatura, corrigir erros e responder ao suporte. Base legal (LGPD): execução do contrato, obrigação legal e legítimo interesse em manter o serviço seguro.' },
  { title: '5. Com quem compartilhamos', text: 'Provedores que operam a infraestrutura em nosso nome: nuvem e banco de dados, processamento de assinatura, envio de e-mails e monitoramento de erros. Eles só podem usar os dados para prestar esse serviço. Também podemos divulgar dados mediante ordem judicial.' },
  { title: '6. Por quanto tempo guardamos', text: 'Enquanto sua conta existir. Salas encerradas são apagadas em 30 dias; o histórico agregado (partidas e pontos) permanece até você excluir a conta. Registros fiscais de assinatura seguem os prazos legais.' },
  { title: '7. Seus direitos', text: 'Você pode acessar, corrigir, portar ou excluir seus dados, revogar consentimentos e pedir explicação sobre qualquer tratamento. Faça isso no app (Perfil → Configurações) ou escreva para privacidade@jogaeapp.com.br. Respondemos em até 15 dias.' },
  { title: '8. Crianças', text: 'O app é destinado a maiores de 12 anos. Não coletamos dados conscientemente de crianças menores. Se identificarmos, apagamos a conta.' },
  { title: '9. Mudanças', text: 'Se mudarmos algo relevante, avisamos no app antes de a alteração valer. A data no topo indica a última versão.' },
];

export const terms = [
  { title: '1. Aceite', text: 'Ao criar uma conta ou usar o Jogaê como convidado, você concorda com estes termos. Se não concordar, não use o app.' },
  { title: '2. Sua conta', text: 'Você precisa ter 12 anos ou mais. Mantenha seus dados verdadeiros e sua senha em segurança. Você responde pelo que acontece na sua conta.' },
  { title: '3. Conduta', text: 'O conteúdo das partidas é criado pelas pessoas na sala. Não use o app para assediar, ameaçar, discriminar ou expor terceiros. Podemos suspender contas que violem esta regra.' },
  { title: '4. Conteúdo gerado por IA', text: 'As sugestões do Premium são geradas automaticamente e podem conter erros ou temas inadequados ao seu grupo. Revise antes de jogar; a responsabilidade pelo uso é de quem cria a sala.' },
  { title: '5. Assinatura', text: 'A cobrança é feita pela App Store ou pelo Google Play, com renovação automática até o cancelamento. Cancele pela própria loja, até 24 horas antes da renovação. Reembolsos seguem as regras da loja.' },
  { title: '6. Propriedade', text: 'A marca Jogaê, as ilustrações, os jogos e o código pertencem a nós. Você recebe uma licença pessoal e intransferível de uso do app.' },
  { title: '7. Disponibilidade', text: 'Fazemos o possível para manter o serviço no ar, mas ele é oferecido "como está". Podemos alterar ou encerrar jogos e funcionalidades, avisando com antecedência razoável.' },
  { title: '8. Foro e contato', text: 'Estes termos seguem a lei brasileira, com foro na comarca de São Paulo/SP. Contato: contato@jogaeapp.com.br.' },
];

export const deletionRows = [
  { icon: '✕', bg: '#EF4444', fg: '#FAFAFA', title: 'Apagados na hora', text: 'Nome, @username, e-mail, cor do avatar, amizades, conquistas e histórico de partidas.' },
  { icon: '✕', bg: '#EF4444', fg: '#FAFAFA', title: 'Apagados em até 30 dias', text: 'Cópias de segurança e logs técnicos que ainda contenham sua conta.' },
  { icon: '~', bg: '#FACC15', fg: '#0F0F13', title: 'Anonimizados', text: 'Pontuações de salas antigas continuam no placar dos outros jogadores como "jogador removido".' },
  { icon: '✓', bg: '#27272F', fg: '#FAFAFA', title: 'Mantidos por lei', text: 'Registros fiscais de assinatura, pelo prazo que a legislação exige.' },
  { icon: '!', bg: '#7C3AED', fg: '#FAFAFA', title: 'Fora do nosso alcance', text: 'A assinatura é cobrada pela loja: cancele na App Store ou no Google Play.' },
];
