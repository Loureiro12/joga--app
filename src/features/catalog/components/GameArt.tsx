import { Bomb, Dice, Eyes, Mask, PillArrow, Trophy } from '@/core/illustrations';
import { colors } from '@/core/theme';

import type { GameDefinition } from '../data/games';

/** Ilustração do jogo em uma largura dada. `detail` das formas recortadas usa a cor do próprio card. */
export function GameArt({ game, width, blink }: { game: GameDefinition; width: number; blink?: number }) {
  switch (game.illustration) {
    case 'eyes':
      return <Eyes width={width} blinkCycle={blink} />;
    case 'pillArrow':
      return <PillArrow width={width} detail={game.color} />;
    case 'mask':
      return <Mask width={width} detail={game.color} />;
    case 'bomb':
      return <Bomb size={width} />;
    case 'dice':
      return <Dice size={width} color={colors.background} detail={game.color} />;
    case 'trophy':
      return <Trophy size={width} />;
  }
}
