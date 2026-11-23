<script setup>
import { computed } from 'vue'
const props = defineProps({ slot: Number, role: String, compact: Boolean })
const art = import.meta.glob('../../../../public/ui-assets/nikke/equipment/overload/*.png', { eager: true, import: 'default', query: '?url' })
const families = {
  Attacker: ['vmetal', '火力型', 'ν金属面罩', 'ν金属背心', 'ν金属护臂', 'ν金属靴子'],
  Defender: ['99', '防御型', '99型头盔', '99型防护服', '99型臂铠', '99型护腿'],
  Supporter: ['code', '辅助型', '代号XXX护目镜', '代号XXX夹克', '代号XXX手套', '代号XXX鞋'],
}
const family = computed(() => families[props.role] || families.Attacker)
const slots = ['head', 'body', 'arms', 'legs']
const parts = ['头部', '躯干', '臂部', '腿部']
const icon = computed(() => art[`../../../../public/ui-assets/nikke/equipment/overload/${family.value[0]}-${slots[props.slot]}.png`])
</script>
<template>
  <div class="gear-portrait" :class="{compact}">
    <template v-if="!compact">
      <div class="gear-class"><span>{{ family[1] }}</span><span>{{ parts[slot] }}</span></div>
      <b class="ol-wordmark">OVERLOAD</b>
    </template>
    <div class="gear-icon"><img :src="icon" :alt="family[slot + 2]" /><img class="ol-badge" src="../../../../public/ui-assets/nikke/equipment/overload-badge.png" alt="" /></div>
    <h3 v-if="!compact">{{ family[slot + 2] }}</h3>
  </div>
</template>
