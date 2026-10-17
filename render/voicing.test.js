import test from 'ava';
import { analyzeVoicing } from './voicing.js';

test('analyzeVoicing: empty when no voice has musical content', t => {
    const result = analyzeVoicing([[{ name: 'KeySig' }], [{ name: 'Clef' }]]);
    t.deepEqual(result, { type: 'empty' });
});

test('analyzeVoicing: empty for zero voices', t => {
    t.deepEqual(analyzeVoicing([]), { type: 'empty' });
});

test('analyzeVoicing: single when exactly one voice has musical content', t => {
    const result = analyzeVoicing([[{ name: 'KeySig' }], [{ name: 'Chord' }]]);
    t.deepEqual(result, { type: 'single', voiceIdx: 1 });
});

test('analyzeVoicing: parallel when two or more voices have musical content', t => {
    const result = analyzeVoicing([[{ name: 'Chord' }], [{ name: 'Rest' }]]);
    t.deepEqual(result, { type: 'parallel', voiceIdxs: [0, 1] });
});

test('analyzeVoicing: parallel voiceIdxs skip voices without musical content', t => {
    const result = analyzeVoicing([[{ name: 'Chord' }], [{ name: 'KeySig' }], [{ name: 'Rest' }]]);
    t.deepEqual(result, { type: 'parallel', voiceIdxs: [0, 2] });
});