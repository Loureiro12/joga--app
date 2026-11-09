# Sons

WAV mono, 44.1 kHz. Ficam em WAV de propósito: sem compressão não há atraso de decodificação —
na explosão, meio segundo de espera estraga o momento. O Metro só empacota o que é referenciado
em `src/core/audio/sounds.ts`.

| arquivo | onde toca |
|---|---|
| `tensao-loop.wav` | fundo da Bomba-Relógio, em laço, desde que ela acende |
| `tensao-rapido-loop.wav` | o mesmo fundo acelerado; entra por crossfade depois de um tempo de rodada |
| `explosao.wav` | a explosão |
| `tempo-acabando.wav` | **só no susto falso** — ver abaixo |
| `revelar.wav` · `voto.wav` · `acerto.wav` · `entrou.wav` · `impostor-escapou.wav` | ainda não usados; sobraram do Impostor |
| `demo-bomba.wav` | referência de como a sequência deve soar. Não é usado pelo app e não entra no bundle. |

## A regra da aceleração

A troca para o laço rápido acontece depois de um tempo **de rodada corrida** — nunca de tempo
restante. É a diferença entre "já faz um tempo que isso está na sua mão", que todo mundo percebe
sozinho, e "falta pouco", que ninguém pode saber. O instante é sorteado numa janela de 10 a 16
segundos, para não virar um número que se decora.

## A regra do `tempo-acabando`

Ele **nunca** toca perto da explosão de verdade. Se tocasse, seria um aviso, e a Bomba-Relógio
vive de ninguém saber quando acaba. Ele é o som do susto falso: o grupo ouve o fim chegando, o
coração dispara, e nada acontece. Um teste em `test/games.unit.test.ts` garante que ele só é
disparado de dentro do susto.
