import { c as _c } from 'react/compiler-runtime';
import figures from 'figures';
import { Box, Text } from '../../ink.js';
import { useKeybindings } from '../../keybindings/useKeybinding.js';
import { logEvent } from '../../services/analytics/index.js';
import { getGlobalConfig, saveGlobalConfig } from '../../utils/config.js';
import { Select } from '../../components/CustomSelect/select.js';
import { Pane } from '../../components/design-system/Pane.js';
import { ProgressBar } from '../../components/design-system/ProgressBar.js';
import { StatusIcon } from '../../components/design-system/StatusIcon.js';
import { Celebration, ShimmerTitle } from './demos.js';
import { LESSONS, ListHint, DetailHint } from './lessons.js';
import * as React from 'react';
import { useState } from 'react';

type Lesson = (typeof LESSONS)[number];

export default function Powerup(t0) {
  const $ = _c(47);
  const {
    onExit
  } = t0;
  const [unlocked, setUnlocked] = useState(getUnlockedPowerups);
  const [selectedLesson, setSelectedLesson] = useState(null);
  const [focusedLesson, setFocusedLesson] = useState(LESSONS[0].id);
  const [celebrating, setCelebrating] = useState(false);
  let t1;
  if ($[0] === Symbol.for("react.memo_cache_sentinel")) {
    t1 = () => setCelebrating(false);
    $[0] = t1;
  } else {
    t1 = $[0];
  }
  const finishCelebration = t1;
  let t2;
  if ($[1] !== unlocked) {
    t2 = function (lesson) {
      setFocusedLesson(lesson.id);
      setSelectedLesson(lesson);
      logEvent("tengu_powerup_lesson_opened", {
        lesson_id: lesson.id,
        was_already_unlocked: unlocked.has(lesson.id),
        unlocked_count: unlocked.size
      });
    };
    $[1] = unlocked;
    $[2] = t2;
  } else {
    t2 = $[2];
  }
  const openLesson = t2;
  let t3;
  if ($[3] !== unlocked) {
    t3 = function (id) {
      if (unlocked.has(id)) {
        return;
      }
      const next = new Set(unlocked).add(id);
      setUnlocked(next);
      saveGlobalConfig(config => ({
        ...config,
        powerupsUnlocked: [...next]
      }));
      logEvent("tengu_powerup_lesson_completed", {
        lesson_id: id,
        unlocked_count: next.size,
        all_unlocked: next.size === LESSONS.length
      });
      if (next.size === LESSONS.length) {
        setCelebrating(true);
      }
    };
    $[3] = unlocked;
    $[4] = t3;
  } else {
    t3 = $[4];
  }
  const completeLesson = t3;
  let t4;
  if ($[5] !== unlocked) {
    t4 = LESSONS.map(lesson_0 => {
      const isUnlocked = unlocked.has(lesson_0.id);
      const label = `${isUnlocked ? figures.tick : figures.circle} ${lesson_0.title}`;
      return {
        label: isUnlocked ? <Text color="success">{label}</Text> : label,
        value: lesson_0.id,
        description: lesson_0.tagline
      };
    });
    $[5] = unlocked;
    $[6] = t4;
  } else {
    t4 = $[6];
  }
  const options = t4;
  if (selectedLesson) {
    let t5;
    if ($[7] !== unlocked || $[8] !== selectedLesson.id) {
      t5 = unlocked.has(selectedLesson.id);
      $[7] = unlocked;
      $[8] = selectedLesson.id;
      $[9] = t5;
    } else {
      t5 = $[9];
    }
    let t6;
    if ($[10] !== completeLesson || $[11] !== selectedLesson.id) {
      t6 = () => {
        completeLesson(selectedLesson.id);
        setSelectedLesson(null);
      };
      $[10] = completeLesson;
      $[11] = selectedLesson.id;
      $[12] = t6;
    } else {
      t6 = $[12];
    }
    let t7;
    if ($[13] === Symbol.for("react.memo_cache_sentinel")) {
      t7 = () => setSelectedLesson(null);
      $[13] = t7;
    } else {
      t7 = $[13];
    }
    let t8;
    if ($[14] !== t5 || $[15] !== t6 || $[16] !== selectedLesson) {
      t8 = <LessonDetail lesson={selectedLesson} isUnlocked={t5} onDone={t6} onBack={t7} />;
      $[14] = t5;
      $[15] = t6;
      $[16] = selectedLesson;
      $[17] = t8;
    } else {
      t8 = $[17];
    }
    return t8;
  }
  const allUnlocked = unlocked.size === LESSONS.length;
  let t5;
  if ($[18] !== allUnlocked) {
    t5 = allUnlocked ? <ShimmerTitle text="All powered up" /> : <Text bold={true} color="claude">Power-ups</Text>;
    $[18] = allUnlocked;
    $[19] = t5;
  } else {
    t5 = $[19];
  }
  let t6;
  if ($[20] !== unlocked.size) {
    t6 = <Text dimColor={true}>{" "}{unlocked.size}/{LESSONS.length} unlocked{" "}</Text>;
    $[20] = unlocked.size;
    $[21] = t6;
  } else {
    t6 = $[21];
  }
  const t7 = unlocked.size / LESSONS.length;
  let t8;
  if ($[22] !== t7) {
    t8 = <ProgressBar ratio={t7} width={16} fillColor="claude" emptyColor="inactive" />;
    $[22] = t7;
    $[23] = t8;
  } else {
    t8 = $[23];
  }
  let t9;
  if ($[24] !== t5 || $[25] !== t6 || $[26] !== t8) {
    t9 = <Box marginBottom={1}>{t5}{t6}{t8}</Box>;
    $[24] = t5;
    $[25] = t6;
    $[26] = t8;
    $[27] = t9;
  } else {
    t9 = $[27];
  }
  const t10 = allUnlocked ? "Now go build something." : "Each power-up teaches one thing Claude Code can do that most people miss. Open one, read it, try it, mark it done.";
  let t11;
  if ($[28] !== t10) {
    t11 = <Box marginBottom={1}><Text dimColor={true} wrap="wrap">{t10}</Text></Box>;
    $[28] = t10;
    $[29] = t11;
  } else {
    t11 = $[29];
  }
  let t12;
  if ($[30] !== openLesson) {
    t12 = id_0 => {
      const lesson_1 = LESSONS.find(candidate => candidate.id === id_0);
      if (lesson_1) {
        openLesson(lesson_1);
      }
    };
    $[30] = openLesson;
    $[31] = t12;
  } else {
    t12 = $[31];
  }
  let t13;
  if ($[32] !== onExit) {
    t13 = () => onExit("Power-ups closed");
    $[32] = onExit;
    $[33] = t13;
  } else {
    t13 = $[33];
  }
  let t14;
  if ($[34] !== options || $[35] !== focusedLesson || $[36] !== t12 || $[37] !== t13) {
    t14 = <Select options={options} hideIndexes={true} visibleOptionCount={LESSONS.length} defaultFocusValue={focusedLesson} onChange={t12} onCancel={t13} />;
    $[34] = options;
    $[35] = focusedLesson;
    $[36] = t12;
    $[37] = t13;
    $[38] = t14;
  } else {
    t14 = $[38];
  }
  let t15;
  if ($[39] === Symbol.for("react.memo_cache_sentinel")) {
    t15 = <Box marginTop={1}><ListHint /></Box>;
    $[39] = t15;
  } else {
    t15 = $[39];
  }
  let t16;
  if ($[40] !== celebrating) {
    t16 = celebrating && <Celebration onDone={finishCelebration} />;
    $[40] = celebrating;
    $[41] = t16;
  } else {
    t16 = $[41];
  }
  let t17;
  if ($[42] !== t11 || $[43] !== t14 || $[44] !== t16 || $[45] !== t9) {
    t17 = <Pane color="claude"><Box flexDirection="column">{t9}{t11}{t14}{t15}{t16}</Box></Pane>;
    $[42] = t11;
    $[43] = t14;
    $[44] = t16;
    $[45] = t9;
    $[46] = t17;
  } else {
    t17 = $[46];
  }
  return t17;
}

function getUnlockedPowerups(): Set<string> {
  const configured = getGlobalConfig().powerupsUnlocked ?? [];
  return new Set(configured.filter(isKnownPowerup));
}

function isKnownPowerup(id: string): boolean {
  return LESSONS.some(lesson => lesson.id === id);
}

function LessonDetail(t0) {
  const $ = _c(15);
  const {
    lesson,
    isUnlocked,
    onDone,
    onBack
  } = t0;
  let t1;
  if ($[0] !== onBack || $[1] !== onDone) {
    t1 = {
      "confirm:yes": onDone,
      "confirm:no": onBack
    };
    $[0] = onBack;
    $[1] = onDone;
    $[2] = t1;
  } else {
    t1 = $[2];
  }
  let t2;
  if ($[3] === Symbol.for("react.memo_cache_sentinel")) {
    t2 = {
      context: "Confirmation"
    };
    $[3] = t2;
  } else {
    t2 = $[3];
  }
  useKeybindings(t1, t2);
  const t3 = isUnlocked ? "success" : "pending";
  let t4;
  if ($[4] !== t3) {
    t4 = <StatusIcon status={t3} withSpace={true} />;
    $[4] = t3;
    $[5] = t4;
  } else {
    t4 = $[5];
  }
  let t5;
  if ($[6] !== lesson.title) {
    t5 = <Text bold={true} color="claude">{lesson.title}</Text>;
    $[6] = lesson.title;
    $[7] = t5;
  } else {
    t5 = $[7];
  }
  let t6;
  if ($[8] !== t4 || $[9] !== t5) {
    t6 = <Box>{t4}{t5}</Box>;
    $[8] = t4;
    $[9] = t5;
    $[10] = t6;
  } else {
    t6 = $[10];
  }
  let t7;
  if ($[11] === Symbol.for("react.memo_cache_sentinel")) {
    t7 = <DetailHint />;
    $[11] = t7;
  } else {
    t7 = $[11];
  }
  let t8;
  if ($[12] !== lesson.body || $[13] !== t6) {
    t8 = <Pane color="claude"><Box flexDirection="column" gap={1}>{t6}{lesson.body}{t7}</Box></Pane>;
    $[12] = lesson.body;
    $[13] = t6;
    $[14] = t8;
  } else {
    t8 = $[14];
  }
  return t8;
}
