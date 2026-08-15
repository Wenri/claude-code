/**
 * Shared attachment validation + resolution for SendUserMessage and
 * SendUserFile. Lives in BriefTool/ so the dynamic `./upload.js` import
 * inside the feature('BRIDGE_MODE') guard stays relative and upload.ts
 * (axios, crypto, auth utils) remains tree-shakeable from non-bridge builds.
 */

import { feature } from 'bun:bundle'
import { stat } from 'fs/promises'

import type { ValidationResult } from '../../Tool.js'

import { getCwd } from '../../utils/cwd.js'
import { isEnvTruthy } from '../../utils/envUtils.js'
import { getErrnoCode } from '../../utils/errors.js'
import { IMAGE_EXTENSION_REGEX } from '../../utils/imagePaste.js'
import { expandPath } from '../../utils/path.js'

export type ResolvedAttachment = {
  path: string
  size: number
  isImage: boolean
  file_uuid?: string
}

export type PreResolvedAttachment = {
  file_uuid: string
  file_name: string
  size: number
  is_image: boolean
}

export type AttachmentInput = string | PreResolvedAttachment

function isPreResolvedAttachment(
  attachment: AttachmentInput,
): attachment is PreResolvedAttachment {
  return typeof attachment !== 'string'
}

export async function validateAttachmentPaths(
  attachments: AttachmentInput[],
): Promise<ValidationResult> {
  const cwd = getCwd()
  for (const attachment of attachments) {
    if (isPreResolvedAttachment(attachment)) continue
    const rawPath = attachment
    const fullPath = expandPath(rawPath)
    try {
      const stats = await stat(fullPath)
      if (!stats.isFile()) {
        return {
          result: false,
          message: `Attachment "${rawPath}" is not a regular file.`,
          errorCode: 1,
        }
      }
    } catch (e) {
      const code = getErrnoCode(e)
      if (code === 'ENOENT') {
        return {
          result: false,
          message: `Attachment "${rawPath}" does not exist. Current working directory: ${cwd}.`,
          errorCode: 1,
        }
      }
      if (code === 'EACCES' || code === 'EPERM') {
        return {
          result: false,
          message: `Attachment "${rawPath}" is not accessible (permission denied).`,
          errorCode: 1,
        }
      }
      throw e
    }
  }
  return { result: true }
}

export async function resolveAttachments(
  attachments: AttachmentInput[],
  uploadCtx: { replBridgeEnabled: boolean; signal?: AbortSignal },
): Promise<ResolvedAttachment[]> {
  // Stat serially (local, fast) to keep ordering deterministic, then upload
  // in parallel (network, slow). Upload failures resolve undefined — the
  // attachment still carries {path, size, isImage} for local renderers.
  const stated: ResolvedAttachment[] = []
  const uploadIndices: number[] = []
  for (const attachment of attachments) {
    if (isPreResolvedAttachment(attachment)) {
      stated.push({
        path: attachment.file_name,
        size: attachment.size,
        isImage: attachment.is_image,
        file_uuid: attachment.file_uuid,
      })
      continue
    }
    const rawPath = attachment
    const fullPath = expandPath(rawPath)
    // Single stat — we need size, so this is the operation, not a guard.
    // validateInput ran before us, but the file could have moved since
    // (TOCTOU); if it did, let the error propagate so the model sees it.
    const stats = await stat(fullPath)
    uploadIndices.push(stated.length)
    stated.push({
      path: fullPath,
      size: stats.size,
      isImage: IMAGE_EXTENSION_REGEX.test(fullPath),
    })
  }
  if (uploadIndices.length === 0) return stated
  // Dynamic import inside the feature() guard so upload.ts (axios, crypto,
  // zod, auth utils, MIME map) is fully eliminated from non-BRIDGE_MODE
  // builds. A static import would force module-scope evaluation regardless
  // of the guard inside uploadBriefAttachment — CLAUDE.md: "helpers defined
  // outside remain in the build even if never called".
  if (feature('BRIDGE_MODE')) {
    // Headless/SDK callers never set appState.replBridgeEnabled (only the TTY
    // REPL does, at main.tsx init). CLAUDE_CODE_BRIEF_UPLOAD lets a host that
    // runs the CLI as a subprocess opt in — e.g. the cowork desktop bridge,
    // which already passes CLAUDE_CODE_OAUTH_TOKEN for auth.
    const shouldUpload =
      uploadCtx.replBridgeEnabled ||
      isEnvTruthy(process.env.CLAUDE_CODE_BRIEF_UPLOAD) ||
      Boolean(process.env.CLAUDE_CODE_REMOTE_ENVIRONMENT_TYPE)
    const { uploadBriefAttachment } = await import('./upload.js')
    const uuids = await Promise.all(
      uploadIndices.map(index =>
        uploadBriefAttachment(stated[index]!.path, stated[index]!.size, {
          replBridgeEnabled: shouldUpload,
          signal: uploadCtx.signal,
        }),
      ),
    )
    uploadIndices.forEach((index, uuidIndex) => {
      const uuid = uuids[uuidIndex]
      if (uuid !== undefined) {
        stated[index] = { ...stated[index]!, file_uuid: uuid }
      }
    })
  }
  return stated
}
