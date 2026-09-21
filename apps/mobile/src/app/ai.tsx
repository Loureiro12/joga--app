import { Redirect } from 'expo-router';

import { features } from '@/core/config/features';
import { routes } from '@/core/navigation/routes';
import { AiCreateScreen } from '@/features/ai/AiCreateScreen';

/** Criar jogo com IA é do Premium: some junto com ele. */
export default function AiRoute() {
  return features.premium ? (
    <AiCreateScreen />
  ) : (
    <Redirect href={routes.home} />
  );
}
