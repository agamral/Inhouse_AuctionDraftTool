// TODO: conectar Firebase — listener em /draft/{sessionId}
import { useState } from 'react'

export function useDraft(sessionId) {
  const [draft] = useState(null)
  const [loading] = useState(false)

  return { draft, loading }
}
