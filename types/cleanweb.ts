export interface DomSummaryRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DomSummaryItem {
  selector: string;
  tag: string;
  id?: string;
  className?: string;
  role?: string;
  ariaLabel?: string;
  text: string;
  rect: DomSummaryRect;
  visible: boolean;
}

export interface CleanWebRule {
  css: string;
  instruction: string;
  updatedAt: number;
}

export interface LlmSettings {
  apiKey: string;
  baseUrl: string;
  model: string;
}

export interface DomSummaryMessage {
  type: 'CLEANWEB_COLLECT_DOM_SUMMARY';
}

export interface ApplyRuleMessage {
  type: 'CLEANWEB_APPLY_RULE';
  css: string;
  instruction: string;
  save: boolean;
}

export interface ResetRuleMessage {
  type: 'CLEANWEB_RESET_RULE';
}

export interface StartElementPickerMessage {
  type: 'CLEANWEB_START_ELEMENT_PICKER';
}

export type CleanWebMessage =
  | DomSummaryMessage
  | ApplyRuleMessage
  | ResetRuleMessage
  | StartElementPickerMessage;

export interface CleanWebResponse {
  ok: boolean;
  error?: string;
  summary?: DomSummaryItem[];
  summaryCount?: number;
}
