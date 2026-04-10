// Configuração central de cores e estilos por elo.
// Importar `ELO_CONFIG` nos outros componentes para badges coloridos.
export const ELO_CONFIG = {
  Bronze:   { color: '#c87941', bg: 'rgba(200,121,65,0.15)',   border: 'rgba(200,121,65,0.45)',   shape: 'shield' },
  Prata:    { color: '#9eadc0', bg: 'rgba(158,173,192,0.1)',   border: 'rgba(158,173,192,0.35)',  shape: 'shield' },
  Ouro:     { color: '#f0cc6e', bg: 'rgba(240,204,110,0.13)', border: 'rgba(240,204,110,0.45)', shape: 'shield' },
  Platina:  { color: '#4ecdc4', bg: 'rgba(78,205,196,0.1)',    border: 'rgba(78,205,196,0.38)',   shape: 'gem'    },
  Diamante: { color: '#74b9ff', bg: 'rgba(116,185,255,0.1)',   border: 'rgba(116,185,255,0.4)',   shape: 'gem'    },
  Mestre:   { color: '#c39bd3', bg: 'rgba(155,110,232,0.15)', border: 'rgba(155,110,232,0.5)',   shape: 'crown'  },
}

// Formas SVG (viewBox 0 0 24 24)
const SHAPES = {
  // Escudo clássico
  shield: 'M12 2L4 6v6c0 4.8 3.4 9.2 8 11 4.6-1.8 8-6.2 8-11V6z',
  // Gema/diamante
  gem:    'M12 2L2 8l10 14L22 8z',
  // Coroa com 3 picos (estilo void/HotS)
  crown:  'M2 18L4.5 8.5 9 15 12 3l3 12 4.5-6.5L22 18H2z',
}

/**
 * Ícone SVG inline de elo — leve, sem arquivos externos.
 *
 * Props:
 *   elo   — 'Bronze' | 'Prata' | 'Ouro' | 'Platina' | 'Diamante' | 'Mestre'
 *   size  — tamanho em px (padrão: 18)
 *   style — estilos extras
 */
export default function EloIcon({ elo, size = 18, style = {} }) {
  const cfg = ELO_CONFIG[elo]
  if (!cfg) return null
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={cfg.color}
      style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0, ...style }}
      aria-hidden="true"
    >
      <path d={SHAPES[cfg.shape]} />
    </svg>
  )
}
