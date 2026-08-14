import type { DOMElement } from './dom.js'
import { FocusEvent } from './events/focus-event.js'
import { nodeCache } from './node-cache.js'

const MAX_FOCUS_STACK = 32

export type FocusDirection = 'left' | 'right' | 'up' | 'down'

/**
 * DOM-like focus manager for the Ink terminal UI.
 *
 * Pure state — tracks activeElement and a focus stack. Has no reference
 * to the tree; callers pass the root when tree walks are needed.
 *
 * Stored on the root DOMElement so any node can reach it by walking
 * parentNode (like browser's `node.ownerDocument`).
 */
export class FocusManager {
  activeElement: DOMElement | null = null
  private dispatchFocusEvent: (target: DOMElement, event: FocusEvent) => boolean
  private enabled = true
  private focusStack: DOMElement[] = []
  private listeners = new Set<() => void>()

  constructor(
    dispatchFocusEvent: (target: DOMElement, event: FocusEvent) => boolean,
  ) {
    this.dispatchFocusEvent = dispatchFocusEvent
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private notify(): void {
    for (const listener of this.listeners) listener()
  }

  focus(node: DOMElement): void {
    if (node === this.activeElement) return
    if (!this.enabled) return

    const previous = this.activeElement
    if (previous) {
      // Deduplicate before pushing to prevent unbounded growth from Tab cycling
      const idx = this.focusStack.indexOf(previous)
      if (idx !== -1) this.focusStack.splice(idx, 1)
      this.focusStack.push(previous)
      if (this.focusStack.length > MAX_FOCUS_STACK) this.focusStack.shift()
      this.dispatchFocusEvent(previous, new FocusEvent('blur', node))
    }
    this.activeElement = node
    this.dispatchFocusEvent(node, new FocusEvent('focus', previous))
    this.notify()
  }

  blur(): void {
    if (!this.activeElement) return

    const previous = this.activeElement
    this.activeElement = null
    this.dispatchFocusEvent(previous, new FocusEvent('blur', null))
    this.notify()
  }

  /**
   * Called by the reconciler when a node is removed from the tree.
   * Handles both the exact node and any focused descendant within
   * the removed subtree. Dispatches blur and restores focus from stack.
   */
  handleNodeRemoved(node: DOMElement, root: DOMElement): void {
    // Remove the node and any descendants from the stack
    this.focusStack = this.focusStack.filter(
      n => n !== node && isInTree(n, root),
    )

    // Check if activeElement is the removed node OR a descendant
    if (!this.activeElement) return
    if (this.activeElement !== node && isInTree(this.activeElement, root)) {
      return
    }

    const removed = this.activeElement
    this.activeElement = null
    this.dispatchFocusEvent(removed, new FocusEvent('blur', null))

    // Restore focus to the most recent still-mounted element
    while (this.focusStack.length > 0) {
      const candidate = this.focusStack.pop()!
      if (isInTree(candidate, root)) {
        this.activeElement = candidate
        this.dispatchFocusEvent(candidate, new FocusEvent('focus', removed))
        this.notify()
        return
      }
    }
    this.notify()
  }

  handleAutoFocus(node: DOMElement): void {
    this.focus(node)
  }

  handleClickFocus(node: DOMElement): void {
    const tabIndex = node.attributes['tabIndex']
    if (typeof tabIndex !== 'number') return
    this.focus(node)
  }

  enable(): void {
    this.enabled = true
  }

  disable(): void {
    this.enabled = false
  }

  focusNext(root: DOMElement): void {
    this.moveFocus(1, root)
  }

  focusPrevious(root: DOMElement): void {
    this.moveFocus(-1, root)
  }

  focusDirection(direction: FocusDirection, root: DOMElement): boolean {
    if (!this.enabled) return false
    if (!this.activeElement) {
      this.moveFocus(1, root)
      return true
    }

    const currentLayout = getLayout(this.activeElement)
    if (!currentLayout) return false

    let best: DOMElement | null = null
    let bestScore = Number.POSITIVE_INFINITY
    for (const candidate of collectTabbable(root)) {
      if (candidate === this.activeElement) continue
      const candidateLayout = getLayout(candidate)
      if (!candidateLayout) continue
      const score = directionalScore(currentLayout, candidateLayout, direction)
      if (score < bestScore) {
        best = candidate
        bestScore = score
      }
    }

    if (!best) return false
    this.focus(best)
    return true
  }

  private moveFocus(direction: 1 | -1, root: DOMElement): void {
    if (!this.enabled) return

    const tabbable = collectTabbable(root)
    if (tabbable.length === 0) return

    const currentIndex = this.activeElement
      ? tabbable.indexOf(this.activeElement)
      : -1

    const nextIndex =
      currentIndex === -1
        ? direction === 1
          ? 0
          : tabbable.length - 1
        : (currentIndex + direction + tabbable.length) % tabbable.length

    const next = tabbable[nextIndex]
    if (next) {
      this.focus(next)
    }
  }
}

type LayoutRect = { x: number; y: number; width: number; height: number }

function distanceToSpan(point: number, start: number, length: number): number {
  if (point < start) return start - point
  if (point > start + length) return point - (start + length)
  return 0
}

function overlap(
  firstStart: number,
  firstLength: number,
  secondStart: number,
  secondLength: number,
): number {
  return Math.max(
    0,
    Math.min(firstStart + firstLength, secondStart + secondLength) -
      Math.max(firstStart, secondStart),
  )
}

function directionalScore(
  current: LayoutRect,
  candidate: LayoutRect,
  direction: FocusDirection,
): number {
  const currentX = current.x + current.width / 2
  const currentY = current.y + current.height / 2
  const candidateX = candidate.x + candidate.width / 2
  const candidateY = candidate.y + candidate.height / 2
  const horizontal = direction === 'left' || direction === 'right'
  const sign = direction === 'right' || direction === 'down' ? 1 : -1
  const major = (horizontal ? candidateX - currentX : candidateY - currentY) * sign
  if (major <= 0) return Number.POSITIVE_INFINITY
  const minor = horizontal
    ? distanceToSpan(currentY, candidate.y, candidate.height)
    : distanceToSpan(currentX, candidate.x, candidate.width)
  const shared = horizontal
    ? overlap(current.y, current.height, candidate.y, candidate.height)
    : overlap(current.x, current.width, candidate.x, candidate.width)
  return major + (horizontal ? 2 : 0.5) * minor - shared
}

function getLayout(node: DOMElement): LayoutRect | undefined {
  const cached = nodeCache.get(node)
  if (cached) return cached
  const yogaNode = node.yogaNode
  if (!yogaNode) return undefined

  let x = yogaNode.getComputedLeft()
  let y = yogaNode.getComputedTop()
  let parent = node.parentNode
  while (parent) {
    const parentCached = nodeCache.get(parent)
    if (parentCached) {
      return {
        x: parentCached.x + x,
        y: parentCached.y + y,
        width: yogaNode.getComputedWidth(),
        height: yogaNode.getComputedHeight(),
      }
    }
    if (parent.yogaNode) {
      x += parent.yogaNode.getComputedLeft()
      y += parent.yogaNode.getComputedTop()
    }
    parent = parent.parentNode
  }
  return undefined
}

function collectTabbable(root: DOMElement): DOMElement[] {
  const result: DOMElement[] = []
  walkTree(root, result)
  return result
}

function walkTree(node: DOMElement, result: DOMElement[]): void {
  const tabIndex = node.attributes['tabIndex']
  if (typeof tabIndex === 'number' && tabIndex >= 0) {
    result.push(node)
  }

  for (const child of node.childNodes) {
    if (child.nodeName !== '#text') {
      walkTree(child, result)
    }
  }
}

function isInTree(node: DOMElement, root: DOMElement): boolean {
  let current: DOMElement | undefined = node
  while (current) {
    if (current === root) return true
    current = current.parentNode
  }
  return false
}

/**
 * Walk up to root and return it. The root is the node that holds
 * the FocusManager — like browser's `node.getRootNode()`.
 */
export function getRootNode(node: DOMElement): DOMElement {
  let current: DOMElement | undefined = node
  while (current) {
    if (current.focusManager) return current
    current = current.parentNode
  }
  throw new Error('Node is not in a tree with a FocusManager')
}

/**
 * Walk up to root and return its FocusManager.
 * Like browser's `node.ownerDocument` — focus belongs to the root.
 */
export function getFocusManager(node: DOMElement): FocusManager {
  return getRootNode(node).focusManager!
}
