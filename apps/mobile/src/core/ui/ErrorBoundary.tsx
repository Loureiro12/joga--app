import { Component, type ErrorInfo, type ReactNode } from 'react';
import { View } from 'react-native';

import { logger } from '@/core/logging/logger';
import { colors } from '@/core/theme/tokens';
import { services } from '@/services';

import { Button } from './Button';
import { Txt } from './Txt';

/**
 * A rede embaixo do app.
 *
 * Sem ela, um erro dentro do `render` de qualquer tela desmonta a árvore inteira do React e o
 * usuário fica com **tela preta** — sem mensagem, sem botão, sem nada a fazer além de fechar o
 * app. E, pior para quem mantém: sem relatório, porque um erro de render não passa pelo handler
 * global de JavaScript.
 *
 * Então ela faz duas coisas, nesta ordem de importância:
 *
 * 1. **Registra no Crashlytics**, com o componente que quebrou. É a única forma de saber que isso
 *    aconteceu com alguém — ninguém abre um ticket dizendo "a tela ficou preta".
 * 2. **Dá uma saída.** Numa mesa com gente esperando, a diferença entre "fechei o app e abri de
 *    novo" e "a noite acabou" é um botão.
 *
 * Fica no layout raiz, por fora do `Stack`: o erro pode estar na própria navegação.
 */

type Props = { children: ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // A pilha de componentes é o que transforma "quebrou" em "quebrou na tela da bomba". Vai como
    // migalha porque o Crashlytics corta mensagem longa, e ela é longa.
    const componente = (info.componentStack ?? '').split('\n').find((l) => l.trim().startsWith('in ') || l.trim().startsWith('at '));
    services.telemetry.breadcrumb(`render quebrou${componente ? ` ${componente.trim()}` : ''}`);
    services.telemetry.recordError(error, 'erro de render');
    logger.line(`💥 render quebrou: ${error.message}`);
  }

  private tentarDeNovo = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 14 }}>
        <Txt size={56}>😵‍💫</Txt>
        <Txt font="display800" size={30} center>
          Algo quebrou aqui
        </Txt>
        <Txt font="body400" size={15} color={colors.muted} center lh={1.4}>
          Já avisamos a gente sobre isso. Tente voltar — se não der, feche e abra o app de novo.
        </Txt>
        <Button label="Tentar de novo" onPress={this.tentarDeNovo} style={{ alignSelf: 'stretch', marginTop: 8 }} />
      </View>
    );
  }
}
