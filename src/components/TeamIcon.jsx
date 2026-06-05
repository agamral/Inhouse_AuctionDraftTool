import { useState } from 'react'

/**
 * Ícone de time — exibe a imagem se iconUrl estiver definida e carregar com sucesso.
 * Fallback: círculo colorido com a inicial do nome do time.
 *
 * Props:
 *   time    — objeto { nome, cor, iconUrl }
 *   size    — tamanho em px (largura e altura, default 40)
 *   radius  — border-radius em px (default: size * 0.15)
 *   style   — estilos extras
 */
export default function TeamIcon({ time, size = 40, radius, style = {} }) {
  const [imgError, setImgError] = useState(false)

  if (!time) return null

  const r  = radius ?? Math.round(size * 0.15)
  const cor = time.cor ?? '#4a9eda'

  if (time.iconUrl && !imgError) {
    return (
      <img
        src={time.iconUrl}
        alt={time.nome ?? ''}
        style={{ width: size, height: size, borderRadius: r, objectFit: 'cover', flexShrink: 0, ...style }}
        onError={() => setImgError(true)}
      />
    )
  }

  return (
    <div style={{
      width: size, height: size, borderRadius: r, flexShrink: 0,
      background: cor + '22',
      border: `1.5px solid ${cor}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: cor,
      fontFamily: "'Rajdhani', sans-serif",
      fontWeight: 700,
      fontSize: Math.round(size * 0.45),
      userSelect: 'none',
      ...style,
    }}>
      {time.nome?.[0]?.toUpperCase() ?? '?'}
    </div>
  )
}
