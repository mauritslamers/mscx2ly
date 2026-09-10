// Per-measure voicing/polyphony analysis for mscx2ly's render pipeline.
// See tickets/00-background.md for why this exists.
import { voiceHasMusicalContent } from './events.js';

/**
 * Decides a measure's voice structure from data, not from rendered text.
 * @param {{ name: string }[][]} voiceEventArrays one filtered child array per voice, in voice order
 * @returns {{ type: 'empty' } | { type: 'single', voiceIdx: number } | { type: 'parallel', voiceIdxs: number[] }}
 */
export function analyzeVoicing(voiceEventArrays) {
    const musicalVoiceIdxs = [];
    voiceEventArrays.forEach((events, idx) => {
        if (voiceHasMusicalContent(events)) {
            musicalVoiceIdxs.push(idx);
        }
    });
    if (musicalVoiceIdxs.length === 0) return { type: 'empty' };
    if (musicalVoiceIdxs.length === 1) return { type: 'single', voiceIdx: musicalVoiceIdxs[0] };
    return { type: 'parallel', voiceIdxs: musicalVoiceIdxs };
}