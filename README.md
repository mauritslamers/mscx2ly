# MSCX2LY

mscx2ly is a simple converter to extract a subset of musical information from
a MuseScore project file.

The tool reads the MuseScore project file, extracts the parts and tries to
reassemble the sections and staffs as well as possible.

From this it generates three outputs:
- music: for every staff in the part (can be multiple in case of e.g. piano)
  a macro is generated with the name of the part (plus a number in case of 
  multiple staffs) containing the notes of that part.
- score: From the parts and sections available in the musescore file, an attempt
  is made to recreate a partiture that resembles the original layout.
- parts: From the parts and music, a set of books are created, allowing you to
  render the separate parts as PDFs.

The score and the parts depend on the macros generated in the music part.

The tool allows you to save these parts in a single file as well as separate 
files. 

## Install

```
npm install mscx2ly --global
```

## Use
```
    mscx2ly sourcefile.mscz targetfile.ly
```

or use the other options. Run 

```
    mcsx2ly --help
``` 

for a list of options.

## Limitations
This tool is currently limited in what it exports from MuseScore.
At the moment only the parts, staffs and notes/rests are exported, and where
possible forced accidentals. Any other information is ignored. See under Future
what is intended to be supported in the future.

## Use case
I wrote this tool as a way to prevent having to retype all the notes in 
Lilypond. I like MuseScore as a composition and arranging environment, but the
notation it produces isn't very pleasing, and certainly not of the level and 
flexibility that Lilypond offers.
In addition, MuseScore often requires the use of tricks with all kinds of 
articulations in order to get the kind of sound out of an instrument that is
usable for others. This doesn't often match with how that should be written in 
a part, which is why this is not (yet) implemented.

## Rationale
MusicXML is not a music format, despite the name. MusicXML is a music notation 
format, but one that positions elements. This makes it hard for engraver-like 
programs like Lilypond to apply their own rules. Any mistakes in the notation 
will inevitably transfer to other programs.

## Future additions
In the future, I would like to add the following missing features:
- repeats
- tempo
- dynamics
- texts such as "pizz." and "arco"
- some types of articulations like tremolo
- specific instrument specific marks, such as downbow, upbow, open strings