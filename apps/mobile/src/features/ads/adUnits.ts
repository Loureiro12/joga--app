import { Platform } from 'react-native';

/**
 * Os ids das unidades de anúncio.
 *
 * Ficam no código, e não só no ambiente, pelo mesmo motivo dos links das lojas no site: são
 * identificadores públicos — qualquer um os extrai do APK — e permanentes. Numa variável
 * esquecida num deploy, o app cairia nos anúncios de teste e a receita iria a zero em silêncio.
 *
 * O ambiente ainda sobrescreve, para o caso de uma unidade nova sem precisar de build.
 */
const PRODUCAO = {
  android: 'ca-app-pub-4825299331683087/8639356504',
  ios: 'ca-app-pub-4825299331683087/8323572440',
};

/**
 * Ids de teste do próprio Google. Servem anúncio falso e sempre preenchem.
 *
 * Em desenvolvimento eles são **obrigatórios**: um clique seu num anúncio de verdade conta como
 * clique inválido, e o AdMob suspende a conta por isso.
 */
const TESTE = {
  android: 'ca-app-pub-3940256099942544/1033173712',
  ios: 'ca-app-pub-3940256099942544/4411468910',
};

export function interstitialUnitId(): string {
  const plataforma = Platform.OS === 'ios' ? 'ios' : 'android';
  if (__DEV__) return TESTE[plataforma];
  const doAmbiente = plataforma === 'ios' ? process.env.EXPO_PUBLIC_ADMOB_IOS_INTERSTITIAL : process.env.EXPO_PUBLIC_ADMOB_ANDROID_INTERSTITIAL;
  return doAmbiente || PRODUCAO[plataforma];
}

export const AD_UNITS_FOR_TEST = { PRODUCAO, TESTE };
