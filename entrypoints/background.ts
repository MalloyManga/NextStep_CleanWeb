import type { AiModifyResponse, CleanWebMessage, CleanWebResponse, SmartHideResponse } from '../types/cleanweb';
import { generateAiModifyRule, generateSmartHideRule } from '../utils/llm';

export default defineBackground(() => {
  console.info('CleanWeb background ready', { id: browser.runtime.id });

  browser.runtime.onMessage.addListener(
    async (message: CleanWebMessage): Promise<SmartHideResponse | AiModifyResponse | CleanWebResponse> => {
      if (message.type === 'CLEANWEB_SMART_HIDE') {
        try {
          const result = await generateSmartHideRule({ action: 'smart-hide', context: message.context });
          return { ok: true, result };
        } catch (error) {
          return { ok: false, error: error instanceof Error ? error.message : 'Smart hide failed' };
        }
      }

      if (message.type === 'CLEANWEB_AI_MODIFY') {
        try {
          const result = await generateAiModifyRule({
            action: 'ai-modify',
            instruction: message.instruction,
            context: message.context,
          });
          return { ok: true, result };
        } catch (error) {
          return { ok: false, error: error instanceof Error ? error.message : 'AI modify failed' };
        }
      }

      return { ok: false, error: 'Unhandled message type' };
    },
  );
});
