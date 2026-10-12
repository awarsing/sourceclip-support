const MD_EDITOR_MODAL_WRAPPER_SELECTOR = '.md-editor-modal-container > div'
const MD_EDITOR_ZOOM_LAYER_SELECTOR = '.medium-zoom-overlay, .medium-zoom-image--opened'

function hasDom() {
  return typeof document !== 'undefined'
}

function isVisible(element: Element) {
  const style = window.getComputedStyle(element)
  return style.display !== 'none' && style.visibility !== 'hidden'
}

function isMdEditorModalOpen() {
  if (!hasDom()) return false

  return [...document.querySelectorAll(MD_EDITOR_MODAL_WRAPPER_SELECTOR)].some(isVisible)
}

function isMdEditorZoomOpen() {
  if (!hasDom()) return false

  return (
    document.body.classList.contains('medium-zoom--opened') || !!document.querySelector(MD_EDITOR_ZOOM_LAYER_SELECTOR)
  )
}

function isMdEditorModalOrZoomOpen() {
  return isMdEditorModalOpen() || isMdEditorZoomOpen()
}

export function preventShadcnDialogClose(e: Event) {
  if (isMdEditorModalOrZoomOpen()) {
    e.preventDefault()
  }
}
