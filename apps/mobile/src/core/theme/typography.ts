import { BarlowCondensed_600SemiBold } from '@expo-google-fonts/barlow-condensed/600SemiBold';
import { BarlowCondensed_700Bold } from '@expo-google-fonts/barlow-condensed/700Bold';
import { BarlowCondensed_800ExtraBold } from '@expo-google-fonts/barlow-condensed/800ExtraBold';
import { DMSans_400Regular } from '@expo-google-fonts/dm-sans/400Regular';
import { DMSans_500Medium } from '@expo-google-fonts/dm-sans/500Medium';
import { DMSans_600SemiBold } from '@expo-google-fonts/dm-sans/600SemiBold';
import { DMSans_700Bold } from '@expo-google-fonts/dm-sans/700Bold';

/** Mapa passado para `useFonts` no layout raiz. */
export const fontAssets = {
  BarlowCondensed_600SemiBold,
  BarlowCondensed_700Bold,
  BarlowCondensed_800ExtraBold,
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_600SemiBold,
  DMSans_700Bold,
};

export const fonts = {
  display600: 'BarlowCondensed_600SemiBold',
  display700: 'BarlowCondensed_700Bold',
  display800: 'BarlowCondensed_800ExtraBold',
  body400: 'DMSans_400Regular',
  body500: 'DMSans_500Medium',
  body600: 'DMSans_600SemiBold',
  body700: 'DMSans_700Bold',
} as const;

export type FontToken = keyof typeof fonts;
