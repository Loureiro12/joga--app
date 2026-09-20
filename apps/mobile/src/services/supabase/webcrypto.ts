import * as Crypto from 'expo-crypto';

/**
 * O Hermes não tem WebCrypto. Sem ele o supabase-js degrada o PKCE de duas formas: gera o
 * `code_verifier` com `Math.random()` e manda o desafio em texto puro ("plain") em vez de SHA-256.
 * Este polyfill cobre exatamente o que o auth-js usa — `getRandomValues` e `subtle.digest('SHA-256')` —
 * com as implementações nativas do expo-crypto. Importe ANTES de criar o cliente.
 */
type MinimalCrypto = {
  getRandomValues?: typeof Crypto.getRandomValues;
  randomUUID?: typeof Crypto.randomUUID;
  subtle?: { digest: (algorithm: string | { name: string }, data: BufferSource) => Promise<ArrayBuffer> };
};

const target = globalThis as unknown as { crypto?: MinimalCrypto };
target.crypto ??= {};
target.crypto.getRandomValues ??= Crypto.getRandomValues;
target.crypto.randomUUID ??= Crypto.randomUUID;
target.crypto.subtle ??= {
  digest: (algorithm, data) => {
    const name = typeof algorithm === 'string' ? algorithm : algorithm.name;
    if (name.toUpperCase() !== 'SHA-256') return Promise.reject(new Error(`digest ${name} não suportado pelo polyfill`));
    return Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, data);
  },
};
