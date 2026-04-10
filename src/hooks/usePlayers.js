// TODO: conectar Firebase — listener em /players
import { useState } from 'react'

export function usePlayers() {
  const [players] = useState([])
  const [loading] = useState(false)

  return { players, loading }
}
