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

export interface ElementContextItem extends DomSummaryItem {
  depth: number;
  areaRatio?: number;
}

export interface SelectedElementContext {
  selected: ElementContextItem;
  recommendedTarget?: ElementContextItem;
  ancestors: ElementContextItem[];
  siblings: ElementContextItem[];
}

export type ElementActionType = 'smart-hide' | 'ai-modify';

export interface SmartHideRequest {
  action: 'smart-hide';
  context: SelectedElementContext;
}

export interface SmartHideResult {
  action: 'smart-hide';
  selector: string;
  css: string;
  explanation: string;
}

export interface AiModifyRequest {
  action: 'ai-modify';
  instruction: string;
  context: SelectedElementContext;
}

export interface AiModifyResult {
  action: 'ai-modify';
  css: string;
  explanation: string;
}

export type ElementActionRequest = SmartHideRequest | AiModifyRequest;
export type ElementActionResult = SmartHideResult | AiModifyResult;

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

export interface SmartHideMessage {
  type: 'CLEANWEB_SMART_HIDE';
  context: SelectedElementContext;
}

export interface AiModifyMessage {
  type: 'CLEANWEB_AI_MODIFY';
  instruction: string;
  context: SelectedElementContext;
}

export interface SmartHideResponse {
  ok: boolean;
  result?: SmartHideResult;
  error?: string;
}

export interface AiModifyResponse {
  ok: boolean;
  result?: AiModifyResult;
  error?: string;
}

export type CleanWebMessage =
  | DomSummaryMessage
  | ApplyRuleMessage
  | ResetRuleMessage
  | StartElementPickerMessage
  | SmartHideMessage
  | AiModifyMessage;

export interface CleanWebResponse {
  ok: boolean;
  error?: string;
  summary?: DomSummaryItem[];
  summaryCount?: number;
  result?: SmartHideResult | AiModifyResult;
}
