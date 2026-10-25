<script setup>
import {computed} from 'vue';
import {R4_BRAND_PATHS,R4_BRAND_SOURCE_SHA256} from './r4-brand-paths.mjs';
const props=defineProps({name:{type:String,required:true},size:{type:Number,default:28}});
const alias={FB_PERSONAL:'messenger',FB_PAGE:'facebook',WHATSAPP_PERSONAL:'whatsapp',TELEGRAM_PERSONAL:'telegram'};
const type=computed(()=>alias[props.name]||null);
const path=computed(()=>type.value?R4_BRAND_PATHS[type.value]:null);
const title=computed(()=>({messenger:'Messenger',facebook:'Facebook Page',whatsapp:'WhatsApp',telegram:'Telegram'})[type.value]||'未支持的渠道');
</script>
<template>
 <span v-if="path" class="w46-r4-brand-icon" :data-r4-svg-sha="R4_BRAND_SOURCE_SHA256"
   :data-brand="type" :aria-label="title" role="img">
  <svg :width="size" :height="size" viewBox="0 0 24 24" fill="currentColor"
     xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
   <path :d="path"/>
  </svg>
 </span>
</template>
<style>
.w46-r4-brand-icon{display:inline-grid;place-items:center;flex-shrink:0;
 width:34px;height:34px;border-radius:9px;color:#fff}
.w46-r4-brand-icon[data-brand=messenger]{background:#1689fb}
.w46-r4-brand-icon[data-brand=facebook]{background:#1877f2}
.w46-r4-brand-icon[data-brand=whatsapp]{background:#25d366}
.w46-r4-brand-icon[data-brand=telegram]{background:#26a5e4}
</style>