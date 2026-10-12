// Initial field values for the board dialog: the board being edited, or blank.
export function boardFormFields(board: { name: string; description?: string | null } | null | undefined) {
  return { name: board?.name ?? '', description: board?.description ?? '' }
}
