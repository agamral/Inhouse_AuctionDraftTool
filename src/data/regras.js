/**
 * Regras e Formato — Copa Inhouse
 * Fonte: regras.txt (organização)
 */

export const REGRAS = [
  {
    id: 'intro',
    tipo: 'intro',
    titulo: {
      pt: 'Inhouse League',
      en: 'Inhouse League',
      es: 'Inhouse League',
    },
    texto: {
      pt: 'A Inhouse League é uma iniciativa da comunidade de Heroes of the Storm que visa trazer uma experiência próxima à do competitivo oficial. Esperamos que os participantes mantenham o respeito entre si e com a equipe da organização. O descumprimento das regras pode resultar em penalidades ou até na remoção do participante do evento.',
      en: 'The Inhouse League is a Heroes of the Storm community initiative aimed at delivering an experience close to official competitive play. We expect all participants to show mutual respect and respect for the organizing team. Rule violations may result in penalties or removal from the event.',
      es: 'La Inhouse League es una iniciativa de la comunidad de Heroes of the Storm que busca ofrecer una experiencia cercana al competitivo oficial. Esperamos que los participantes mantengan el respeto entre sí y con el equipo organizador. El incumplimiento de las reglas puede resultar en sanciones o incluso la expulsión del evento.',
    },
  },
  {
    id: 'inscricoes',
    tipo: 'lista',
    titulo: {
      pt: 'Inscrições',
      en: 'Registration',
      es: 'Inscripciones',
    },
    itens: {
      pt: [
        'As inscrições são individuais, realizadas pelo formulário no site.',
        'Candidatos a capitão serão avaliados pela organização com base em experiência de jogo e comunicação.',
        'Não há restrição de elo — o elo declarado é de responsabilidade do próprio jogador.',
        'Contas smurfs não serão aceitas para garantir que os capitães reconheçam os jogadores durante o leilão e evitar lobbys incompletos por falta de heróis.',
        'Jogadores podem declarar um apelido após a battletag caso não sejam conhecidos pelo nome de conta.',
      ],
      en: [
        'Registrations are individual, submitted through the form on the website.',
        'Captain candidates will be evaluated by the organizers based on gameplay experience and communication skills.',
        'There are no rank restrictions — the declared rank is the player\'s own responsibility.',
        'Smurf accounts will not be accepted, to ensure captains recognize players during the auction and to avoid lobbies collapsing due to missing heroes.',
        'Players may declare a nickname after their battletag if they are not known by their account name.',
      ],
      es: [
        'Las inscripciones son individuales, realizadas a través del formulario en el sitio web.',
        'Los candidatos a capitán serán evaluados por la organización según experiencia de juego y comunicación.',
        'No hay restricciones de elo — el elo declarado es responsabilidad del propio jugador.',
        'No se aceptarán cuentas smurf para garantizar que los capitanes reconozcan a los jugadores durante la subasta y evitar lobbies incompletos.',
        'Los jugadores pueden declarar un apodo después de su battletag si no son conocidos por el nombre de cuenta.',
      ],
    },
  },
  {
    id: 'capitaes',
    tipo: 'lista',
    titulo: {
      pt: 'Capitães',
      en: 'Captains',
      es: 'Capitanes',
    },
    intro: {
      pt: 'A cada 7 jogadores inscritos, 1 vaga de capitão é liberada.',
      en: 'For every 7 registered players, 1 captain slot is unlocked.',
      es: 'Por cada 7 jugadores inscritos, se habilita 1 cupo de capitán.',
    },
    itens: {
      pt: [
        'Capitães coordenam o time: marcam scrims, decidem cara ou coroa, e gerenciam bans e picks de mapas.',
        'Após o leilão, o capitão envia à organização o nome, logo e lista de membros do time.',
        'Capitães utilizam Tickets para remarcar dia e/ou horário de partidas.',
        'Ao remarcar, recomenda-se combinar com o capitão adversário para evitar conflitos de agenda.',
      ],
      en: [
        'Captains coordinate the team: arrange scrims, handle coin flips, and manage map bans and picks.',
        'After the auction, the captain submits the team name, logo, and roster to the organizers.',
        'Captains use Tickets to reschedule match dates and/or times.',
        'When rescheduling, it is recommended to coordinate with the opposing captain to avoid scheduling conflicts.',
      ],
      es: [
        'Los capitanes coordinan al equipo: organizan scrims, deciden el cara o cruz, y gestionan los bans y picks de mapas.',
        'Tras la subasta, el capitán envía a la organización el nombre, logo y lista de miembros del equipo.',
        'Los capitanes usan Tickets para reprogramar el día y/o la hora de sus partidas.',
        'Al reprogramar, se recomienda coordinar con el capitán rival para evitar conflictos de horario.',
      ],
    },
  },
  {
    id: 'conduta',
    tipo: 'lista',
    titulo: {
      pt: 'Regras de Conduta',
      en: 'Code of Conduct',
      es: 'Código de Conducta',
    },
    intro: {
      pt: 'Qualquer conduta inadequada no Discord, nos lobbys, nas partidas ou nos grupos de comunicação será analisada e punida. São consideradas condutas inadequadas:',
      en: 'Any inappropriate behavior in Discord, lobbies, matches, or communication groups will be reviewed and penalized. The following are considered inappropriate conduct:',
      es: 'Cualquier conducta inapropiada en Discord, en los lobbies, en las partidas o en los grupos de comunicación será analizada y sancionada. Se consideran conductas inapropiadas:',
    },
    itens: {
      pt: ['Racismo', 'Homofobia', 'Xenofobia', 'Discriminação de qualquer natureza', 'Discurso de ódio', 'Incitação à violência ou linguagem depreciativa'],
      en: ['Racism', 'Homophobia', 'Xenophobia', 'Discrimination of any kind', 'Hate speech', 'Incitement to violence or derogatory language'],
      es: ['Racismo', 'Homofobia', 'Xenofobia', 'Discriminación de cualquier tipo', 'Discurso de odio', 'Incitación a la violencia o lenguaje despectivo'],
    },
  },
  {
    id: 'atrasos',
    tipo: 'lista',
    titulo: {
      pt: 'Atrasos, Pauses e Desistências',
      en: 'Delays, Pauses & Forfeits',
      es: 'Retrasos, Pausas y Abandonos',
    },
    itens: {
      pt: [
        'Os times têm até 30 minutos de tolerância após o horário marcado. Reservas e substitutos podem ser usados para completar o time.',
        'Cada jogador tem direito a 2 pauses por partida, com tempo total de até 10 minutos somando todos os pauses.',
        'Pauses realizados intencionalmente para prejudicar o adversário serão punidos.',
        'Em caso de desconexão, o jogador tem 10 minutos para reconectar. Após esse prazo, o time pode continuar com Bot ou desistir daquela partida (não da série).',
        'Se o time não estiver completo após 30 minutos, a série é dada ao adversário como W.O.',
      ],
      en: [
        'Teams have up to 30 minutes of tolerance after the scheduled time. Reserves and substitutes may be used to complete the roster.',
        'Each player is allowed 2 pauses per match, with a total time limit of 10 minutes across all pauses.',
        'Pauses used intentionally to disadvantage the opponent will be penalized.',
        'In case of disconnection, the player has 10 minutes to reconnect. After that, the team may continue with a Bot or forfeit that match (not the series).',
        'If the team is not complete after 30 minutes, the series is awarded to the opposing team as a W.O.',
      ],
      es: [
        'Los equipos tienen hasta 30 minutos de tolerancia tras el horario pactado. Se pueden usar reservas y sustitutos para completar el equipo.',
        'Cada jugador tiene derecho a 2 pausas por partida, con un tiempo total máximo de 10 minutos sumando todas las pausas.',
        'Las pausas realizadas intencionalmente para perjudicar al rival serán sancionadas.',
        'En caso de desconexión, el jugador tiene 10 minutos para reconectarse. Pasado ese tiempo, el equipo puede continuar con Bot o abandonar esa partida (no la serie).',
        'Si el equipo no está completo tras 30 minutos, la serie se otorga al equipo rival como W.O.',
      ],
    },
  },
  {
    id: 'leilao_titulares',
    tipo: 'lista',
    titulo: {
      pt: 'Leilão de Titulares',
      en: 'Main Roster Auction',
      es: 'Subasta de Titulares',
    },
    itens: {
      pt: [
        'A ordem de picks é sorteada após a definição dos capitães.',
        'Cada capitão recebe 15 Moedas para o leilão.',
        'O leilão ocorre em rodadas: cada capitão compra 1 jogador por turno, em ordem, até retornar ao primeiro.',
        'É possível recomprar jogadores já comprados por outros capitães — a cada recompra o custo do jogador aumenta 1 Moeda.',
        'O leilão encerra quando todos os times tiverem 5 titulares.',
      ],
      en: [
        'The pick order is drawn after captains are confirmed.',
        'Each captain receives 15 Coins for the auction.',
        'The auction runs in rounds: each captain buys 1 player per turn, in order, cycling back to the first captain.',
        'Players already bought by other captains can be re-purchased — each re-purchase increases the player\'s cost by 1 Coin.',
        'The auction ends when all teams have 5 main roster players.',
      ],
      es: [
        'El orden de picks se sortea tras la confirmación de los capitanes.',
        'Cada capitán recibe 15 Monedas para la subasta.',
        'La subasta se desarrolla en rondas: cada capitán compra 1 jugador por turno, en orden, volviendo al primer capitán.',
        'Se pueden comprar jugadores ya adquiridos por otros capitanes — cada recompra aumenta el coste del jugador en 1 Moneda.',
        'La subasta termina cuando todos los equipos tienen 5 jugadores titulares.',
      ],
    },
  },
  {
    id: 'leilao_reservas',
    tipo: 'lista',
    titulo: {
      pt: 'Leilão de Reservas',
      en: 'Reserve Auction',
      es: 'Subasta de Reservas',
    },
    itens: {
      pt: [
        'Capitães com menos de 6 Moedas recebem um total de 6 para o leilão de reservas; quem tiver mais mantém o saldo.',
        'Funciona com o mesmo sistema de rodadas do leilão de titulares.',
        'Capitães podem comprar reservas da pool geral ou recomprar reservas já adquiridos por outros times.',
        'Capitães podem optar por não ter nenhum reserva e sair do leilão.',
        'Para ter apenas um reserva, o capitão pode sair quando a rodada retornar a ele.',
        'O leilão encerra quando todos os capitães saírem ou completarem 2 reservas.',
      ],
      en: [
        'Captains with fewer than 6 Coins receive a total of 6 for the reserve auction; those with more keep their balance.',
        'It follows the same round-based system as the main auction.',
        'Captains can buy reserves from the general pool or re-purchase reserves already acquired by other teams.',
        'Captains may choose not to have any reserve and exit the auction.',
        'To have only one reserve, the captain may leave when the round returns to them.',
        'The auction ends when all captains have either exited or completed 2 reserves.',
      ],
      es: [
        'Los capitanes con menos de 6 Monedas reciben un total de 6 para la subasta de reservas; los que tengan más mantienen su saldo.',
        'Funciona con el mismo sistema de rondas que la subasta de titulares.',
        'Los capitanes pueden comprar reservas del pool general o recomprar reservas ya adquiridos por otros equipos.',
        'Los capitanes pueden optar por no tener reservas y salir de la subasta.',
        'Para tener solo un reserva, el capitán puede salir cuando la ronda llegue nuevamente a él.',
        'La subasta termina cuando todos los capitanes hayan salido o completado 2 reservas.',
      ],
    },
  },
  {
    id: 'cronograma',
    tipo: 'lista',
    titulo: {
      pt: 'Cronograma e Formato',
      en: 'Schedule & Format',
      es: 'Cronograma y Formato',
    },
    itens: {
      pt: [
        'As partidas ocorrem às terças, quartas, quintas e sábados.',
        'Fase de grupos: séries MD2. Os pontos na tabela determinam a colocação nas Playoffs.',
        'Os times são divididos em duas chaves e enfrentam todos os times da sua chave.',
        'Empates na tabela são resolvidos em MD3.',
        'Apenas os melhores colocados de cada chave avançam para os Playoffs.',
        'Playoffs: séries MD5 em formato de dupla eliminação. Times da chave superior eliminados têm uma segunda chance na chave inferior.',
        'Times da chave inferior eliminados nas Playoffs são desclassificados do torneio.',
      ],
      en: [
        'Matches are played on Tuesdays, Wednesdays, Thursdays, and Saturdays.',
        'Group stage: MD2 series. Table points determine Playoff seeding.',
        'Teams are divided into two brackets and play all teams in their bracket.',
        'Table ties are resolved in an MD3 tiebreaker.',
        'Only the top finishers from each bracket advance to the Playoffs.',
        'Playoffs: MD5 series in a double-elimination format. Teams eliminated from the upper bracket get a second chance in the lower bracket.',
        'Teams eliminated in the lower bracket are knocked out of the tournament.',
      ],
      es: [
        'Las partidas se juegan los martes, miércoles, jueves y sábados.',
        'Fase de grupos: series MD2. Los puntos en la tabla determinan la clasificación para los Playoffs.',
        'Los equipos se dividen en dos llaves y enfrentan a todos los equipos de su llave.',
        'Los empates en la tabla se resuelven en MD3.',
        'Solo los mejores clasificados de cada llave avanzan a los Playoffs.',
        'Playoffs: series MD5 en formato de doble eliminación. Los equipos eliminados en la llave superior tienen una segunda oportunidad en la llave inferior.',
        'Los equipos eliminados en la llave inferior quedan fuera del torneo.',
      ],
    },
  },
  {
    id: 'substitutos',
    tipo: 'lista',
    titulo: {
      pt: 'Jogadores Substitutos',
      en: 'Substitute Players',
      es: 'Jugadores Sustitutos',
    },
    itens: {
      pt: [
        'Jogadores inscritos não draftados no leilão tornam-se substitutos.',
        'Substitutos podem completar times que não conseguirem os 5 jogadores necessários (incluindo reservas).',
        'Em caso de evasão, um substituto pode ser incorporado definitivamente ao time pelo capitão.',
      ],
      en: [
        'Registered players not drafted in the auction become substitutes.',
        'Substitutes can fill in for teams that cannot field 5 players (including reserves).',
        'In case of player evasion, a substitute can be permanently added to the team by the captain.',
      ],
      es: [
        'Los jugadores inscritos que no sean elegidos en la subasta se convierten en sustitutos.',
        'Los sustitutos pueden completar a equipos que no consigan los 5 jugadores necesarios (incluyendo reservas).',
        'En caso de evasión, el capitán puede incorporar definitivamente a un sustituto al equipo.',
      ],
    },
  },
  {
    id: 'evasao',
    tipo: 'lista',
    titulo: {
      pt: 'Evasão e Trocas',
      en: 'Player Evasion & Trades',
      es: 'Evasión y Traspasos',
    },
    itens: {
      pt: [
        'Jogadores draftados (titulares ou reservas) que desistirem são removidos do torneio e não podem ingressar em outro time.',
        'Substituições de jogador evadido devem ser solicitadas pelo capitão no canal #duvidas-regras do Discord.',
        'Janela de trocas: até 48h após o fim do leilão, capitães podem trocar jogadores entre si desde que ambos concordem.',
        'Trocas são permitidas somente entre titulares ou entre reservas. Ao término das 48h, todas as trocas são anunciadas no Discord.',
      ],
      en: [
        'Drafted players (main or reserve) who drop out are removed from the tournament and cannot join another team.',
        'Replacement requests for evaded players must be submitted by the captain in the #duvidas-regras Discord channel.',
        'Trade window: up to 48 hours after the auction ends, captains may trade players with mutual agreement.',
        'Trades are only allowed between main roster players or between reserve players. After 48 hours, all trades are announced on Discord.',
      ],
      es: [
        'Los jugadores elegidos (titulares o reservas) que abandonen son eliminados del torneo y no pueden unirse a otro equipo.',
        'Las solicitudes de sustitución deben realizarse por el capitán en el canal #duvidas-regras de Discord.',
        'Ventana de traspasos: hasta 48 horas tras el fin de la subasta, los capitanes pueden intercambiar jugadores con acuerdo mutuo.',
        'Los traspasos solo están permitidos entre titulares o entre reservas. Tras las 48 horas, todos los traspasos se anuncian en Discord.',
      ],
    },
  },
  {
    id: 'discord',
    tipo: 'lista',
    titulo: {
      pt: 'Discord',
      en: 'Discord',
      es: 'Discord',
    },
    itens: {
      pt: [
        'A presença no Discord da Inhouse é obrigatória para jogadores e capitães.',
        'Os canais de draft-mapas são utilizados durante as partidas para definir first pick e mapa.',
        'Durante as partidas, todos os jogadores dos dois times devem estar no canal correspondente ao time.',
        'O Discord é o canal oficial para marcar scrims e utilizar Tickets de troca de partidas.',
      ],
      en: [
        'Presence in the Inhouse Discord is mandatory for all players and captains.',
        'Map-draft channels are used during matches to determine first pick and map selection.',
        'During matches, all players from both teams must be in their respective team voice channels.',
        'Discord is the official channel for arranging scrims and using match rescheduling Tickets.',
      ],
      es: [
        'La presencia en el Discord de Inhouse es obligatoria para jugadores y capitanes.',
        'Los canales de draft-mapas se utilizan durante las partidas para definir el first pick y el mapa.',
        'Durante las partidas, todos los jugadores de ambos equipos deben estar en el canal de voz correspondiente.',
        'Discord es el canal oficial para organizar scrims y usar los Tickets de reprogramación.',
      ],
    },
  },
  {
    id: 'soft_madness',
    tipo: 'lista',
    titulo: {
      pt: 'Formato Soft Madness',
      en: 'Soft Madness Format',
      es: 'Formato Soft Madness',
    },
    intro: {
      pt: 'Para aumentar a variedade de heróis nas partidas, a Inhouse adota o sistema Soft Madness:',
      en: 'To increase hero variety across matches, the Inhouse uses the Soft Madness system:',
      es: 'Para aumentar la variedad de héroes en las partidas, la Inhouse aplica el sistema Soft Madness:',
    },
    itens: {
      pt: [
        'MD2 (Fase de Grupos): Madness Convencional — todos os 10 heróis utilizados na partida anterior são banidos da próxima.',
        'MD3 (Desempate), MD5 (Playoffs) e MD7 (Grande Final): Soft Madness — apenas os heróis do time vencedor são banidos na partida seguinte. Isso evita picks defensivos e mantém os drafts variados mesmo em séries longas.',
      ],
      en: [
        'MD2 (Group Stage): Conventional Madness — all 10 heroes used in the previous match are banned in the next.',
        'MD3 (Tiebreaker), MD5 (Playoffs), and MD7 (Grand Final): Soft Madness — only the winning team\'s heroes are banned in the next match. This discourages defensive picks and keeps drafts varied even in long series.',
      ],
      es: [
        'MD2 (Fase de grupos): Madness Convencional — los 10 héroes usados en la partida anterior quedan baneados en la siguiente.',
        'MD3 (Desempate), MD5 (Playoffs) y MD7 (Gran Final): Soft Madness — solo los héroes del equipo ganador son baneados en la siguiente partida. Esto evita picks defensivos y mantiene los drafts variados incluso en series largas.',
      ],
    },
  },
]
