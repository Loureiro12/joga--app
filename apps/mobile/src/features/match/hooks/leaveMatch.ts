import { router } from 'expo-router';

import { routes } from '@/core/navigation/routes';
import { services } from '@/services';

/** Sai da sala e desmonta o stack de partida, voltando para as tabs (ou outra rota). */
export async function leaveMatch(then?: string) {
  router.dismissTo(routes.home);
  await services.room.leaveRoom();
  if (then) router.push(then);
}
