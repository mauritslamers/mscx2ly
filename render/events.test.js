import test from 'ava';
import { classifyVoiceEvent, voiceHasMusicalContent } from './events.js';

test('classifyVoiceEvent: Chord -> chord', t => {
    t.is(classifyVoiceEvent({ name: 'Chord' }), 'chord');
});

test('classifyVoiceEvent: Rest -> rest', t => {
    t.is(classifyVoiceEvent({ name: 'Rest' }), 'rest');
});

test('classifyVoiceEvent: everything else -> structural', t => {
    for (const name of ['KeySig', 'TimeSig', 'Tempo', 'Dynamic', 'Spanner', 'BarLine', 'VBox', 'Clef', 'Fermata', 'PlayTechAnnotation']) {
        t.is(classifyVoiceEvent({ name }), 'structural', `expected ${name} to be structural`);
    }
});

test('voiceHasMusicalContent: false when only structural events', t => {
    t.false(voiceHasMusicalContent([{ name: 'KeySig' }, { name: 'Clef' }]));
});

test('voiceHasMusicalContent: true with a Chord present', t => {
    t.true(voiceHasMusicalContent([{ name: 'KeySig' }, { name: 'Chord' }]));
});

test('voiceHasMusicalContent: true with a Rest present', t => {
    t.true(voiceHasMusicalContent([{ name: 'Rest' }]));
});

test('voiceHasMusicalContent: false for an empty voice', t => {
    t.false(voiceHasMusicalContent([]));
});