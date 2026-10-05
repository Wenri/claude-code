// Reconstructed 2.1.89 component module boundary; not an authenticated original path.
import { c as _c } from 'react/compiler-runtime';
import React from 'react';
import { renderSprite } from '../../buddy/sprites.js';
import { RARITY_COLORS, RARITY_STARS, STAT_NAMES } from '../../buddy/types.js';
import { Box, Text, useInput } from '../../ink.js';

function CompanionStat(t0) {
  const $ = _c(26);
  const {
    name,
    value
  } = t0;
  let T0;
  let T1;
  let filled;
  let t1;
  let t2;
  if ($[0] !== name || $[1] !== value) {
    filled = Math.round(value / 10);
    T1 = Box;
    let t3;
    if ($[7] !== name) {
      t3 = name.padEnd(10);
      $[7] = name;
      $[8] = t3;
    } else {
      t3 = $[8];
    }
    if ($[9] !== t3) {
      t2 = <Text>{t3} </Text>;
      $[9] = t3;
      $[10] = t2;
    } else {
      t2 = $[10];
    }
    T0 = Text;
    t1 = "\u2588".repeat(filled);
    $[0] = name;
    $[1] = value;
    $[2] = T0;
    $[3] = T1;
    $[4] = filled;
    $[5] = t1;
    $[6] = t2;
  } else {
    T0 = $[2];
    T1 = $[3];
    filled = $[4];
    t1 = $[5];
    t2 = $[6];
  }
  let t3;
  if ($[11] !== filled) {
    t3 = "\u2591".repeat(10 - filled);
    $[11] = filled;
    $[12] = t3;
  } else {
    t3 = $[12];
  }
  let t4;
  if ($[13] !== T0 || $[14] !== t1 || $[15] !== t3) {
    t4 = <T0>{t1}{t3} </T0>;
    $[13] = T0;
    $[14] = t1;
    $[15] = t3;
    $[16] = t4;
  } else {
    t4 = $[16];
  }
  const t5 = String(value);
  let t6;
  if ($[17] !== t5) {
    t6 = t5.padStart(3);
    $[17] = t5;
    $[18] = t6;
  } else {
    t6 = $[18];
  }
  let t7;
  if ($[19] !== t6) {
    t7 = <Text dimColor={true}>{t6}</Text>;
    $[19] = t6;
    $[20] = t7;
  } else {
    t7 = $[20];
  }
  let t8;
  if ($[21] !== T1 || $[22] !== t2 || $[23] !== t4 || $[24] !== t7) {
    t8 = <T1>{t2}{t4}{t7}</T1>;
    $[21] = T1;
    $[22] = t2;
    $[23] = t4;
    $[24] = t7;
    $[25] = t8;
  } else {
    t8 = $[25];
  }
  return t8;
}

export function CompanionCard(t0) {
  const $ = _c(45);
  const {
    companion,
    lastReaction,
    onDone
  } = t0;
  const color = RARITY_COLORS[companion.rarity];
  const sprite = renderSprite(companion);
  let t1;
  if ($[0] !== onDone) {
    t1 = () => onDone?.(undefined, {
      display: "skip"
    });
    $[0] = onDone;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  const t2 = onDone !== undefined;
  let t3;
  if ($[2] !== t2) {
    t3 = {
      isActive: t2
    };
    $[2] = t2;
    $[3] = t3;
  } else {
    t3 = $[3];
  }
  useInput(t1, t3);
  const T0 = Box;
  const t4 = "column";
  const t5 = "round";
  const t6 = 2;
  const t7 = 1;
  const t8 = 40;
  const t9 = 0;
  const t10 = RARITY_STARS[companion.rarity];
  let t11;
  if ($[4] !== companion.rarity) {
    t11 = companion.rarity.toUpperCase();
    $[4] = companion.rarity;
    $[5] = t11;
  } else {
    t11 = $[5];
  }
  let t12;
  if ($[6] !== color || $[7] !== t10 || $[8] !== t11) {
    t12 = <Text bold={true} color={color}>{t10} {t11}</Text>;
    $[6] = color;
    $[7] = t10;
    $[8] = t11;
    $[9] = t12;
  } else {
    t12 = $[9];
  }
  let t13;
  if ($[10] !== companion.species) {
    t13 = companion.species.toUpperCase();
    $[10] = companion.species;
    $[11] = t13;
  } else {
    t13 = $[11];
  }
  let t14;
  if ($[12] !== color || $[13] !== t13) {
    t14 = <Text color={color}>{t13}</Text>;
    $[12] = color;
    $[13] = t13;
    $[14] = t14;
  } else {
    t14 = $[14];
  }
  let t15;
  if ($[15] !== t12 || $[16] !== t14) {
    t15 = <Box justifyContent="space-between">{t12}{t14}</Box>;
    $[15] = t12;
    $[16] = t14;
    $[17] = t15;
  } else {
    t15 = $[17];
  }
  let t16;
  if ($[18] !== companion.shiny) {
    t16 = companion.shiny && <Text color="warning" bold={true}>✨ SHINY ✨</Text>;
    $[18] = companion.shiny;
    $[19] = t16;
  } else {
    t16 = $[19];
  }
  const T1 = Box;
  const t17 = "column";
  const t18 = 1;
  let t19;
  if ($[20] !== color) {
    t19 = (line, index) => <Text key={index} color={color}>{line}</Text>;
    $[20] = color;
    $[21] = t19;
  } else {
    t19 = $[21];
  }
  const t20 = sprite.map(t19);
  let t21;
  if ($[22] !== T1 || $[23] !== t20) {
    t21 = <T1 flexDirection={t17} marginY={t18}>{t20}</T1>;
    $[22] = T1;
    $[23] = t20;
    $[24] = t21;
  } else {
    t21 = $[24];
  }
  let t22;
  if ($[25] !== companion.name) {
    t22 = <Text bold={true}>{companion.name}</Text>;
    $[25] = companion.name;
    $[26] = t22;
  } else {
    t22 = $[26];
  }
  const t23 = `"${companion.personality}"`;
  let t24;
  if ($[27] !== t23) {
    t24 = <Box marginY={1}><Text dimColor={true} italic={true}>{t23}</Text></Box>;
    $[27] = t23;
    $[28] = t24;
  } else {
    t24 = $[28];
  }
  let t25;
  if ($[29] !== companion.stats) {
    t25 = STAT_NAMES.map(name => <CompanionStat key={name} name={name} value={companion.stats[name]} />);
    $[29] = companion.stats;
    $[30] = t25;
  } else {
    t25 = $[30];
  }
  let t26;
  if ($[31] !== t25) {
    t26 = <Box flexDirection="column">{t25}</Box>;
    $[31] = t25;
    $[32] = t26;
  } else {
    t26 = $[32];
  }
  let t27;
  if ($[33] !== lastReaction) {
    t27 = lastReaction && <Box flexDirection="column" marginTop={1}><Text dimColor={true}>last said</Text><Box borderStyle="round" borderColor="inactive" paddingX={1}><Text dimColor={true} italic={true}>{lastReaction}</Text></Box></Box>;
    $[33] = lastReaction;
    $[34] = t27;
  } else {
    t27 = $[34];
  }
  let t28;
  if ($[35] !== T0 || $[36] !== color || $[37] !== t15 || $[38] !== t16 || $[39] !== t21 || $[40] !== t22 || $[41] !== t24 || $[42] !== t26 || $[43] !== t27) {
    t28 = <T0 flexDirection={t4} borderStyle={t5} borderColor={color} paddingX={t6} paddingY={t7} width={t8} flexShrink={t9}>{t15}{t16}{t21}{t22}{t24}{t26}{t27}</T0>;
    $[35] = T0;
    $[36] = color;
    $[37] = t15;
    $[38] = t16;
    $[39] = t21;
    $[40] = t22;
    $[41] = t24;
    $[42] = t26;
    $[43] = t27;
    $[44] = t28;
  } else {
    t28 = $[44];
  }
  return t28;
}

