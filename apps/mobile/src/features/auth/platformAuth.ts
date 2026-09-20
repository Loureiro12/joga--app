import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import type { PlatformAuth } from './SupabaseAuthService';

WebBrowser.maybeCompleteAuthSession();

/** Implementação real das partes nativas do login (ver `PlatformAuth`). */
export const platformAuth: PlatformAuth = {
  redirectTo: (path) => Linking.createURL(path),

  openAuthSession: async (url, redirectTo) => {
    const result = await WebBrowser.openAuthSessionAsync(url, redirectTo);
    return result.type === 'success' ? result.url : null;
  },

  appleNative:
    Platform.OS !== 'ios'
      ? null
      : async () => {
          // O Supabase confere o nonce: mandamos o hash para a Apple e o valor cru para o Supabase.
          const rawNonce = Crypto.randomUUID();
          const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
          try {
            const credential = await AppleAuthentication.signInAsync({
              requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
              nonce: hashedNonce,
            });
            if (!credential.identityToken) return null;
            const fullName = [credential.fullName?.givenName, credential.fullName?.familyName].filter(Boolean).join(' ').trim();
            return { idToken: credential.identityToken, rawNonce, fullName: fullName || null };
          } catch (e) {
            if ((e as { code?: string }).code === 'ERR_REQUEST_CANCELED') return null;
            throw e;
          }
        },
};
