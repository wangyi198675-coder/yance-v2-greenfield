# W09-3 | MIT Inspira Aurora global visual delta on REAL current fixed-44751 Persona UI
Base source: 02764244af7ae329085c4bb0c1cec939780d5a20. This delta never replaces existing multi-account/People/Persona/autopilot/Agno/Composer or user authorizations.

Open-source design: Inspira UI AuroraBackground (https://github.com/unovue/inspira-ui), MIT notice in apps/web/evidence/INSPIRA_UI_AURORA_LICENSE.md. Preserve existing shadcn-vue / Reka interactive controls.

Implementation: exactly three lines of additional decorative component import, scoped stylesheet import and aria-hidden visual layer mount in existing BCProductWorkspaceCandidate.vue. No new JS framework, secret storage or platform sender. Existing 5 theme choices and browser-native appearance preference kept.
CSS themes cover compact shell, Contact UI, single Brain, Composer, People, Media, Settings, and Persona visible surfaces. Reduced-motion and high-contrast modes supported. Visual layer cannot intercept pointer events.

Actual Chrome provenance: current Persona source at 44964, verified JS index-DZaCDoYJ.js, five themes x four widths (1360/950/430/360) = 20/20 PASS. Real Chrome screenshots and JSON in folder. Existing 27 code regression tests PASS. Strict W47 source gate, fixed 44751 switch and post-release readback remain separate gates. Never claim social account connectivity or external model/send approval from this UI-only work.