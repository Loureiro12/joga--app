import { WHOAMI_CATEGORIES, type Identity, type IdentityKind, type WhoamiDifficulty } from './whoami-types';

/**
 * Banco de identidades do "Quem Sou Eu?".
 *
 * ## Por que este banco é o motor, e a IA é a válvula
 *
 * Identidade famosa **não envelhece**: Homem-Aranha é Homem-Aranha para sempre. Isso muda a
 * economia em relação à bomba, cujo baralho precisava de variedade a cada rodada. Aqui cada
 * jogador recebe UMA identidade por rodada — 8 pessoas × 5 rodadas = 40 por partida. Com 168
 * identidades e a memória de "já vistos", são quatro partidas inteiras sem repetir nada, e depois
 * a degradação é lenta.
 *
 * Então a geração por IA (`whoami-content.ts`) existe para três casos, não para o jogo normal:
 * categoria única marcada, modo Hardcore (que pede identidade específica) e grupo que já jogou
 * muito. A maioria das turmas nunca dispara uma chamada.
 *
 * ## O formato
 *
 * Uma linha por identidade, expandida pelo construtor `grupo`. Não é economia de estilo: o objeto
 * explícito com oito campos daria ~1.400 linhas para o mesmo conteúdo, e um banco que ninguém
 * consegue ler de cima a baixo é um banco que ninguém revisa.
 *
 * ## Critérios
 *
 * - 14 categorias × 12 identidades, com 4 `facil`, 5 `medio` e 3 `dificil` em cada. O Hardcore
 *   joga só com as `dificil`, então essas três por categoria são o piso dele.
 * - **Nenhuma dica contém o nome nem um alias.** É a regra que mais importa: uma dica que
 *   entrega o nome não é uma dica fraca, é o jogo estragado. Há teste garantindo.
 * - Dica 2 é característica; dica 3 é quase entrega, mas sem dizer o nome.
 * - Só gente pública. Pessoa privada nunca — nem nas dicas.
 * - Nada de doença, morte, crime, violência, bebida, sexo ou política partidária. Figura histórica
 *   entra pelo que construiu, não pelo que destruiu.
 * - Mistura brasileira e internacional de propósito: o grupo é brasileiro, e metade da graça está
 *   em reconhecer o que é de casa.
 */

type Extra = { kind?: IdentityKind; br?: true };

/** `[nome, emoji, dificuldade, aliases separados por vírgula, dica 2, dica 3, extra?]` */
type Linha = [string, string, WhoamiDifficulty, string, string, string, Extra?];

const slug = (nome: string): string =>
  nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

function grupo(category: (typeof WHOAMI_CATEGORIES)[number], kindPadrao: IdentityKind, linhas: Linha[]): Identity[] {
  return linhas.map(([name, emoji, difficulty, aliases, dica2, dica3, extra]) => ({
    id: slug(name),
    name,
    emoji,
    category,
    difficulty,
    kind: extra?.kind ?? kindPadrao,
    ...(extra?.br ? { br: true as const } : {}),
    aliases: aliases
      .split(',')
      .map((a) => a.trim())
      .filter(Boolean),
    hints: [dica2, dica3] as [string, string],
  }));
}

const CELEBRIDADES = grupo('Celebridades', 'pessoa', [
  ['Silvio Santos', '📺', 'facil', 'Silvio', 'Apresentei programas de auditório por décadas e tinha um jeito inconfundível de falar com a plateia.', 'Ficou famoso eu distribuir dinheiro e até avião para quem estava assistindo.', { br: true }],
  ['Xuxa', '👑', 'facil', 'Xuxa Meneghel, Maria da Graça', 'Apresentei programa infantil de manhã e tinha um time de dançarinas comigo.', 'Me chamavam de rainha dos baixinhos.', { br: true }],
  ['Faustão', '🎤', 'facil', 'Fausto Silva, Fausto', 'Comandei um programa de domingo na televisão por mais de trinta anos.', 'Virou bordão meu gritar "olha o respeito" quando a plateia passava do ponto.', { br: true }],
  ['Luciano Huck', '🚁', 'facil', 'Huck', 'Apresento televisão e sou casado com outra apresentadora famosa.', 'Fiquei conhecido por descer de helicóptero para reformar a casa de alguém.', { br: true }],
  ['Ana Maria Braga', '☕', 'medio', 'Ana Maria', 'Apresento um programa de manhã e cozinho ao vivo quase todo dia.', 'Tenho uma arara que participa do programa comigo.', { br: true }],
  ['Oprah Winfrey', '🎙️', 'medio', 'Oprah', 'Apresentei um dos programas de entrevista mais vistos do mundo.', 'Ficou famoso eu dar um carro para cada pessoa da plateia de uma vez.'],
  ['Elon Musk', '🚀', 'medio', 'Musk', 'Mando em empresas de carro elétrico e de foguete.', 'Comprei uma rede social muito grande e mudei o nome dela para uma letra só.'],
  ['Dwayne Johnson', '💪', 'medio', 'The Rock, Rock', 'Fui lutador de ringue antes de virar ator de filmes de ação.', 'Meu apelido no ringue era o nome de uma pedra.'],
  ['Kim Kardashian', '💅', 'medio', 'Kim', 'Ficou famosa a minha família inteira por causa de um reality show.', 'Virei empresária de maquiagem e roupa de modelar.'],
  ['Angélica', '✨', 'dificil', 'Angelica Ksyvickis', 'Apresentei programa infantil nos anos noventa e também cantava.', 'Sou casada com um apresentador que faz reforma de casas.', { br: true }],
  ['Bill Gates', '💻', 'dificil', 'Gates', 'Fundei uma empresa de programas de computador que virou gigante.', 'Hoje cuido mais da minha fundação de caridade do que de tecnologia.'],
  ['Eliana', '🌟', 'dificil', 'Eliana Michaelichen', 'Apresentei programa de domingo voltado para criança e família.', 'Comecei cantando numa dupla antes de virar apresentadora de televisão.', { br: true }],
]);

const FILMES = grupo('Personagens de filmes', 'personagem', [
  ['Homem-Aranha', '🕷️', 'facil', 'Spider-Man, Spiderman, Peter Parker, Aranha', 'Ganhei meus poderes depois da picada de um bicho pequeno.', 'Me balanço entre prédios usando fios grudentos que saem do meu pulso.'],
  ['Batman', '🦇', 'facil', 'Bruce Wayne, Homem-Morcego', 'Sou milionário de dia e saio à noite de capa preta.', 'Moro numa cidade cinzenta e meu carro é todo blindado.'],
  ['Shrek', '🧅', 'facil', 'Sherek', 'Sou verde, grandalhão e meio rabugento.', 'Moro num pântano e meu melhor amigo é um burro falante.'],
  ['Harry Potter', '⚡', 'facil', 'Harry', 'Estudei numa escola de magia e uso óculos redondos.', 'Tenho uma cicatriz em forma de raio na testa.'],
  ['Darth Vader', '🖤', 'medio', 'Vader, Anakin Skywalker', 'Uso uma armadura preta e minha respiração é barulhenta.', 'Luto com uma espada de luz vermelha e sou pai do herói da história.'],
  ['Jack Sparrow', '🏴‍☠️', 'medio', 'Capitão Jack Sparrow, Sparrow', 'Ando sempre meio cambaleante e falo enrolado.', 'Sou capitão de um navio e uso uma bússola que não aponta o norte.'],
  ['Rocky Balboa', '🥊', 'medio', 'Rocky', 'Treinei subindo escadas e bebendo ovo cru.', 'Lutei boxe sem ninguém acreditar em mim, na cidade da Filadélfia.'],
  ['Indiana Jones', '🤠', 'medio', 'Indy, Indiana', 'Sou professor, mas passo mais tempo caçando tesouro do que dando aula.', 'Ando de chapéu de aba larga e uso um chicote.'],
  ['Hermione Granger', '📚', 'medio', 'Hermione', 'Sou a mais estudiosa da minha turma numa escola de magia.', 'Ando sempre com dois amigos meninos e sei mais feitiço que os dois juntos.'],
  ['Coringa', '🃏', 'dificil', 'Joker, Palhaço', 'Pinto o rosto de branco e tenho um riso que arrepia.', 'Sou o maior inimigo do herói de capa preta que parece um morcego.'],
  ['Gollum', '💍', 'dificil', 'Smeagol', 'Sou magrelo, pálido e falo de mim mesmo na terceira pessoa.', 'Chamo um anel de "meu precioso".'],
  ['Mulher-Maravilha', '🛡️', 'dificil', 'Wonder Woman, Diana Prince', 'Vim de uma ilha só de guerreiras e tenho um laço mágico.', 'Uso dois braceletes que param tudo que vem na minha direção.'],
]);

const SERIES = grupo('Personagens de séries', 'personagem', [
  ['Chaves', '🛢️', 'facil', 'Chavo, El Chavo', 'Moro num barril no meio de uma vila.', 'Minha comida favorita é sanduíche de presunto e vivo levando cascudo.'],
  ['Seu Madruga', '🔨', 'facil', 'Madruga, Don Ramon', 'Devo quatorze meses de aluguel e vivo fugindo do dono da vila.', 'Uso boina, tenho uma filha e minha frase é "foi sem querer querendo" — mas não dita por mim.'],
  ['Sheldon Cooper', '🧪', 'facil', 'Sheldon', 'Sou físico, genial e não entendo quase nada de gente.', 'Tenho um lugar fixo no sofá e bato três vezes na porta chamando o nome da vizinha.'],
  ['Ross Geller', '🦕', 'facil', 'Ross', 'Sou cientista de dinossauro e já casei e descasei várias vezes.', 'Grito "nós estávamos dando um tempo" para me defender numa briga de namoro.'],
  ['Joey Tribbiani', '🍕', 'medio', 'Joey', 'Sou ator, meio bobo e apaixonado por comida.', 'Minha cantada é olhar e dizer "como vai você?" de um jeito arrastado.'],
  ['Jon Snow', '🐺', 'medio', 'Jon', 'Guardo uma muralha de gelo gigante no norte.', 'Vivem dizendo que eu não sei nada, e tenho um lobo branco enorme.'],
  ['Michael Scott', '📎', 'medio', 'Michael', 'Sou chefe de um escritório de papel e me acho hilário.', 'Gravo um documentário sem perceber o quanto passo vergonha nele.'],
  ['Chapolin Colorado', '🔴', 'medio', 'Chapolin, Polegar Vermelho', 'Visto vermelho, tenho um coração no peito e sou medroso.', 'Carrego uma marreta e uma pílula que me deixa minúsculo.'],
  ['Eleven', '🧇', 'medio', 'Onze, Jane Hopper, El', 'Fui cobaia de um laboratório e tenho poderes com a mente.', 'Adoro waffle e meu nome é um número.'],
  ['Dona Florinda', '👠', 'dificil', 'Florinda', 'Acho que sou fina demais para o lugar onde moro.', 'Chamo meu filho de "tesouro" e tenho horror a um vizinho que vive sem trabalhar.'],
  ['Daenerys Targaryen', '🐉', 'dificil', 'Daenerys, Khaleesi, Dany', 'Tenho cabelo branco e três bichos gigantes que cospem fogo.', 'Junto uma lista enorme de títulos antes de dizer meu nome.'],
  ['Barney Stinson', '👔', 'dificil', 'Barney', 'Uso terno todos os dias e tenho um manual de regras para tudo.', 'Minha palavra favorita é "lendário" e vivo arrastando meu amigo para a balada.'],
]);

const DESENHOS = grupo('Desenhos animados', 'personagem', [
  ['Mickey Mouse', '🐭', 'facil', 'Mickey', 'Uso luva branca, calça vermelha e tenho orelhas redondas enormes.', 'Sou o símbolo do maior parque de diversões do mundo.', { kind: 'animal' }],
  ['Bob Esponja', '🧽', 'facil', 'SpongeBob, Esponja', 'Moro no fundo do mar dentro de um abacaxi.', 'Trabalho fritando hambúrguer e meu melhor amigo é uma estrela-do-mar.'],
  ['Homer Simpson', '🍩', 'facil', 'Homer', 'Sou amarelo, careca e barrigudo.', 'Trabalho numa usina, adoro rosquinha e solto um "doh" quando faço bobagem.'],
  ['Cebolinha', '🧅', 'facil', 'Ceboinha', 'Tenho cinco fios de cabelo na cabeça e troco o R pelo L quando falo.', 'Vivo bolando plano infalível para tomar o coelho azul de uma menina.', { br: true }],
  ['Scooby-Doo', '🐕', 'medio', 'Scooby, Scooby Doo', 'Sou um cachorro grande, medroso e falante.', 'Ando numa van colorida resolvendo mistério de fantasma por um biscoito.', { kind: 'animal' }],
  ['Pernalonga', '🥕', 'medio', 'Bugs Bunny', 'Sou cinza, tenho orelhas compridas e mastigo cenoura.', 'Pergunto "o que é que há, velhinho?" para quem tenta me caçar.', { kind: 'animal' }],
  ['Mônica', '🐰', 'medio', 'Monica', 'Sou dentuça, baixinha e muito forte.', 'Bato com um coelho de pelúcia em quem me provoca e sou dona da rua.', { br: true }],
  ['Chico Bento', '🎣', 'medio', 'Chico', 'Moro na roça, ando descalço e uso chapéu de palha.', 'Falo "uai" e vivo pescando ou roubando goiaba do vizinho.', { br: true }],
  ['Patrick Estrela', '⭐', 'medio', 'Patrick', 'Sou rosa, moro embaixo de uma pedra no fundo do mar.', 'Sou o melhor amigo de uma esponja amarela que fala muito.', { kind: 'animal' }],
  ['Pica-Pau', '🪶', 'dificil', 'Pica Pau, Woody Woodpecker', 'Sou um pássaro azul com topete vermelho.', 'Minha marca é uma risada escandalosa em cinco notas.', { kind: 'animal' }],
  ['Zé Colmeia', '🧺', 'dificil', 'Ze Colmeia, Yogi', 'Sou um urso de gravata e chapéu que mora num parque.', 'Vivo roubando cesta de piquenique com a ajuda de um ursinho menor.', { kind: 'animal' }],
  ['Tom', '🐈', 'dificil', 'Tom Cat', 'Sou um gato azulado que nunca consegue o que quer.', 'Passo o dia inteiro correndo atrás de um rato esperto e sempre me dou mal.', { kind: 'animal' }],
]);

const ANIMAIS = grupo('Animais', 'animal', [
  ['Leão', '🦁', 'facil', 'Leao', 'Vivo na savana e o macho da minha espécie tem uma juba enorme.', 'Me chamam de rei da floresta mesmo eu não morando em floresta.'],
  ['Elefante', '🐘', 'facil', '', 'Sou o maior animal que anda em terra firme.', 'Uso meu nariz comprido para beber água e tomar banho.'],
  ['Pinguim', '🐧', 'facil', '', 'Sou preto e branco e ando meio desengonçado.', 'Vivo no gelo, não consigo voar, mas nado muito bem.'],
  ['Girafa', '🦒', 'facil', '', 'Sou o animal mais alto que existe.', 'Alcanço folha no alto da árvore sem precisar subir nela.'],
  ['Golfinho', '🐬', 'medio', '', 'Vivo no mar, mas respiro ar como você.', 'Me acham muito inteligente e vivo saltando perto dos barcos.'],
  ['Canguru', '🦘', 'medio', '', 'Ando aos pulos e tenho uma cauda grossa de equilíbrio.', 'Carrego meu filhote numa bolsa na barriga e sou símbolo da Austrália.'],
  ['Preguiça', '🦥', 'medio', 'Preguica', 'Faço tudo muito devagar e vivo pendurado de cabeça para baixo.', 'Desço da árvore uma vez por semana só para fazer minhas necessidades.'],
  ['Capivara', '🦫', 'medio', '', 'Sou o maior roedor do mundo e adoro água.', 'No Brasil me acham a criatura mais tranquila que existe e todo bicho senta em cima de mim.', { br: true }],
  ['Polvo', '🐙', 'medio', '', 'Tenho oito braços e nenhum osso no corpo.', 'Solto tinta para escapar e tenho três corações.'],
  ['Camaleão', '🦎', 'dificil', 'Camaleao', 'Mudo de cor conforme o lugar onde estou.', 'Meus olhos giram para lados diferentes ao mesmo tempo e minha língua é mais comprida que meu corpo.'],
  ['Tucano', '🦜', 'dificil', '', 'Sou um pássaro colorido de bico gigante e leve.', 'Apareço muito em foto da Amazônia e meu bico é maior que o resto da cabeça.', { br: true }],
  ['Ornitorrinco', '🦆', 'dificil', '', 'Pareço um bicho montado com peça de outros bichos.', 'Tenho bico de pato, cauda de castor, ponho ovo e ainda sou mamífero.'],
]);

const PROFISSOES = grupo('Profissões', 'profissao', [
  ['Médico', '🩺', 'facil', 'Medico, Doutor', 'Visto branco no trabalho e as pessoas me procuram quando não estão bem.', 'Uso um aparelho no pescoço para escutar o peito de quem me procura.'],
  ['Professor', '📏', 'facil', 'Professora', 'Passo o dia explicando coisa para quem não quer ouvir.', 'Escrevo no quadro e corrijo prova no fim de semana.'],
  ['Bombeiro', '🚒', 'facil', '', 'Trabalho de capacete e desço por um poste.', 'Chego de caminhão vermelho com sirene quando tem fogo.'],
  ['Piloto', '✈️', 'facil', 'Piloto de avião, Comandante', 'Trabalho uniformizado e passo o dia longe do chão.', 'Falo com os passageiros pelo alto-falante antes de decolar.'],
  ['Padeiro', '🥖', 'medio', 'Padeira', 'Começo a trabalhar de madrugada, quando todo mundo dorme.', 'Minha loja cheira bem de manhã e vendo pão quentinho às seis.'],
  ['Dentista', '🦷', 'medio', '', 'Quase ninguém gosta de marcar hora comigo.', 'Peço para a pessoa abrir bem a boca e uso uma luz forte.'],
  ['Jardineiro', '🌱', 'medio', 'Jardineira', 'Trabalho ao ar livre e sujo a mão de terra.', 'Corto grama, rego planta e deixo o quintal bonito.'],
  ['Astronauta', '👨‍🚀', 'medio', '', 'Treino anos para trabalhar poucos dias.', 'Visto uma roupa branca pesada e flutuo no meu local de trabalho.'],
  ['Palhaço', '🤡', 'medio', 'Palhaco', 'Trabalho fazendo os outros rirem e pinto o rosto para isso.', 'Uso sapato enorme e nariz vermelho debaixo de uma lona de circo.'],
  ['Garçom', '🍽️', 'dificil', 'Garcom, Garçonete', 'Passo o turno em pé, andando de um lado para o outro.', 'Anoto o que você quer comer e equilibro bandeja entre as mesas.'],
  ['Veterinário', '🐾', 'dificil', 'Veterinario, Veterinária', 'Meus pacientes nunca conseguem me dizer onde dói.', 'Atendo cachorro, gato e às vezes um bicho bem maior.'],
  ['Arquiteto', '📐', 'dificil', 'Arquiteta', 'Desenho no computador coisa que outras pessoas vão construir.', 'Faço a planta da casa antes de qualquer tijolo ser assentado.'],
]);

const OBJETOS = grupo('Objetos', 'objeto', [
  ['Geladeira', '🧊', 'facil', '', 'Fico na cozinha e trabalho ligado dia e noite.', 'Você abre minha porta dez vezes por dia procurando algo que não está aqui.'],
  ['Guarda-chuva', '☂️', 'facil', 'Guarda chuva, Sombrinha', 'Só me lembram quando o tempo fecha.', 'Abro quando começa a cair água do céu e viro do lado errado quando dá vento.'],
  ['Escova de dentes', '🪥', 'facil', 'Escova', 'Me usam duas vezes por dia, de manhã e à noite.', 'Trabalho junto com uma pasta de menta dentro da sua boca.'],
  ['Chinelo', '🩴', 'facil', 'Chinelos, Sandália', 'Sou o que o brasileiro mais calça em casa.', 'Faço barulho de arrastar no chão e sou o uniforme da praia.', { br: true }],
  ['Travesseiro', '🛏️', 'medio', '', 'Você passa um terço da vida em cima de mim.', 'Fico na cabeceira e de manhã às vezes apareço no chão.'],
  ['Ventilador', '💨', 'medio', '', 'Giro parado no mesmo lugar e faço barulho.', 'No verão disputo espaço com o ar-condicionado e perco.'],
  ['Bicicleta', '🚲', 'medio', 'Bike', 'Tenho duas rodas e nenhum motor.', 'Você aprendeu a me usar caindo algumas vezes quando era criança.'],
  ['Vassoura', '🧹', 'medio', '', 'Fico atrás da porta e só saio quando tem sujeira.', 'Na história de bruxa eu sirvo de transporte.'],
  ['Espelho', '🪞', 'medio', '', 'Mostro a verdade sem falar nada.', 'Na história da Branca de Neve me perguntam quem é a mais bela.'],
  ['Micro-ondas', '⏲️', 'dificil', 'Microondas, Micro ondas', 'Fico na bancada e aviso com um apito quando termino.', 'Esquento sua comida em três minutos e nunca por igual.'],
  ['Controle remoto', '📺', 'dificil', 'Controle', 'Sou a coisa que mais desaparece numa sala.', 'Vivo entre as almofadas do sofá e todo mundo briga por mim.'],
  ['Chave', '🔑', 'dificil', 'Chaves', 'Sou pequena e todo mundo me perde na hora errada.', 'Sem mim você fica parado do lado de fora da sua própria casa.'],
]);

const COMIDAS = grupo('Comidas', 'comida', [
  ['Pizza', '🍕', 'facil', '', 'Sou redonda, mas me cortam em triângulo.', 'Chego de moto e a briga é sempre por causa do abacaxi em cima de mim.'],
  ['Brigadeiro', '🍫', 'facil', '', 'Não existe festa de criança sem mim.', 'Sou de chocolate, enrolado na mão e coberto de granulado.', { br: true }],
  ['Coxinha', '🍗', 'facil', '', 'Me vendem em padaria e lanchonete em qualquer esquina.', 'Tenho massa por fora, frango por dentro e formato de gota.', { br: true }],
  ['Pipoca', '🍿', 'facil', '', 'Faço barulho antes de estar pronta.', 'Sou obrigatória no cinema e estouro no fogo ou no micro-ondas.'],
  ['Feijoada', '🍲', 'medio', '', 'Sou pesada, demorada e peço um cochilo depois.', 'Me comem no sábado, com couve, farofa e laranja do lado.', { br: true }],
  ['Açaí', '🥣', 'medio', 'Acai', 'Venho do norte do Brasil e sou roxo escuro.', 'No sul do país me servem doce e gelado, com granola e banana.', { br: true }],
  ['Pão de queijo', '🧆', 'medio', 'Pao de queijo', 'Sou mineiro de origem e saio quentinho do forno.', 'Sou pequeno, redondo, oco por dentro e feito de polvilho.', { br: true }],
  ['Sushi', '🍣', 'medio', '', 'Vim do Japão e às vezes me comem crua.', 'Me enrolam com arroz e uma folha escura do mar.'],
  ['Tapioca', '🫓', 'medio', '', 'Sou branca, fina e me fazem na chapa na hora.', 'Me dobram no meio com recheio doce ou salgado e sou do nordeste.', { br: true }],
  ['Bolo de cenoura', '🥕', 'dificil', 'Bolo de cenoura com chocolate', 'Sou laranja por dentro e ninguém percebe o legume que tem em mim.', 'Levo cobertura de chocolate em cima e sou o mais discreto das festas de aniversário.'],
  ['Estrogonofe', '🍚', 'dificil', 'Strogonoff, Estrogonofe de frango', 'Sou cremoso e me servem com arroz e batata palha.', 'Tenho creme de leite, tomate e, às vezes, champignon.'],
  ['Cuscuz', '🌽', 'dificil', '', 'Me fazem no vapor e sou de milho.', 'No nordeste me comem no café da manhã, com manteiga ou ovo em cima.', { br: true }],
]);

const MARCAS = grupo('Marcas', 'marca', [
  ['Coca-Cola', '🥤', 'facil', 'Coca, Coca Cola', 'Sou vermelha e branca e estou em quase todo país do mundo.', 'Minha receita é segredo e o Papai Noel de hoje tem a minha cor por minha causa.'],
  ['Nike', '👟', 'facil', '', 'Faço tênis e roupa de esporte.', 'Meu símbolo é um risco curvo e meu lema manda você simplesmente fazer.'],
  ["McDonald's", '🍟', 'facil', 'McDonalds, Mc Donalds, McDonald', 'Tenho loja em quase toda cidade grande.', 'Meu símbolo é um M amarelo gigante e meu lanche mais famoso tem dois andares.'],
  ['Havaianas', '🩴', 'facil', 'Havaiana', 'Sou brasileira e o mundo inteiro me usa no pé.', 'Meu slogan dizia que eu não solto, não deformo e não tem cheiro.', { br: true }],
  ['Netflix', '🎬', 'medio', '', 'Você me paga todo mês e passa meia hora decidindo o que ver.', 'Meu som de abertura é um tum-dum e sou vermelha e preta.'],
  ['Apple', '🍎', 'medio', 'Maçã', 'Faço telefone, computador e fone sem fio.', 'Meu símbolo é uma fruta mordida.'],
  ['Lego', '🧱', 'medio', '', 'Sou dinamarquesa e brinquedo de montar.', 'Pisar em mim descalço no meio da noite é a pior dor que existe.'],
  ['Ferrari', '🏎️', 'medio', '', 'Sou italiana e meu nome é sinônimo de carro caro.', 'Minha cor é vermelha e meu símbolo é um cavalo empinado.'],
  ['Google', '🔎', 'medio', '', 'Você me usa várias vezes por dia sem pensar.', 'Meu nome virou verbo para procurar qualquer coisa.'],
  ['Adidas', '👕', 'dificil', '', 'Sou alemã e também faço material de esporte.', 'Meu símbolo tem três listras e meu rival tem um risco curvo.'],
  ['Nutella', '🍞', 'dificil', '', 'Sou italiana, marrom e vendida em pote de vidro.', 'Tenho avelã e chocolate, e ninguém consegue comer uma colher só.'],
  ['Spotify', '🎧', 'dificil', '', 'Sou sueca e você me ouve todo dia.', 'Sou verde e no fim do ano mostro para todo mundo o que você andou escutando.'],
]);

const FUTEBOL = grupo('Jogadores de futebol', 'pessoa', [
  ['Pelé', '👑', 'facil', 'Pele, Edson Arantes', 'Joguei no Santos e sou considerado o maior de todos.', 'Ganhei três Copas do Mundo e me chamam de rei.', { br: true }],
  ['Neymar', '⚽', 'facil', 'Neymar Jr, Ney', 'Saí do Santos para a Europa por um valor recorde.', 'Me acusam de cair fácil dentro de campo e já joguei na Espanha e na França.', { br: true }],
  ['Messi', '🐐', 'facil', 'Lionel Messi, Leo Messi', 'Sou argentino, baixinho e canhoto.', 'Passei a vida num clube só da Espanha e finalmente ganhei a Copa em 2022.'],
  ['Cristiano Ronaldo', '💪', 'facil', 'CR7, Ronaldo', 'Sou português e obcecado por treino.', 'Meu apelido junta minhas iniciais com o número da minha camisa.'],
  ['Ronaldinho Gaúcho', '😁', 'medio', 'Ronaldinho, Ronaldinho Gaucho', 'Jogava rindo e inventava drible que ninguém esperava.', 'Meu gol de falta no Inglês entrou por cima do goleiro que saiu do lugar.', { br: true }],
  ['Marta', '🔟', 'medio', 'Marta Silva', 'Sou brasileira e a maior da história do meu esporte no feminino.', 'Ganhei o prêmio de melhor do mundo seis vezes e peço para as meninas não desistirem.', { br: true }],
  ['Ronaldo', '🦷', 'medio', 'Ronaldo Fenômeno, Fenômeno, Ronaldo Nazário', 'Fui atacante, levei duas cirurgias no joelho e voltei.', 'Na Copa de 2002 apareci com um corte de cabelo estranho e marquei oito gols.', { br: true }],
  ['Zico', '🎩', 'medio', 'Arthur Antunes Coimbra', 'Joguei no Flamengo e me chamavam de galinho.', 'Era o melhor de falta da minha época e nunca ganhei uma Copa.', { br: true }],
  ['Mbappé', '🚀', 'medio', 'Mbappe, Kylian Mbappe', 'Sou francês, muito rápido e virei capitão da seleção ainda jovem.', 'Fiz três gols numa final de Copa e ainda perdi.'],
  ['Garrincha', '🦵', 'dificil', 'Mané Garrincha, Mane Garrincha', 'Tinha as pernas tortas e driblava o mesmo lado toda vez.', 'Me chamavam de alegria do povo e ganhei Copa jogando ao lado do rei.', { br: true }],
  ['Kaká', '🙏', 'dificil', 'Kaka, Ricardo Izecson', 'Jogava de meia, no Milan, e apontava para o céu quando marcava.', 'Fui o último brasileiro a ganhar o prêmio de melhor do mundo.', { br: true }],
  ['Romário', '🐸', 'dificil', 'Romario', 'Era baixinho, atacante e genial na pequena área.', 'Fui o craque da Copa de 1994 e hoje sou político.', { br: true }],
]);

const MUSICA = grupo('Cantores e artistas', 'pessoa', [
  ['Anitta', '💃', 'facil', '', 'Sou carioca e canto em três idiomas.', 'Saí do funk para o pop e fui a primeira brasileira a ser indicada ao Grammy na minha categoria.', { br: true }],
  ['Ivete Sangalo', '🎺', 'facil', 'Ivete', 'Sou baiana e canto em cima de trio elétrico.', 'Meu show no Maracanã virou DVD e eu grito "arrasta a sandália" no carnaval.', { br: true }],
  ['Michael Jackson', '🕺', 'facil', 'Michael', 'Usava luva branca de um lado só.', 'Inventei um passo de andar para trás parecendo que desliza.'],
  ['Roberto Carlos', '🚢', 'facil', 'Roberto, Rei Roberto Carlos', 'Canto romântico há mais de sessenta anos.', 'Faço um especial de fim de ano na TV e minha cor é o azul.', { br: true }],
  ['Beyoncé', '🐝', 'medio', 'Beyonce', 'Comecei num grupo de meninas antes de seguir sozinha.', 'Meus fãs se chamam colmeia e eu sou tratada como rainha do pop atual.'],
  ['Caetano Veloso', '🎸', 'medio', 'Caetano', 'Sou baiano e fui exilado por causa da minha música.', 'Criei um movimento que misturava guitarra elétrica com música brasileira.', { br: true }],
  ['Madonna', '🎤', 'medio', '', 'Mudo de visual a cada década e nunca saio de moda.', 'Fiz um show de graça em Copacabana para mais de um milhão de pessoas.'],
  ['Taylor Swift', '✍️', 'medio', 'Taylor', 'Escrevo minhas próprias músicas e elas quase sempre falam de quem me magoou.', 'Regravei meus discos antigos para ter o direito deles de volta.'],
  ['Luan Santana', '🤠', 'medio', 'Luan', 'Canto sertanejo e comecei muito novo.', 'Meu primeiro sucesso falava de meter o pé e sou do Mato Grosso do Sul.', { br: true }],
  ['Gilberto Gil', '🪕', 'dificil', 'Gil', 'Sou baiano, fui exilado e depois virei ministro.', 'Criei um movimento musical junto com outro baiano nos anos sessenta.', { br: true }],
  ['Elvis Presley', '🎙️', 'dificil', 'Elvis', 'Tinha topete, costeleta e rebolava no palco.', 'Me chamam de rei do rock e moro numa mansão chamada Graceland.'],
  ['Ludmilla', '🎶', 'dificil', 'Lud', 'Comecei na internet muito jovem com outro nome artístico.', 'Saí do funk para o pagode e fiz um projeto de samba que estourou.', { br: true }],
]);

const GAMES = grupo('Personagens de videogames', 'personagem', [
  ['Mario', '🍄', 'facil', 'Super Mario, Mário', 'Sou italiano, bigodudo e encanador.', 'Visto macacão azul e boné vermelho com M e salvo uma princesa.'],
  ['Pikachu', '⚡', 'facil', '', 'Sou amarelo, pequeno e solto choque.', 'Sou o bichinho mais famoso de um jogo de capturar monstro em bolinha.', { kind: 'animal' }],
  ['Sonic', '💙', 'facil', 'Sonic the Hedgehog', 'Sou azul e corro mais rápido que qualquer um.', 'Junto anel dourado correndo e meu rival é um cientista gordo de bigode.', { kind: 'animal' }],
  ['Lara Croft', '🏺', 'facil', 'Lara', 'Sou exploradora inglesa e vivo em ruína antiga.', 'Ando de short, duas pistolas e rabo de cavalo, caçando tesouro em tumba.'],
  ['Link', '🗡️', 'medio', '', 'Visto verde, uso gorro de bico e não falo nada.', 'Salvo uma princesa cujo nome é o título do meu jogo.'],
  ['Pac-Man', '🟡', 'medio', 'Pacman, Pac Man', 'Sou amarelo, redondo e só tenho boca.', 'Passo o jogo comendo bolinha num labirinto fugindo de quatro fantasmas.'],
  ['Kratos', '🪓', 'medio', '', 'Sou calvo, pálido e tenho uma tatuagem vermelha no corpo.', 'Enfrento deus grego e depois nórdico, e hoje viajo com meu filho.'],
  ['Donkey Kong', '🍌', 'medio', 'DK', 'Sou um gorila enorme de gravata.', 'Toco tambor, junto banana e já fui o vilão do encanador bigodudo.', { kind: 'animal' }],
  ['Zelda', '👸', 'medio', 'Princesa Zelda', 'Sou princesa e meu nome é o título da série.', 'Guardo uma relíquia de três triângulos dourados e sou salva por um rapaz de verde.'],
  ['Crash Bandicoot', '🌀', 'dificil', 'Crash', 'Sou laranja, uso jeans e giro como um pião.', 'Quebro caixa de madeira numa ilha e meu inimigo é um cientista de cabelo maluco.', { kind: 'animal' }],
  ['Steve', '⛏️', 'dificil', 'Steve do Minecraft', 'Sou feito de bloco quadrado e tudo no meu mundo também é.', 'Passo o dia cavando pedra e fugindo de um bicho verde que explode.'],
  ['Yoshi', '🥚', 'dificil', '', 'Sou verde, tenho língua comprida e ponho ovo.', 'Sirvo de montaria para o encanador de boné vermelho.', { kind: 'animal' }],
]);

const LUGARES = grupo('Lugares', 'lugar', [
  ['Paris', '🥐', 'facil', '', 'Sou capital de um país europeu e me chamam de cidade do amor.', 'Tenho uma torre de ferro que é meu símbolo e um museu com a Mona Lisa.'],
  ['Cristo Redentor', '🙌', 'facil', 'Cristo', 'Fico no alto de um morro olhando uma cidade grande.', 'Sou uma estátua de braços abertos no Rio de Janeiro.', { br: true }],
  ['Amazônia', '🌳', 'facil', 'Amazonia, Floresta Amazônica', 'Sou a maior do meu tipo no mundo.', 'Tenho um rio gigante no meio de mim e me chamam de pulmão do planeta.', { br: true }],
  ['Japão', '🗾', 'facil', 'Japao', 'Sou um país de ilhas no outro lado do mundo.', 'Minha bandeira tem um círculo vermelho e meu prato mais famoso leva peixe cru.'],
  ['Nova York', '🗽', 'medio', 'New York, Nova Iorque', 'Me chamam de cidade que nunca dorme.', 'Tenho uma estátua verde de tocha na mão e uma praça cheia de letreiro.'],
  ['Copacabana', '🏖️', 'medio', '', 'Sou uma praia famosa numa cidade grande.', 'Minha calçada tem onda preta e branca e o réveillon aqui tem milhão de pessoa de branco.', { br: true }],
  ['Egito', '🐪', 'medio', '', 'Sou um país de deserto com um rio enorme atravessando.', 'Tenho pirâmide gigante e uma estátua com corpo de leão e cara de gente.'],
  ['Veneza', '🚤', 'medio', '', 'Sou uma cidade italiana sem carro nenhum.', 'Minhas ruas são de água e você me atravessa de barco comprido.'],
  ['Muralha da China', '🧱', 'medio', 'Muralha', 'Fui construída para defender um país do que vinha do norte.', 'Sou tão comprida que levei séculos para ficar de pé.'],
  ['Deserto do Saara', '🏜️', 'dificil', 'Saara, Sahara', 'Sou o maior do meu tipo que é quente.', 'Ocupo o norte da África quase inteiro e sou feito de areia e pedra.'],
  ['Pantanal', '🐊', 'dificil', '', 'Sou a maior planície que alaga no mundo.', 'Fico entre Mato Grosso e Mato Grosso do Sul e sou cheio de jacaré e ave.', { br: true }],
  ['Machu Picchu', '⛰️', 'dificil', 'Machu Pichu', 'Fico no alto de uma montanha na América do Sul.', 'Fui construída por um povo antigo do Peru e ficou escondida por séculos.'],
]);

const HISTORIA = grupo('Personalidades históricas', 'pessoa', [
  ['Albert Einstein', '🧠', 'facil', 'Einstein', 'Sou físico e meu cabelo bagunçado é quase tão famoso quanto meu trabalho.', 'Escrevi uma equação curtinha que todo mundo conhece e ganhei o Nobel.'],
  ['Leonardo da Vinci', '🎨', 'facil', 'Da Vinci, Leonardo', 'Fui pintor, inventor e anotava tudo ao contrário.', 'Pintei o quadro mais visitado do mundo, de uma mulher de sorriso enigmático.'],
  ['Santos Dumont', '🛩️', 'facil', 'Alberto Santos Dumont, Dumont', 'Sou brasileiro e inventei coisa que voa.', 'Fiz meu voo famoso em Paris com um aparelho chamado 14-Bis.', { br: true }],
  ['Cleópatra', '🐍', 'facil', 'Cleopatra', 'Fui rainha de um país de pirâmide, há mais de dois mil anos.', 'Fui a última a governar o Egito antes dos romanos tomarem tudo.'],
  ['Isaac Newton', '🍏', 'medio', 'Newton', 'Sou inglês e inventei metade da matemática que você odiou na escola.', 'Conta a história que entendi a gravidade vendo uma fruta cair da árvore.'],
  ['Marie Curie', '☢️', 'medio', 'Curie', 'Fui a primeira mulher a ganhar o maior prêmio de ciência.', 'Ganhei esse prêmio duas vezes, em duas áreas diferentes, estudando radiação.'],
  ['Gandhi', '🕊️', 'medio', 'Mahatma Gandhi', 'Usava óculos redondos e um pano simples.', 'Libertei a Índia sem levantar a mão para ninguém.'],
  ['Charles Chaplin', '🎩', 'medio', 'Chaplin, Carlitos', 'Fiz todo mundo rir sem dizer uma palavra.', 'Usava cartola, bengala e um bigodinho, no cinema sem som.'],
  ['Tiradentes', '⛓️', 'medio', 'Joaquim José da Silva Xavier', 'Sou brasileiro e tem feriado no meu nome.', 'Liderei um movimento em Minas contra o imposto da coroa portuguesa.', { br: true }],
  ['Dom Pedro I', '📜', 'dificil', 'Pedro I', 'Nasci português e virei brasileiro por escolha.', 'Grito "independência ou morte" na beira de um riacho em São Paulo.', { br: true }],
  ['Frida Kahlo', '🌺', 'dificil', 'Frida', 'Sou mexicana e pintei meu próprio rosto dezenas de vezes.', 'Minha sobrancelha única e as flores no cabelo são minha marca.'],
  ['Galileu Galilei', '🔭', 'dificil', 'Galileu, Galileo', 'Sou italiano e apontei um tubo de lente para o céu.', 'Disse que a Terra girava em volta do Sol e me obrigaram a desdizer.'],
]);

/** O banco inteiro, na ordem das categorias. */
export const IDENTITIES: Identity[] = [
  ...CELEBRIDADES,
  ...FILMES,
  ...SERIES,
  ...DESENHOS,
  ...ANIMAIS,
  ...PROFISSOES,
  ...OBJETOS,
  ...COMIDAS,
  ...MARCAS,
  ...FUTEBOL,
  ...MUSICA,
  ...GAMES,
  ...LUGARES,
  ...HISTORIA,
];
