// Event classification helpers for mscx2ly's render pipeline.
// See tickets/00-background.md for why this exists.

/**
 * Classifies a single already-filtered MuseScore voice-child node (see
 * lib.js readStaffInfo's child filter) into whether it counts as real
 * musical content for voicing decisions, or is purely structural/decorative.
 * @param {{ name: string }} evt an XmlWrapper-like object with a `.name`
 * @returns {'chord' | 'rest' | 'structural'}
 */
export function classifyVoiceEvent(evt) {
    if (evt.name === 'Chord') return 'chord';
    if (evt.name === 'Rest') return 'rest';
    return 'structural';
}

/**
 * @param {{ name: string }[]} voiceEvents one voice's array of filtered children
 * @returns {boolean} true if this voice has at least one Chord or Rest
 */
export function voiceHasMusicalContent(voiceEvents) {
    return voiceEvents.some((evt) => {
        const kind = classifyVoiceEvent(evt);
        return kind === 'chord' || kind === 'rest';
    });
}