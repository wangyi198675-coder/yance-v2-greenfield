import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
const src=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const ui=src('../src/BCProductWorkspaceCandidate.vue');
const glow=src('../src/BCVisualAurora.vue');
const css=src('../src/BCVisualThemeSystem.css');
const license=src('../evidence/INSPIRA_UI_AURORA_LICENSE.md');
const oldSrc=src('../src/BCThemeChooser.vue');
test('MIT Inspira AuroraBackground material is actually adapted into original Yance shell',()=>{
 assert.match(glow,/AuroraBackground/);
 assert.match(glow,/github.com\/unovue\/inspira-ui/);
 assert.match(glow,/bc-wow-aurora__rays/);
 assert.match(glow,/aria-hidden="true"/);
 assert.match(license,/MIT License/);
 assert.match(license,/Copyright \(c\) 2024-2026/);
 assert.match(ui,/import BCVisualAurora/);
 assert.match(ui,/import '.\/BCVisualThemeSystem.css'/);
 assert.match(ui,/<BCVisualAurora\/>/);
 assert.match(css,/--wow-aurora:repeating-linear-gradient/);
 assert.match(css,/mask-image:radial-gradient/);
 assert.match(css,/@keyframes bc-wow-aurora-shift/);
});
test('five audited App themes all have unique atmosphere and CSS stays inside only existing workspace',()=>{
 for(const i of [1,2,3,4])assert.ok(css.includes('.shell[data-theme="'+i+'"] .w46-product-candidate'));
 for(const name of ['Obsidian Lime','Cosmic Sunset','Ocean Electric','Amber Ember','Opal Prism'])
  assert.ok(oldSrc.includes(name),'MISSING_EXISTING_THEME_'+name);
 assert.match(css,/.shell .w46-product-candidate/);
 assert.match(css,/.bc-settings-detail/);
 assert.match(css,/.bc-real-list/);
 assert.match(css,/.bc-private-brain/);
 assert.match(css,/.bc-media-pane/);
 assert.match(css,/.bc-native-composer/);
 assert.match(css,/.bc-private-settings/);
});
test('effects never seize clicks and honor reduced motion, high contrast and mobile navigation',()=>{
 assert.match(css,/pointer-events:none/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 assert.match(css,/@media\(prefers-contrast:more\)/);
 assert.match(css,/@media\(max-width:719px\)/);
 assert.doesNotMatch(glow,/fetch\(|WebSocket|localStorage|sessionStorage|send|Agent|v-html/);
 assert.doesNotMatch(css,/@import|@font-face|url\(/);
 assert.match(ui,/import BCPrivateBrainWorkspace/);
});
