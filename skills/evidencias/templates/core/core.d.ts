/** API instalada em `window.__evidencia` pelo núcleo (core.js). */
export interface EvidenciaApi {
  rotulo(el: Element, acao: 'click' | 'dblclick' | 'type' | 'check' | 'uncheck' | 'select' | string, valor?: string): string;
  placa(dados: { suite?: string; ct: string; meta?: Array<[string, string]> }): boolean;
  removerPlaca(): void;
  destacar(el: Element, texto: string, numero: number): boolean;
  limparDestaques(): void;
  resultado(passou: boolean, titulo: string, mensagem?: string): boolean;
  remover(seletor: string): void;
  reiniciar(): void;
  montar(): boolean;
}

export function instalarEvidencia(janela?: Window): EvidenciaApi;

declare global {
  interface Window {
    __evidencia?: EvidenciaApi;
  }
}
