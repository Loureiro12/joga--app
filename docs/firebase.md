# Firebase: Crashlytics, Analytics e Performance

Três produtos, uma configuração. Este documento tem duas partes: o que **você** precisa fazer no
console do Firebase (o app não sobe sem isso) e como a coisa está montada do lado do código.

> **O build nativo falha sem os dois arquivos de configuração.** O plugin do Google Services é
> obrigatório no Gradle: sem `google-services.json`, `eas build --platform android` para com erro.
> Então a primeira parte não é opcional nem adiável.

---

## 1. No console do Firebase (uma vez)

### Criar o projeto

1. Abra [console.firebase.google.com](https://console.firebase.google.com) e **Adicionar projeto**.
2. Nome: `Jogae` (ou o que preferir — é só o nome interno).
3. **Ative o Google Analytics quando ele perguntar.** Sem isso o projeto nasce sem GA4, e
   Analytics e Performance ficam sem onde gravar. Se você já criou sem, dá para ativar depois em
   **Configurações do projeto → Integrações → Google Analytics**.
4. Escolha (ou crie) a conta do Analytics e deixe a região como **Brasil**.

### Registrar os dois apps

O Firebase trata iOS e Android como apps separados dentro do mesmo projeto. Faça os dois.

**Android** — em **Visão geral do projeto → Adicionar app → Android**:

- Nome do pacote: `app.jogae` (tem de ser exatamente o `android.package` do `app.json`)
- Apelido: `Jogaê Android`
- SHA-1: pode deixar vazio por enquanto. É necessário só para login com Google pelo Firebase, que
  este app não usa (o login social passa pelo Supabase).
- Baixe o **`google-services.json`**.

**iOS** — **Adicionar app → iOS**:

- ID do pacote: `app.jogae` (o mesmo `ios.bundleIdentifier` do `app.json`)
- Apelido: `Jogaê iOS`
- Baixe o **`GoogleService-Info.plist`**.

### Colocar os arquivos no lugar

Os dois vão na raiz de `apps/mobile`, com esses nomes exatos:

```
apps/mobile/google-services.json
apps/mobile/GoogleService-Info.plist
```

O `app.json` já aponta para eles (`android.googleServicesFile` e `ios.googleServicesFile`).

**Eles não são segredo.** As chaves ali dentro são públicas e restritas ao nome do pacote — o
próprio Firebase documenta isso. Então eles **vão para o git**, como na maioria dos projetos
Expo, e o EAS os encontra sem configuração nenhuma. (A alternativa — guardar como arquivo em
variável de ambiente do EAS — exigiria trocar o `app.json` por `app.config.ts`, e não paga.)

### Ligar os três produtos

No menu lateral do console, **Executar**:

- **Crashlytics** → Configurar. Ele fica "aguardando o primeiro relatório" até um build real
  travar. Normal.
- **Performance** → Configurar. Idem: os primeiros dados aparecem em algumas horas.
- **Analytics** já está ligado se você marcou no passo 3. O painel leva até 24 h para popular; o
  **DebugView** mostra em tempo real (ver abaixo).

---

## 2. Gerar o build

Os pacotes nativos entram no app só num build novo. Da raiz do projeto:

```bash
cd /Users/loureiro/project/joga--app/apps/mobile
eas build --platform all --profile production
```

Para testar antes de ir para a loja, o perfil `preview` serve e já força os ids de teste do AdMob.

### Ver os eventos chegando, em tempo real

O painel do Analytics atrasa horas. Para conferir na hora, ligue o modo de depuração no aparelho e
abra **Analytics → DebugView** no console:

```bash
adb shell setprop debug.firebase.analytics.app app.jogae
```

Para desligar depois:

```bash
adb shell setprop debug.firebase.analytics.app .none.
```

No iOS, o equivalente é passar `-FIRDebugEnabled` nos argumentos de execução pelo Xcode.

### Provocar um travamento de propósito

Crashlytics só aparece depois do primeiro relatório. O jeito mais rápido é causar um erro de
JavaScript num build de preview — o handler global de `core/logging/globalErrors.ts` o entrega.
O relatório chega ao console em alguns minutos, e **só depois de o app ser reaberto**: o
Crashlytics envia na abertura seguinte, não no instante da queda.

---

## 3. Como está montado

```
apps/mobile/src/features/telemetry/
  events.ts                   catálogo de eventos + a régua (PURO, testado)
  consent.ts                  quem coleta o quê (PURO, testado)
  TelemetryService.ts         a interface + o simulado
  FirebaseTelemetryService.ts o de verdade
  sdk.ts / sdk.web.ts         o split de plataforma
```

Nenhuma tela importa `@react-native-firebase/*`. Elas falam com `services.telemetry`, e isso
mantém três coisas verdadeiras ao mesmo tempo: o SDK nativo fora da web e do Expo Go, o catálogo
de eventos num lugar só, e a possibilidade de trocar de provedor um dia mexendo numa classe.

### O que é coletado, e o que o usuário controla

| | Liga/desliga | Por quê |
|---|---|---|
| **Crashlytics** | sempre ligado | É o que mantém o app de pé. Não traça comportamento, não alimenta anúncio. |
| **Analytics** | Ajustes → Dados de uso | Mede comportamento. É disso que alguém pode legitimamente não querer participar. |
| **Performance** | Ajustes → Dados de uso | Idem. |

A regra mora em `consent.ts`, pura e testada, e a **seção 6 da política de privacidade do site
descreve exatamente ela**. Mudar uma sem a outra faz o app negar no texto o que faz na prática —
há teste cobrando essa correspondência (`test/telemetry.unit.test.ts`).

### A regra de privacidade dos eventos

Nenhum evento leva nome, e-mail, código de sala, nem nada que foi dito numa partida. Só id de jogo,
enum e contagem. A defesa principal é o tipo `TelemetryEvent`: **não existe campo onde um nome
caiba**. O `sanitizeParams` é a segunda linha, para o acidente de alguém acrescentar um campo novo
e colar um e-mail nele.

O caminho da tela também é tratado: `/j/4827` é um código de sala e `/u/andre` é um nome de
usuário, e os dois viram `j_id` e `u_id` antes de sair do aparelho. Sem isso, o painel de telas do
Analytics viraria uma lista de salas ativas e de nomes de usuário.

### Os limites do GA4, que falham em silêncio

O Firebase **descarta sem avisar** evento com nome inválido, parâmetro além de 25, ou texto acima
de 100 caracteres. Não há erro, não há log: o evento nunca aparece no painel e você descobre
semanas depois olhando um gráfico vazio. Por isso os limites estão em `GA4_LIMITS` e cada um tem
teste.

### Em dev, sem build nativo

Na web e no Expo Go o módulo nativo não existe e o `MockTelemetryService` assume. Ele imprime cada
evento no terminal, **já normalizado** — é assim que se confere o que o app mandaria, sem painel e
sem sujar o Analytics de verdade com dado de teste:

```
📊 telemetria simulada (sem SDK nativo)
📊 propriedades {"backend":"supabase","premium":"nao","telemetria":"sim"}
📊 tela j_id
📊 partida_iniciada · gameId=bomb players=4 rounds=3
```

---

## 4. O detalhe que custa um build quebrado

**As versões do `@react-native-firebase` estão fixas na 26.4.1, sem `^`. Não suba para a 27.**

O Firebase Apple SDK 13+ saiu do CocoaPods e só existe em Swift Package Manager, e o SPM exige
frameworks dinâmicos. O SDK do Google Mobile Ads é estático, e os dois **não convivem**: o
`pod install` recusa a combinação com `[react-native-firebase] SPM + static linkage is not
supported`. O escape de voltar para CocoaPods (`disableSPM`) foi **removido** na 27 — o plugin
lança erro de propósito.

Como este app já publica anúncios, o caminho é o contrário: ficar na última versão do Firebase
distribuída em CocoaPods (iOS 12.19.3, que é o que a 26.4.1 fixa) e pedir `disableSPM: true` no
plugin, que é o que o `app.json` faz. Há teste cobrando as duas coisas.

Se um dia o AdMob sair do app, ou o `react-native-google-mobile-ads` passar a suportar frameworks
dinâmicos, aí vale subir — e o caminho é `expo-build-properties` com `ios.useFrameworks: "dynamic"`.

---

## 5. O que falta fora do código

- [ ] **Formulário de Segurança de Dados no Play Console.** Entram agora: "Informações do app" →
      *Registros de erro* e *Diagnóstico*, e "Atividade no app" → *Interações no app*. Marque
      "coletados", "criptografados em trânsito", e **"o usuário pode optar por não enviar"** nos
      dados de uso (é verdade: o interruptor existe).
- [ ] **Rótulos de privacidade na App Store.** Adicione *Dados de uso → Dados de interação com o
      produto* e *Diagnóstico → Dados de falha* e *Dados de desempenho*. Em "Vinculados a você":
      sim, porque o id da conta acompanha. Em "Usados para rastreamento": **não** — nada disso vai
      para publicidade.
- [ ] **Publicar o site** com a política de privacidade atualizada (seção 6 é nova). A loja compara
      o que você declara com o que a política diz.
- [ ] Depois do primeiro build: conferir **DebugView** (Analytics), provocar um travamento
      (Crashlytics) e esperar algumas horas pelo painel de **Performance**.
