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

export type CleanWebMessage = DomSummaryMessage | ApplyRuleMessage | ResetRuleMessage;

export interface CleanWebResponse {
  ok: boolean;
  error?: string;
  summary?: DomSummaryItem[];
  summaryCount?: number;
}
