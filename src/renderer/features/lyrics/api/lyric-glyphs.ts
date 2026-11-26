import { testRtl } from '/@/renderer/features/lyrics/api/lyrics-rtl';
import { sanitize } from '/@/renderer/utils/sanitize';

// Wrap display glyphs without splitting emoji, ruby annotations or joined scripts.
export const prepareFloatingLyric = (text: string): string => {
    const html = sanitize(text);
    if (typeof Intl.Segmenter !== 'function') return html;
    const characters = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
    const words = new Intl.Segmenter(undefined, { granularity: 'word' });
    const template = document.createElement('template');
    template.innerHTML = html;
    const glyphs: HTMLElement[] = [];
    const wrap = (node: Node) => {
        if (node.nodeType === Node.TEXT_NODE) {
            const text = node.textContent ?? '';
            const fragment = document.createDocumentFragment();
            for (const word of words.segment(text)) {
                const group = document.createElement('span');
                group.className = 'lyric-word';
                const segments = testRtl(word.segment)
                    ? [word.segment]
                    : Array.from(characters.segment(word.segment), (part) => part.segment);
                for (const character of segments) {
                    if (!character.trim()) {
                        fragment.append(document.createTextNode(character));
                        continue;
                    }
                    const glyph = document.createElement('span');
                    glyph.className = 'lyric-glyph';
                    glyph.textContent = character;
                    glyphs.push(glyph);
                    group.append(glyph);
                }
                if (group.childNodes.length) fragment.append(group);
            }
            node.parentNode?.replaceChild(fragment, node);
        } else if (node instanceof HTMLElement && node.tagName === 'RUBY') {
            const glyph = document.createElement('span');
            glyph.className = 'lyric-glyph';
            node.replaceWith(glyph);
            glyph.append(node);
            glyphs.push(glyph);
        } else {
            Array.from(node.childNodes).forEach(wrap);
        }
    };
    wrap(template.content);
    glyphs.forEach((glyph, index) => {
        glyph.style.setProperty(
            '--lyric-glyph-delay',
            `${(index / Math.max(1, glyphs.length - 1)) * 0.3}s`,
        );
    });
    return template.innerHTML;
};
