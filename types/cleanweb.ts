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
  drafts?: GeneratedRuleDraft[];
}

export type GeneratedRuleSource = 'full-page' | 'element-picker' | 'fallback';

export interface AiDebugLog {
  instruction: string;
  model: string;
  hasBaseUrl: boolean;
  summaryCount: number;
  requestStartedAt: number;
  responseFinishedAt?: number;
  rawResponse?: string;
  parseError?: string;
  requestError?: string;
  cssLength?: number;
  explanation?: string;
  usedFallback: boolean;
  retriedWithoutResponseFormat: boolean;
}

export interface GeneratedRuleDraft {
  id: string;
  instruction: string;
  css: string;
  explanation: string;
  enabled: boolean;
  createdAt: number;
  source: GeneratedRuleSource;
  debug?: AiDebugLog;
}

export interface LlmSettings {
  apiKey: string;
  baseUrl: string;
  model: string;
}

export type GenerationStatus = 'idle' | 'running' | 'success' | 'error';

export interface GenerationState {
  hostname: string;
  status: GenerationStatus;
  instruction: string;
  summaryCount: number;
  startedAt: number;
  updatedAt: number;
  draft?: GeneratedRuleDraft;
  debug?: AiDebugLog;
  error?: string;
}

export interface DomSummaryMessage {
  type: 'CLEANWEB_COLLECT_DOM_SUMMARY';
}

export interface ApplyRuleMessage {
  type: 'CLEANWEB_APPLY_RULE';
  css: string;
  instruction: string;
  save: boolean;
  drafts?: GeneratedRuleDraft[];
}

export interface ResetRuleMessage {
  type: 'CLEANWEB_RESET_RULE';
}

export interface StartElementPickerMessage {
  type: 'CLEANWEB_START_ELEMENT_PICKER';
}

export interface StartGenerationMessage {
  type: 'CLEANWEB_START_GENERATION';
  tabId: number;
  hostname: string;
  instruction: string;
  existingDrafts: GeneratedRuleDraft[];
  settings: LlmSettings;
}

export interface GetGenerationStateMessage {
  type: 'CLEANWEB_GET_GENERATION_STATE';
  hostname: string;
}

export type CleanWebMessage =
  | DomSummaryMessage
  | ApplyRuleMessage
  | ResetRuleMessage
  | StartElementPickerMessage;

export type CleanWebBackgroundMessage =
  | StartGenerationMessage
  | GetGenerationStateMessage;

export interface CleanWebResponse {
  ok: boolean;
  error?: string;
  summary?: DomSummaryItem[];
  summaryCount?: number;
  generationState?: GenerationState;
}
