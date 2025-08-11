export default function convertDefineToEztr(raw: string): string|null {
  function splitTopLevelComma(s: string) {
    const parts = [];
    let level = 0;
    let start = 0;
    for (let i = 0; i < s.length; i++) {
      if (s[i] === '(') level++;
      else if (s[i] === ')') level--;
      else if (s[i] === ',' && level === 0) {
        parts.push(s.slice(start, i).trim());
        start = i + 1;
      }
    }
    parts.push(s.slice(start).trim());
    return parts;
  }

  const defineArgsMatch = raw.match(/DEFINE_MESSAGE\s*\(([\s\S]*)\)\s*$/);
  if (!defineArgsMatch) throw new Error("Invalid DEFINE_MESSAGE format");

  const defineArgs = splitTopLevelComma(defineArgsMatch[1]);
  if (defineArgs.length < 4) throw new Error("DEFINE_MESSAGE missing arguments");

  const messageId = defineArgs[0];
  const msgBlock = defineArgs.slice(3).join(',');

  const headerMatch = msgBlock.match(/HEADER\s*\(([^)]+)\)/);
  if (!headerMatch) throw new Error("Missing HEADER()");

  const headerArgs = splitTopLevelComma(headerMatch[1]);
  if (headerArgs.length < 6) throw new Error("HEADER() missing arguments");

  const textBoxType = defineArgs[1].trim();
  const textBoxYPos = defineArgs[2].trim();
  const displayIcon = headerArgs[1].trim();
  const nextMsgId = headerArgs[2].trim() === '0xFFFF' ? 'EZTR_NO_VALUE' : headerArgs[2].trim();
  const firstItemRupees = headerArgs[3].trim() === '0xFFFF' ? 'EZTR_NO_VALUE' : headerArgs[3].trim();
  const secondItemRupees = headerArgs[4].trim() === '0xFFFF' ? 'EZTR_NO_VALUE' : headerArgs[4].trim();

  // Extract message content inside MSG(...)
  const msgContentMatch = msgBlock.match(/MSG\s*\(([\s\S]*)\)\s*$/);
  if (!msgContentMatch) throw new Error("Missing MSG() content");

  let contentRaw = msgContentMatch[1];

  // Remove HEADER(...) line
  contentRaw = contentRaw.replace(/HEADER\s*\([^)]*\)/, '').trim();

  // We will tokenize the content with:
  // - Special macros with args: SFX(...), DELAY(...), FADE(...)
  // - Quoted strings
  // - Other macros/words
  // - Literal \n (newline) escapes which should split strings + insert EZTR_CC_NEWLINE outside strings
  // Regex captures:
  // 1: Macro with args (SFX, DELAY, FADE)
  // 2: Arg inside parens for macros
  // 3: Quoted string content (excluding quotes)
  // 4: Other macros/words (A-Z_0-9)
  // 5: \n literal sequence
  const tokenRegex = /\b(SFX|DELAY|FADE)\s*\(\s*([^)]+?)\s*\)|"((?:[^"\\]|\\.)*)"|(\b[A-Z_][A-Z0-9_]*\b)|(\\n)/g;

  const restArgs: (string | number)[] = [];
  const tokens: string[] = [];

  // Escape backslashes and double quotes inside strings
  function escapeStringForJS(str: string): string {
    return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }

  let match;
  while ((match = tokenRegex.exec(contentRaw)) !== null) {
    if (match[1]) {
      // SFX, DELAY, FADE macros with args
      const macroName = match[1];
      const argRaw = match[2].trim();

      if (macroName === 'SFX') {
        tokens.push('EZTR_CC_SFX_ARGW');
        restArgs.push(argRaw);
      } else if (macroName === 'DELAY') {
        tokens.push('EZTR_CC_DELAY_ARGW');
        restArgs.push(argRaw);
      } else if (macroName === 'FADE') {
        tokens.push('EZTR_CC_FADE_ARGW');
        restArgs.push(argRaw);
      }
    } else if (match[3]) {
      // Quoted string: split by actual \n inside string to handle newlines outside strings
      const rawStr = match[3];
      // Split on literal \n inside string (not actual newline)
      const parts = rawStr.split(/\\n/);
      for (let i = 0; i < parts.length; i++) {
        if (parts[i].length > 0) {
          tokens.push(`"${escapeStringForJS(parts[i])}"`);
        }
        if (i !== parts.length - 1) {
          tokens.push('EZTR_CC_NEWLINE');
        }
      }
    } else if (match[4]) {
      // Other macros, add EZTR_CC_ prefix
      tokens.push(`EZTR_CC_${match[4]}`);
    } else if (match[5]) {
      // Literal \n outside string → insert newline macro
      tokens.push('EZTR_CC_NEWLINE');
    }
  }

  if (!tokens.length) return null;

  // If tokens empty, use NULL for content arg
  let contentArg = `${tokens.join(' ')} EZTR_CC_END`;
  const restArgsStr = restArgs.length ? ', ' + restArgs.join(', ') : '';

  contentArg = contentArg
    .replaceAll('[A]', '" EZTR_CC_BTN_A "')
    .replaceAll('[B]', '" EZTR_CC_BTN_B "')
    .replaceAll('[C]', '" EZTR_CC_BTN_C "')
    .replaceAll('[C-Up]', '" EZTR_CC_BTN_CUP "')
    .replaceAll('[C-Down]', '" EZTR_CC_BTN_CDOWN "')
    .replaceAll('[C-Left]', '" EZTR_CC_BTN_CLEFT "')
    .replaceAll('[C-Right]', '" EZTR_CC_BTN_CRIGHT "')
    .replaceAll('[L]', '" EZTR_CC_BTN_L "')
    .replaceAll('[R]', '" EZTR_CC_BTN_R "')
    .replaceAll('[Z]', '" EZTR_CC_BTN_Z "')
    .replaceAll('[Control-Pad]', '" EZTR_CC_CONTROL_PAD "')

  return `EZTR_Basic_ReplaceText(
    ${messageId},
    ${textBoxType},
    ${textBoxYPos},
    ${displayIcon},
    ${nextMsgId},
    ${firstItemRupees},
    ${secondItemRupees},
    false,
    ${contentArg},
    NULL${restArgsStr}
);`;
}