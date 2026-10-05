import React from 'react';
import { getCompanion, roll, companionUserId, type Roll } from '../../buddy/companion.js';
import { fireCompanionHatchObserver, fireCompanionPetObserver, getLastBuddyReaction } from '../../buddy/observer.js';
import { generateCompanionSoul } from '../../buddy/soul.js';
import { isBuddyLive } from '../../buddy/useBuddyNotification.js';
import { getGlobalConfig, saveGlobalConfig } from '../../utils/config.js';
// Reconstructed dependency: preserve the witnessed root module initialization edge.
import '../../utils/gracefulShutdown.js';
import { CompanionCard } from './CompanionCard.js';
import { BuddyHatch } from './BuddyHatch.js';
import type { Command } from '../../commands.js';
import type { AppState } from '../../state/AppStateStore.js';
import type { LocalJSXCommandContext, LocalJSXCommandOnDone } from '../../types/command.js';
import type { Companion } from '../../buddy/types.js';

async function generateAndSaveCompanion(roll: Roll, signal?: AbortSignal): Promise<Companion> {
  const {
    bones,
    inspirationSeed
  } = roll;
  const soul = await generateCompanionSoul(bones, inspirationSeed, signal);
  const hatchedAt = Date.now();
  saveGlobalConfig(current => ({
    ...current,
    companion: {
      ...soul,
      hatchedAt
    }
  }));
  return {
    ...bones,
    ...soul,
    hatchedAt
  };
}

function reactionSetter(setAppState: LocalJSXCommandContext['setAppState']): (reaction: string) => void {
  return reaction => setAppState((previous: AppState) => previous.companionReaction === reaction ? previous : {
    ...previous,
    companionReaction: reaction
  });
}

const buddy = {
  type: 'local-jsx',
  name: 'buddy',
  description: 'Hatch a coding companion · pet, off',
  isHidden: !isBuddyLive(),
  immediate: true,
  load: () => Promise.resolve({
    async call(onDone: LocalJSXCommandOnDone, context: LocalJSXCommandContext, args: string): Promise<React.ReactNode> {
      const config = getGlobalConfig();
      const action = args?.trim();
      if (action === 'pet') {
        const companion = getCompanion();
        if (!companion) {
          onDone('no companion yet · run /buddy first', {
            display: 'system'
          });
          return null;
        }
        if (config.companionMuted === true) {
          saveGlobalConfig(current => ({
            ...current,
            companionMuted: false
          }));
        }
        context.setAppState(previous => ({
          ...previous,
          companionPetAt: Date.now()
        }));
        fireCompanionPetObserver(reactionSetter(context.setAppState));
        onDone(`petted ${companion.name}`, {
          display: 'system'
        });
        return null;
      }
      if (action === 'off') {
        if (config.companionMuted !== true) {
          saveGlobalConfig(current => ({
            ...current,
            companionMuted: true
          }));
        }
        onDone('companion muted', {
          display: 'system'
        });
        return null;
      }
      if (action === 'on') {
        if (config.companionMuted === true) {
          saveGlobalConfig(current => ({
            ...current,
            companionMuted: false
          }));
        }
        onDone('companion unmuted', {
          display: 'system'
        });
        return null;
      }
      if (config.companionMuted === true) {
        saveGlobalConfig(current => ({
          ...current,
          companionMuted: false
        }));
      }
      const companion = getCompanion();
      if (companion) {
        return <CompanionCard companion={companion} lastReaction={getLastBuddyReaction()} onDone={onDone} />;
      }
      const hatching = generateAndSaveCompanion(roll(companionUserId()));
      void hatching.then(value => fireCompanionHatchObserver(value, reactionSetter(context.setAppState))).catch(() => {});
      return <BuddyHatch hatching={hatching} onDone={onDone} />;
    }
  })
} satisfies Command;

export default buddy;
