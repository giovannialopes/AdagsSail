// Escala da interface do jogo. As telas do Blacksail foram medidas numa janela 1920x1080; nela, a
// "unidade" de interface (U) é 1080 px. O jogo encaixa a interface no menor lado proporcional:
//  - janela larga (21:9) → limitada pela altura: U = altura
//  - janela "alta" (16:10, 4:3, janela redimensionada) → limitada pela largura: U = largura × 9/16
// Se o jogador mudar a escala da interface nas opções, U muda: aí calibramos por uma âncora na tela
// (botão "Confirm" nas Flames, "Select a Seal Whisper" nas cartas).
import type { Region } from './layout';

export function uiUnit(client: Region): number {
  return Math.min(client.height, (client.width * 9) / 16);
}

// Distância vertical (em U) do centro da área útil até a âncora, medida nos prints 1920x1080.
export const ANCHORS = {
  sealConfirm: 0.214, // centro do texto "Confirm" na tela das Flames
  sealSelectable: 0.136, // centro da linha "selectable Seal Whispers" (fim da descrição da Flame)
  terminalSelect: 0.2694, // centro de "Select a Seal Whisper" na tela das cartas
};

// U a partir da posição de uma âncora encontrada pelo OCR.
export function unitFromAnchor(anchorCenterY: number, client: Region, refOffset: number): number | null {
  const cy = client.y + client.height / 2;
  const u = (anchorCenterY - cy) / refOffset;
  // descarta leituras absurdas (âncora errada)
  return u > client.height * 0.3 && u < client.height * 1.6 ? u : null;
}
