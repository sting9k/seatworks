---
name: frontend-design
description: "Use this skill before you build or change anything a person sees and uses: a screen, a page, a form, a dialog, a component, its HTML or CSS. It holds how to make it right to use and not only right to compile: every state, the order of things, the words, the keyboard. Not for the logic behind it."
---

# Frontend design

A screen is finished when someone can use it at its worst moment: no data yet, the request failed, the name is forty
characters long, there is no mouse. Most of what goes wrong was never drawn.

1. **Who does what here**, in a sentence, and the one thing they came to do. That thing is the screen's one loud
   control; everything else is quieter.
2. **What the project already has.** Its components, its spacing and type steps, its colours by name, its way of
   saying things. Use them. A new component or a number of your own needs a reason the existing ones cannot meet.
3. **Every state, before any polish**: empty, loading, part loaded, failed, done, too much, too long a word, narrow,
   not allowed. Each says what happened and what to do next. Build them as states of one component, so none can be
   forgotten.
4. **Order and weight.** What matters most is first and largest; things that belong together sit together; spacing
   and sizes come from the project's steps, never by eye.
5. **Words.** A control is named for what it does. An error says what to do about it. A label is a label, never a
   placeholder that vanishes on the first key.
6. **Without a mouse, and without sight.** Everything reachable by keyboard in a sensible order, focus you can see,
   a name on every control, nothing told by colour alone, text that stands out from its ground.

## Proof

Look at it. Run it and capture each state, at a wide and at a narrow width, with what you have: a browser tool, a
headless run, the project's own visual tests. Put the captures where your brief says, or say in your hand-back that
you could not run it and what was therefore not seen. That it compiles says nothing of a screen.

Behaviour is tested as anywhere (`test-first`): each state reached by what causes it, the keyboard path walked.

## Ends in

`hand_back` on the commit, with each state beside its capture or its test, and what you could not look at.
