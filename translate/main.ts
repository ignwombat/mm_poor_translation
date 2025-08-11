import convertDefineToEztr from './eztr.ts';
import { resolve } from 'jsr:@std/path';

const rawData = Deno.readTextFileSync('message_data.h');

const outputPath = resolve('..', 'src', 'poorly_translated.c');
const checkpointPath = 'checkpoint_data.c';

// Languages to translate through
const sourceLang = 'en';
const targetLang = 'en';

const langs: string[] = [
    //'ar', // Arabic
    //'zh', // Chinese
    'zh-Hant', // Traditional chinese
    'hi', // Hindi
    //'pt', // Portugese
    'ca', // Catalan
    //'ja', // Japanese
    //'nl', // Dutch
    'th', // Thai
    'bn', // Bengali
    'de', // German
    'eo', // Esperanto
    'sq', // Albanian
    //'fr', // French
    //'ko', // Korean
    //'nb', // Norwegian bokmål
    'da', // Danish
    'gl', // Galician
    'ur', // Urdu
    'ky', // Kyrgyz
    //'el', // Greek
    'ro', // Romanian
    'pt-BR', // Brazilian Portugese
    'tl', // Tagalog
    'uk', // Ukranian
    //'it', // Italian
    //'tr', // Turkish
    //'ms', // Malay
    //'az', // Azerbaijani
    //'ru', // Russian
    'fi', // Finnish
    'he', // Hebrew
    //'pl', // Polish
    //'es', // Spanish
    //'eu' // Basque
];

const minLangs = 7;
const maxLangs = 14;

const translateAddress = `http://localhost:5000/translate`;
const translationCache = new Map<string, string>();

const ignoredPhrases = [
    '!',
    '?',
    '.',
    ',',
    '\n',
    ' ',
    '(',
    ')',
    '"',
    "'",
    '\n!',
    '!\n',
    '.\n',
    ', ',
    '...'
];

const wrappedPhrases = [
    '[A]',
    '[B]',
    '[C]',
    '[L]',
    '[R]',
    '[Z]',
    '[C-Up]',
    '[C-Down]',
    '[C-Left]',
    '[C-Right]',
    '[Control-Pad]'
];

const allowedChars = new Set<string|RegExp>([
    ///[a-zA-Z0-9]+/,
    'abcdefghijklmnopqrstuvwxyz',
    'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    '0123456789',
    ' ', '.', ',', '!', '?', "'", '"', ':', ';', '-', '_', '+', '=', '/', '\\', '(', ')', '[', ']', '{', '}', '\n', '\r', '\t', '*'
]);

function validateN64Chars(text: string): string {
  let validated = '';
  for (const char of text) {
    let isValid = false;
    for (const validator of allowedChars) {
        if (!isValid && typeof validator === 'string') {
            if (validator.length > 1) {
                for (const c of validator) {
                    if (char === c)
                        isValid = true;
                }
            }

            else isValid = char === validator;
        }

        else if (!isValid && (validator instanceof RegExp))
            isValid = validator.test(char);
    }
    if (isValid) {
      validated += char;
    } else {
      // Replace disallowed chars with '?', or just remove
      validated += ' ';  
      console.warn(`Disallowed char '${char}'`);
    }
  }
  return validated;
}

async function multiTranslate(block: string, maxLangsOverride?: number): Promise<string> {
    if (
        !block ||
        /^\s+$/.test(block) ||
        /^.\n$/.test(block) ||
        String(block).length === 1 ||
        ignoredPhrases.includes(block) ||
        block == undefined ||
        block == null ||
        String(block).toLowerCase() == 'undefined'
    ) return String(block || '');

    if (translationCache.has(block)) return translationCache.get(block) || String(block || '');

    for (let i = 0; i < wrappedPhrases.length; i++) {
        const phrase = wrappedPhrases[i];
        if (block.includes(phrase)) {
            const indexOf = block.indexOf(phrase);

            const left = block.substring(0, indexOf);
            const right = block.substring(indexOf + phrase.length);

            const leftTranslated = await multiTranslate(left);
            const rightTranslated = await multiTranslate(right);

            return leftTranslated + phrase + rightTranslated;
        }
    }

    const trimmedStartMatch = block.match(/^(\s+)/);
    const trimmedEndMatch = block.match(/(\s+)$/);

    let current = String(block).trim();

    // Random order for more funny, random number of languages
    const sortedRandomly = [...langs].sort(() => Math.random() * 2 - 1)
        .slice(
            0,
            Math.min(
                (minLangs - 1) + (Math.floor(Math.random() * ((maxLangsOverride ?? maxLangs) - minLangs) + 0.5)),
                langs.length - 1
            )
        );

    const localLangs = [sourceLang, ...sortedRandomly, targetLang];

    for (let i = 0; i < localLangs.length - 1; i++) {
        const fromLang = localLangs[i];
        const toLang = localLangs[i + 1];

        try {
            const res = await fetch(translateAddress, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    source: fromLang,
                    target: toLang,
                    q: current
                })
            })

            const json = await res.json();
            current = String(json.translatedText);
        } catch (err) {
            console.error(`Translation error (${fromLang} → ${toLang}):`, err);
            return String(block || '');
        }
    }

    if (trimmedStartMatch) current = trimmedStartMatch[1] + current;
    if (trimmedEndMatch) current = current + trimmedEndMatch[1];

    if (block[0] == ' ' && current[0] != ' ') current = ' ' + current;
    if (block[block.length - 1] == ' ' && current[current.length - 1] != ' ') current = current + ' ';

    translationCache.set(block, current);

    setTimeout(() => {
        translationCache.delete(block);
    }, 30_000 + (Math.random() * 90_000));

    return current;
}

const quotedStringRegex = /"((?:[^"\\]|\\.)*)"/g;

function extractDefineMessages(input: string): string[] {
    const messages: string[] = [];
    let i = 0;

    while (i < input.length) {
        const start = input.indexOf('DEFINE_MESSAGE(', i);
        if (start === -1) break;

        let openParens = 0;
        let end = start;
        let started = false;

        while (end < input.length) {
            if (input[end] === '(') {
                openParens++;
                started = true;
            } else if (input[end] === ')') {
                openParens--;
                if (openParens === 0 && started) {
                    end++;
                    break;
                }
            }
            end++;
        }

        const block = input.slice(start, end);
        messages.push(block);
        i = end;
    }

    return messages;
}

async function replaceAsyncSequential(
    str: string,
    regex: RegExp,
    asyncFn: (match: string, ...args: unknown[]) => Promise<string>
): Promise<string> {
    const matches: { match: string; index: number; args: unknown[] }[] = [];
    let match: RegExpExecArray | null;

    // Collect all matches and their indices
    while ((match = regex.exec(str)) !== null) {
        matches.push({ match: match[0], index: match.index, args: match.slice(1) });
    }

    // Perform replacements one by one
    let offset = 0;
    for (const m of matches) {
        const replacement = await asyncFn(m.match, ...m.args);
        const before = str.slice(0, m.index + offset);
        const after = str.slice(m.index + offset + m.match.length);
        str = before + replacement + after;

        offset += replacement.length - m.match.length;
    }

    return str;
}

async function runWithConcurrency<T>(
    items: T[],
    limit: number,
    fn: (item: T, index: number) => Promise<void>
) {
    let i = 0;
    const workers = new Array(limit).fill(0).map(async () => {
        while (i < items.length) {
            const index = i++;
            await fn(items[index], index);
        }
    });
    await Promise.all(workers);
}

function loadCheckpoint() {
    try {
        const data = Deno.readTextFileSync(checkpointPath);
        const match = data.match(/\/\/ CONTINUE FROM (\d+)/);
        if (match) {
            const idx = parseInt(match[1], 10);
            const lines = data.split('\n');
            // Remove the checkpoint line
            const contentWithoutMarker = lines.filter(l => !l.startsWith('// CONTINUE FROM')).join('\n');
            return { index: idx, previousData: contentWithoutMarker.split('\n') };
        }
    } catch { /* no file yet */ }
    return { index: 0, previousData: [] };
}

const messages = extractDefineMessages(rawData);
const { index: startIndex, previousData } = loadCheckpoint();

function saveCheckpoint(translations: string[]) {
    if (!translations.length) return;

    // Find longest contiguous filled section from index 0
    let lastFilled = 0;
    for (; lastFilled < translations.length; lastFilled++) {
        if (!translations[lastFilled]) break;
    }
        
    console.log('Saving progress to ' + checkpointPath);
    // Prepare output with progress marker
    const output =
        translations.slice(0, lastFilled).join('\n') +
        `\n// CONTINUE FROM ${lastFilled}`;

    // Overwrite the file — not append
    Deno.writeTextFileSync(checkpointPath, output);
}

const translations: string[] = [...previousData];

console.log(`Funny translator starting at index ${startIndex}/${messages.length}`);

// Save on Ctrl+C
Deno.addSignalListener("SIGINT", () => {
    console.log(`\nSaving progress...`);
    saveCheckpoint(translations);
    Deno.exit();
});

const concurrencyLimit = 10;
const indexPrintInterval = 1;
const printInterval = 3;
let translationsDone = 0;
const totalMessages = messages.length;

await runWithConcurrency(messages.slice(startIndex), concurrencyLimit, async (msg, i) => {
    const realIndex = startIndex + i;

    const quoteMatches = Array.from(msg.matchAll(quotedStringRegex));
    if (quoteMatches.length === 0) {
        translations[realIndex] = `// Skipped #${realIndex + 1}`;
        if (translationsDone % indexPrintInterval === 0)
            console.log(`Skipped ${realIndex + 1} / ${totalMessages}`);
        return;
    }

    const isIgnorable = (str: string) => {
        return ignoredPhrases.includes(str) || wrappedPhrases.includes(str);
    };

    const punctuationSet = new Set(ignoredPhrases);

    function fixFirstAndLastCharCase(original: string, translated: string): string {
        if (!original.length || !translated.length) return translated;
        if (translated.toUpperCase() === translated) return translated; // All caps is funny

        let fixed = translated;

        // Fix first character casing
        const firstOrig = original[0];
        const firstTrans = fixed[0];
        if (firstOrig.toLowerCase() === firstOrig) {
            // original first char is lowercase
            fixed = firstTrans.toLowerCase() + fixed.slice(1);
        } else {
            // original first char is uppercase
            fixed = firstTrans.toUpperCase() + fixed.slice(1);
        }

        // Fix last character casing
        /*const lastOrig = original[original.length - 1];
        const lastTrans = fixed[fixed.length - 1];
        if (lastOrig.toLowerCase() === lastOrig) {
            // original last char is lowercase
            fixed = fixed.slice(0, -1) + lastTrans.toLowerCase();
        } else {
            // original last char is uppercase
            fixed = fixed.slice(0, -1) + lastTrans.toUpperCase();
        }*/

        return fixed;
    }

    const findPhraseAtStart = (str: string, phrases: string[]) => {
        for (const phrase of phrases) {
            if (str.startsWith(phrase)) return phrase;
        }
        return '';
    };

    const findPhraseAtEnd = (str: string, phrases: string[]) => {
        for (const phrase of phrases) {
            if (str.endsWith(phrase)) return phrase;
        }
        return '';
    };

    const originals = quoteMatches.map(m => {
        let str = m[1].replace(/\\n/g, '\n');

        // Extract and remove the start and end ignored phrases (if any)
        const startPhrase = findPhraseAtStart(str, ignoredPhrases);
        if (startPhrase) str = str.slice(startPhrase.length);

        const endPhrase = findPhraseAtEnd(str, ignoredPhrases);
        if (endPhrase) str = str.slice(0, -endPhrase.length);

        return {
            str: str,
            startPhrase,
            endPhrase
        };
    });

    const marker = '\n';
    const joined = originals.map(o => o.str).join(` ${marker} `);

    let translatedParts: string[] | null = null;
    try {
        const translatedJoined = await multiTranslate(joined);
        const splitParts = translatedJoined.split(marker);

        if (splitParts.length === originals.length) {
            translatedParts = splitParts.map((p, idx) => {
                if (isIgnorable(originals[idx].str.trim())) {
                    p = originals[idx].str;
                } else {
                    const origTrimmed = originals[idx].str.trimEnd();
                    const transTrimmed = p.trimEnd();
                    const origLastChar = origTrimmed.slice(-1);
                    const transLastChar = transTrimmed.slice(-1);

                    if (!punctuationSet.has(origLastChar) && punctuationSet.has(transLastChar)) {
                        p = transTrimmed.slice(0, -1);
                    } else {
                        p = transTrimmed;
                    }

                    p = fixFirstAndLastCharCase(originals[idx].str, p);
                    if (p.length > 48)
                        p = p.substring(0, 48);
                }

                p = originals[idx].startPhrase + p + originals[idx].endPhrase;
                return p;
            });
        } else {
            console.warn(`Marker count mismatch at message ${realIndex + 1}, falling back to per-string translation.`);
            console.log(msg);
        }
    } catch (err) {
        console.error(`Error during joined translation:`, err);
    }

    let rebuiltBlock = msg;

    if (translatedParts) {
        translatedParts.forEach((part, idx) => {
            const reescaped = part.replace(/\n/g, '\\n').replace(/"/g, '\\"');
            rebuiltBlock = rebuiltBlock.replace(quoteMatches[idx][0], `"${reescaped}"`);
        });
    } else {
        rebuiltBlock = await replaceAsyncSequential(msg, quotedStringRegex, async (match, p1) => {
            if (!(<string>p1).trim()) return String(match);

            const original = (<string>p1).replace(/\\n/g, '\n');
            if (isIgnorable(original.trim())) {
                return `"${original.replace(/\n/g, '\\n').replace(/"/g, '\\"')}"`;
            }

            let translated = await multiTranslate(original, 5);

            const origTrimmed = original.trimEnd();
            const transTrimmed = translated.trimEnd();
            const origLastChar = origTrimmed.slice(-1);
            const transLastChar = transTrimmed.slice(-1);

            if (!punctuationSet.has(origLastChar) && punctuationSet.has(transLastChar)) {
                translated = transTrimmed.slice(0, -1);
            } else {
                translated = transTrimmed;
            }

            translated = fixFirstAndLastCharCase(original, translated);

            const reescaped = translated.replace(/\n/g, '\\n').replace(/"/g, '\\"');
            return `"${reescaped}"`;
        });
    }

    rebuiltBlock = validateN64Chars(rebuiltBlock);
    const result = convertDefineToEztr(rebuiltBlock);

    if (!result) {
        console.log(`Skipped ${realIndex + 1} / ${totalMessages}`);
        console.log(rebuiltBlock);
        translations[realIndex] = `// Skipped #${realIndex + 1}`;
        return;
    }

    translations[realIndex] = result;
    translationsDone++;

    if (translationsDone % indexPrintInterval === 0) {
        console.log(`${realIndex + 1} / ${messages.length}`);
    }
    if (translationsDone % printInterval === 0) {
        console.log('FROM:');
        console.table(msg.split('\n'));
        console.log('TO:');
        console.table(result.split('\n'));
    }
});

// Remove checkpoint marker after full completion
Deno.writeTextFileSync(outputPath, `#include "eztr_api.h"

EZTR_ON_INIT void replace_msgs() {
${translations.map(t => '    ' + t.split('\n').join('\n    ')).join('\n')}
}`);
console.log('✅ All done, output written to ' + outputPath);