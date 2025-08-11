import convertDefineToEztr from './eztr.ts';
import { resolve } from 'jsr:@std/path';

const rawData = Deno.readTextFileSync('message_data.h');

const outputPath = resolve('..', 'src', 'poorly_translated.c');
const checkpointPath = 'checkpoint_data.c';

// Languages to translate through
const sourceLang = 'en';
const targetLang = 'en';
const langs: string[] = [
    'ar',
    'zh',
    'pt',
    'nl',
    'th',
    'ko',
    'da',
    'ms',
    'ru',
    'fi',
    'es'
];

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
    ', '
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

async function multiTranslate(block: string): Promise<string> {
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

    // Random order for more funny
    const sortedRandomly = [...langs].sort(() => Math.random() * 2 - 1);
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
            return { index: idx, previousData: contentWithoutMarker.split('\n\n') };
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
        translations.slice(0, lastFilled).join('\n\n') +
        `\n\n// CONTINUE FROM ${lastFilled}`;

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

const concurrencyLimit = 5;
const indexPrintInterval = 1;
const printInterval = 3;
let translationsDone = 0;

await runWithConcurrency(messages.slice(startIndex), concurrencyLimit, async (msg, i) => {
    const realIndex = startIndex + i;
    let newBlock = await replaceAsyncSequential(msg, quotedStringRegex, async (match, p1) => {
        if (!(<string>p1).trim()) return String(match);
        const original = (<string>p1).replace(/\\n/g, '\n');
        const translated = await multiTranslate(original);
        const reescaped = translated.replace(/\n/g, '\\n').replace(/"/g, '\\"');
        return `"${reescaped}"`;
    });

    const result = convertDefineToEztr(newBlock);
    if (!result) {
        console.log(`Skipping ${realIndex + 1} / ${messages.length}`);
        console.log(newBlock);

        translations[realIndex] = `// Skipped #${realIndex + 1}`;
        return;
    };

    newBlock = result;

    translations[realIndex] = newBlock;
    translationsDone++;

    if (translationsDone % indexPrintInterval === 0) {
        console.log(`${realIndex + 1} / ${messages.length}`);
    }

    if (translationsDone % printInterval === 0) {
        console.log('FROM:')
        console.table(msg.split('\n'));
        console.log('TO:')
        console.table(newBlock.split('\n'))
    }
});

// Remove checkpoint marker after full completion
Deno.writeTextFileSync(outputPath, `#include "eztr_api.h"

EZTR_ON_INIT void replace_msgs() {
${translations.map(t => '    ' + t.split('\n').join('\n    ')).join('\n\n')}
}`);
console.log('✅ All done, output written to ' + outputPath);