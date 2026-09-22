import { Redirect } from 'expo-router';

import { features } from '@/core/config/features';
import { routes } from '@/core/navigation/routes';
import { PaywallScreen } from '@/features/premium/PaywallScreen';

/** Com o Premium desligado, um link antigo para cá volta para a Home em vez de abrir uma compra simulada. */
export default function PremiumRoute() {
  return features.premium ? <PaywallScreen /> : <Redirect href={routes.home} />;
}
