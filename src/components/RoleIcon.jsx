const ROLE_ICON_MAP = {
  Tank:    '/icons/roles/tank.png',
  Offlane: '/icons/roles/bruiser.png',
  DPS:     '/icons/roles/ranged-assassin.png',
  Healer:  '/icons/roles/healer.png',
  Flex:    '/icons/roles/support.png',
  Nenhuma: '/icons/roles/support.png',
}

// Filtros CSS prontos para recolorir os ícones.
// Use a prop `color` no componente para aplicar.
// Gerado via: https://codepen.io/sosuke/pen/Pjoqqp
export const ROLE_ICON_FILTERS = {
  // Mantém o azul/glow original dos ícones
  default: 'none',
  // Dourado — combina com --gold do projeto
  gold:    'brightness(0) saturate(100%) invert(72%) sepia(52%) saturate(450%) hue-rotate(5deg) brightness(105%)',
  // Branco puro
  white:   'brightness(0) invert(1)',
  // Cinza apagado (ex: role secundária ou desabilitado)
  dim:     'brightness(0) invert(1) opacity(0.35)',
}

/**
 * Exibe o ícone de role com fundo transparente via mix-blend-mode: screen.
 *
 * Props:
 *   role   — 'Tank' | 'Offlane' | 'DPS' | 'Healer' | 'Flex' | 'Nenhuma'
 *   size   — tamanho em px (padrão: 20)
 *   color  — 'default' | 'gold' | 'white' | 'dim' (padrão: 'default')
 *   style  — estilos extras
 */
export default function RoleIcon({ role, size = 20, color = 'default', style = {} }) {
  const src = ROLE_ICON_MAP[role]
  if (!src) return null

  const filter = ROLE_ICON_FILTERS[color] ?? ROLE_ICON_FILTERS.default

  return (
    <img
      src={src}
      alt={role}
      title={role}
      width={size}
      height={size}
      style={{
        display: 'inline-block',
        verticalAlign: 'middle',
        objectFit: 'contain',
        mixBlendMode: 'screen',   // remove o fundo preto em dark themes
        filter,
        ...style,
      }}
    />
  )
}
