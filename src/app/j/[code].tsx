import { Redirect, useLocalSearchParams } from 'expo-router';

import { routes } from '@/core/navigation/routes';

/** Deep link `jogae.app/j/4827` → Entrar na sala com o código preenchido. */
export default function JoinDeepLink() {
  const { code } = useLocalSearchParams<{ code: string }>();
  return <Redirect href={{ pathname: routes.join, params: { code } }} />;
}
