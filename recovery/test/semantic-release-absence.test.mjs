import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  authenticatedReleaseEvidence,
} from '../scripts/build-semantic-correspondence.mjs'

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function gitBlobSha1(value) {
  return crypto
    .createHash('sha1')
    .update(`blob ${value.length}\0`)
    .update(value)
    .digest('hex')
}

function writeJson(filename, value) {
  fs.mkdirSync(path.dirname(filename), { recursive: true })
  fs.writeFileSync(filename, `${JSON.stringify(value, null, 2)}\n`)
}

function releaseAbsenceFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'release-absence-'))
  const sourceRoot = path.join(root, 'src')
  const evidenceRoot = path.join(
    root,
    'recovery/cases/2.1.123-to-2.1.124/evidence',
  )
  fs.mkdirSync(sourceRoot, { recursive: true })
  fs.mkdirSync(evidenceRoot, { recursive: true })
  const provenancePath = path.join(evidenceRoot, 'provenance.json')
  const absencePath = path.join(evidenceRoot, 'RELEASE-2.1.124-ABSENCE.json')
  const fullChangelogPath = path.join(
    evidenceRoot,
    'claude-code-CHANGELOG-public.md',
  )
  const tagRefsPath = path.join(evidenceRoot, 'official-git-tag-refs.txt')
  fs.writeFileSync(
    fullChangelogPath,
    '# Changelog\n\n## 2.1.126\n\n- Later\n\n## 2.1.123\n\n- Earlier\n',
  )
  fs.writeFileSync(
    tagRefsPath,
    `${'a'.repeat(40)}\trefs/tags/v2.1.123\n` +
      `${'b'.repeat(40)}\trefs/tags/v2.1.126\n`,
  )

  const pinned = filename => {
    const value = fs.readFileSync(filename)
    return {
      path: path.relative(root, filename).replaceAll('\\', '/'),
      bytes: value.length,
      sha256: sha256(value),
    }
  }
  const absence = {
    schemaVersion: 1,
    kind: 'authenticated-public-release-absence',
    release: '2.1.124',
    tag: {
      name: 'v2.1.124',
      present: false,
      refs: null,
    },
    changelog: {
      heading: '## 2.1.124',
      present: false,
      bulletCount: 0,
      fullSnapshot: null,
    },
    nearestPublishedPublicRelease: {
      before: { tag: 'v2.1.123', commit: 'a'.repeat(40) },
      after: { tag: 'v2.1.126', commit: 'b'.repeat(40) },
    },
  }
  const provenance = {
    schemaVersion: 1,
    release: '2.1.124',
    publicReleaseAbsence: null,
  }
  const obligations = {
    officialReleaseAbsenceEvidence: {
      release: '2.1.124',
      tag: 'v2.1.124',
      heading: '## 2.1.124',
      bulletCount: 0,
      bullets: [],
      provenance: null,
      absenceArtifact: null,
      fullChangelog: null,
      tagRefs: null,
    },
  }

  const repin = () => {
    const full = fs.readFileSync(fullChangelogPath)
    absence.changelog.fullSnapshot = {
      ...pinned(fullChangelogPath),
      path: path
        .relative(path.dirname(evidenceRoot), fullChangelogPath)
        .replaceAll('\\', '/'),
      gitBlobSha1: gitBlobSha1(full),
    }
    absence.tag.refs = {
      ...pinned(tagRefsPath),
      path: path
        .relative(path.dirname(evidenceRoot), tagRefsPath)
        .replaceAll('\\', '/'),
    }
    writeJson(absencePath, absence)
    provenance.publicReleaseAbsence = {
      ...pinned(absencePath),
      path: path
        .relative(path.dirname(evidenceRoot), absencePath)
        .replaceAll('\\', '/'),
      tag: absence.tag,
      changelog: absence.changelog,
    }
    writeJson(provenancePath, provenance)
    obligations.officialReleaseAbsenceEvidence = {
      ...obligations.officialReleaseAbsenceEvidence,
      provenance: pinned(provenancePath),
      absenceArtifact: pinned(absencePath),
      fullChangelog: pinned(fullChangelogPath),
      tagRefs: pinned(tagRefsPath),
    }
  }
  repin()

  const verify = () =>
    authenticatedReleaseEvidence({
      attribution: {},
      changelogPath: absencePath,
      changelogText: fs.readFileSync(absencePath, 'utf8'),
      obligations,
      sourceRoot,
    })

  return {
    absence,
    absencePath,
    fullChangelogPath,
    obligations,
    provenance,
    provenancePath,
    repin,
    root,
    tagRefsPath,
    verify,
  }
}

test('authenticated public-release absence pins the complete audit inputs', () => {
  const fixture = releaseAbsenceFixture()
  try {
    const result = fixture.verify()
    assert.deepEqual(result.official, {
      kind: 'authenticated-public-release-absence',
      section: '2.1.124',
      bulletCount: 0,
      bullets: [],
      tag: 'v2.1.124',
      heading: '## 2.1.124',
      absenceSha256: sha256(fs.readFileSync(fixture.absencePath)),
    })
    assert.deepEqual(Object.keys(result.inputs).sort(), [
      'absenceAuditFullChangelog',
      'absenceAuditGitTagRefs',
      'officialReleaseAbsence',
      'releaseProvenance',
    ])
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true })
  }
})

test('repinning cannot hide the absent Git tag becoming present', () => {
  const fixture = releaseAbsenceFixture()
  try {
    const lines = fs
      .readFileSync(fixture.tagRefsPath, 'utf8')
      .trim()
      .split('\n')
    lines.push(`${'c'.repeat(40)}\trefs/tags/v2.1.124`)
    fs.writeFileSync(fixture.tagRefsPath, `${lines.sort().join('\n')}\n`)
    fixture.repin()
    assert.throws(fixture.verify, /absent official Git tag direct ref/)
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true })
  }
})

test('repinning cannot hide an official heading and bullet appearing', () => {
  const fixture = releaseAbsenceFixture()
  try {
    fs.appendFileSync(
      fixture.fullChangelogPath,
      '\n## 2.1.124\n\n- Newly public\n',
    )
    fixture.repin()
    assert.throws(fixture.verify, /absent official changelog heading count/)
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true })
  }
})

test('repinning cannot make an evidence path escape the repository', () => {
  const fixture = releaseAbsenceFixture()
  try {
    const escaped = path.join(
      fixture.root,
      'recovery/cases/2.1.123-to-2.1.124/outside.md',
    )
    fs.writeFileSync(escaped, 'escaped\n')
    const value = fs.readFileSync(escaped)
    fixture.obligations.officialReleaseAbsenceEvidence.fullChangelog = {
      path:
        'recovery/cases/2.1.123-to-2.1.124/evidence/../outside.md',
      bytes: value.length,
      sha256: sha256(value),
    }
    assert.throws(fixture.verify, /unsafe relative path/)
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true })
  }
})
