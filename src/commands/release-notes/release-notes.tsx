import React from 'react'
import {
  type OptionWithDescription,
  Select,
} from '../../components/CustomSelect/select.js'
import { Dialog } from '../../components/design-system/Dialog.js'
import { Box, Text } from '../../ink.js'
import type { LocalJSXCommandOnDone } from '../../types/command.js'
import {
  CHANGELOG_URL,
  fetchAndStoreChangelog,
  getAllReleaseNotes,
  getStoredChangelog,
} from '../../utils/releaseNotes.js'
import { gt } from '../../utils/semver.js'

type ReleaseNotes = Array<[string, string[]]>

const SHOW_ALL_VALUE = '__show_all__'

export function formatVersion(version: string, notes: string[]): string {
  const header = `Version ${version}:`
  const bulletPoints = notes.map(note => `· ${note}`).join('\n')
  return `${header}\n${bulletPoints}`
}

export function formatAll(notes: ReleaseNotes): string {
  return notes
    .slice()
    .sort(([versionA], [versionB]) => (gt(versionA, versionB) ? 1 : -1))
    .map(([version, versionNotes]) =>
      formatVersion(version, versionNotes),
    )
    .join('\n\n')
}

export async function call(onDone: LocalJSXCommandOnDone) {
  // Try to fetch the latest changelog with a 500ms timeout
  try {
    const timeoutPromise = new Promise<void>((_, reject) => {
      setTimeout(rej => rej(new Error('Timeout')), 500, reject)
    })

    await Promise.race([fetchAndStoreChangelog(), timeoutPromise])
  } catch {
    // Either fetch failed or timed out - just use cached notes
  }

  const notes = getAllReleaseNotes(await getStoredChangelog())
    .slice()
    .sort(([versionA], [versionB]) => (gt(versionA, versionB) ? -1 : 1))

  if (notes.length === 0) {
    onDone(`See the full changelog at: ${CHANGELOG_URL}`, {
      display: 'system',
    })
    return null
  }

  return <ReleaseNotesPicker notes={notes} onDone={onDone} />
}

export function ReleaseNotesPicker({
  notes,
  onDone,
}: {
  notes: ReleaseNotes
  onDone: LocalJSXCommandOnDone
}) {
  const options: OptionWithDescription<string>[] = [
    {
      label: 'Show all',
      description: `${notes.length} versions`,
      value: SHOW_ALL_VALUE,
    },
    ...notes.map(toReleaseNotesOption),
  ]

  function handleChange(value: string) {
    if (value === SHOW_ALL_VALUE) {
      onDone(formatAll(notes), { display: 'system' })
      return
    }

    const selected = notes.find(([version]) => version === value)
    if (!selected) {
      onDone(undefined, { display: 'skip' })
      return
    }

    onDone(formatVersion(selected[0], selected[1]), {
      display: 'system',
    })
  }

  function handleCancel() {
    onDone(undefined, { display: 'skip' })
  }

  return (
    <Dialog title="Release notes" onCancel={handleCancel}>
      <Box flexDirection="column" marginBottom={1}>
        <Text dimColor>Select a version to view its notes.</Text>
      </Box>
      <Select
        options={options}
        visibleOptionCount={10}
        onChange={handleChange}
        onCancel={handleCancel}
      />
    </Dialog>
  )
}

function toReleaseNotesOption([
  version,
  notes,
]: [string, string[]]): OptionWithDescription<string> {
  return {
    label: `Version ${version}`,
    description: `${notes.length} ${notes.length === 1 ? 'item' : 'items'}`,
    value: version,
  }
}
