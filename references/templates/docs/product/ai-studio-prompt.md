# {{PRODUCT_NAME}} — AI Studio Scaffolding Prompt

<!--
  This prompt is designed for Google AI Studio's Build mode
  (aistudio.google.com → Build tab).

  Steps:
  1. Open https://aistudio.google.com/ and navigate to the Build tab
  2. Paste everything below the --- line into the description box
  3. Let Gemini generate the prototype
  4. Iterate via chat ("make the buttons coral", "add a filter bar") until the UI feels right
  5. Download the project as a ZIP
  6. Extract the ZIP contents into `/prototype` at the root of this repo
  7. Return to your terminal and run `/substrate:migrate`
-->

---

Build a **{{PRODUCT_NAME}}** — {{ONE_LINE_DESCRIPTION}}.

## Who it's for

{{PERSONA_DESCRIPTION}}

## What users do (primary flows)

{{USER_FLOWS}}

## Core concepts (data model)

{{ENTITIES_AND_FIELDS}}

## Key pages

{{KEY_PAGES}}

## Look & feel

{{UI_STYLE_NOTES}}

## Constraints

- Use **Vite + React + TypeScript** (the default stack for AI Studio Build).
- Use **Tailwind CSS** for styling.
- **No backend yet** — stub data with `useState` and in-memory arrays. A real Convex backend will be wired in a later stage.
- **No authentication yet** — show all pages unconditionally.
- Keep the code **idiomatic**; don't over-engineer.
- Optimise for **clear component boundaries** — one file per component, named exports.

## Output

A runnable Vite + React + TypeScript app I can preview in AI Studio and iterate on.
