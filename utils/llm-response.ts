export function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function stringifyResponseSnapshot(response: unknown) {
  const text = JSON.stringify(response, null, 2);
  const maxLength = 12000;

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength)}\n...<truncated>`;
}

export function parseJsonObject(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    const jsonLike = extractJsonObject(raw);
    if (!jsonLike) {
      throw new Error('No JSON object found in AI response');
    }

    return JSON.parse(jsonLike);
  }
}

function extractJsonObject(raw: string) {
  const fencedMatch = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    return '';
  }

  return raw.slice(start, end + 1);
}

export function getEmptyResponseExplanation(responseSnapshot: string) {
  if (responseSnapshot.includes('"reasoning_content"')) {
    return 'AI spent the output budget on reasoning and returned no final JSON content. Applied the built-in fallback rule.';
  }

  return 'AI returned an empty response. Applied the built-in fallback rule.';
}
