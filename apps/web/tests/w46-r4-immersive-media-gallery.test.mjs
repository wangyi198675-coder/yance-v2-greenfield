import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const media=readFileSync(new URL('../src/BCMediaWorkspace.vue',import.meta.url),'utf8');
test('R4 media gallery foregrounds media, not three permanent admin columns',()=>{
 for(const name of ['w46-media-library','media-asset-grid','bc-gallery-grid','bc-gallery-tile',
   'bc-gallery-search','media-filter-toggle','media-authoritative-empty','media-refresh'])
  assert.ok(media.includes(name),name);
 assert.doesNotMatch(media,/bc-media-columns|grid-template-columns:minmax\(220px,1\.35fr\)/);
 assert.match(media,/bc-gallery-main\{flex:1/);
});
test('gallery real previews and thumbnails use original W23 scoped byte port only',()=>{
 assert.match(media,/port\.value\.binary\(item\.asset_id\)/);
 assert.match(media,/port\.value\.uploadFile\(file/);
 assert.match(media,/port\.value\.remove\(id\)/);
 assert.match(media,/currentScope\?createW23BrowserMediaClient/);
 assert.match(media,/IntersectionObserver/);
 assert.match(media,/thumbRequests>=16/);
 assert.match(media,/thumbBusy<2/);
 assert.match(media,/URL\.revokeObjectURL/);
 assert.doesNotMatch(media,/unsplash\.com|placeholder\.com|picsum\.photos|mockAssets|fakeSuccess/);
});
test('context media features stay available but no always-visible diagnostics or fabricated authorizations',()=>{
 for(const name of ['w46-media-preview','w46-media-capabilities','media-capabilities-toggle',
  'media-download','media-delete','media-upload','media-file-input','media-filter-all'])
  assert.ok(media.includes(name)||name==='media-filter-all'&&media.includes("media-filter-'+f.id"),name);
 assert.match(media,/v-if="selected" class="bc-gallery-preview-overlay"/);
 assert.match(media,/bc-gallery-capabilities:not\(\[open\]\)\{display:none\}/);
 assert.match(media,/W23原生分页仍需W47接入/);
 assert.match(media,/!port/);
 assert.match(media,/prefers-reduced-motion:reduce/);
});
test('gallery uses mobile two-column layout and single compact global content header',()=>{
 assert.match(media,/max-width:950px/);
 assert.match(media,/max-width:600px/);
 assert.match(media,/max-width:360px/);
 assert.match(media,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.match(media,/min-height:56px/);
});