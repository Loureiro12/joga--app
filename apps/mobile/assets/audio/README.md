# Sons

WAV mono, 44.1 kHz. Ficam em WAV de propósito: são curtos (o tique tem 90 ms) e sem compressão
não há atraso de decodificação — num jogo de ritmo, isso se ouve. Juntos pesam menos de 300 KB,
e o Metro só empacota o que é referenciado em `src/core/audio/sounds.ts`.

| arquivo | onde toca |
|---|---|
| `tick.wav` · `tock.wav` | tique-taque da Bomba-Relógio, alternados |
| `explosao.wav` | a explosão |
| `tempo-acabando.wav` | **só no susto falso** — ver abaixo |
| `revelar.wav` · `voto.wav` · `acerto.wav` · `entrou.wav` · `impostor-escapou.wav` | ainda não usados; sobraram do Impostor |
| `demo-bomba.wav` | referência de como a sequência deve soar. Não é usado pelo app e não entra no bundle. |

## A regra do `tempo-acabando`

Ele **nunca** toca perto da explosão de verdade. Se tocasse, seria um aviso, e a Bomba-Relógio
vive de ninguém saber quando acaba. Ele é o som do susto falso: o grupo ouve o fim chegando, o
coração dispara, e nada acontece. Um teste em `test/games.unit.test.ts` garante que ele só é
disparado de dentro do susto.
