import type { DomSummaryItem } from '../types/cleanweb';

export interface GenerateCssInput {
  instruction: string;
  domSummary: DomSummaryItem[];
}

export interface GenerateCssResult {
  css: string;
  explanation: string;
}

export async function generateCssRule(_input: GenerateCssInput): Promise<GenerateCssResult> {
  throw new Error('LLM integration is not implemented yet.');
}
