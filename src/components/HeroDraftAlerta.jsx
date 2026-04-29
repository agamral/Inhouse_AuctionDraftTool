import { useState, useEffect } from 'react'
import { ref, onValue } from 'firebase/database'
import { db } from '../firebase/database'
import { Link } from 'react-router-dom'

export default function HeroDraftAlerta({ capitao }) {
  const [sessoes, setSessoes] = useState({})

  useEffect(() => {
    const unsub = onValue(ref(db, '/heroDraft/sessions'), s => setSessoes(s.val() ?? {}))
    return unsub
  }, [])

  if (!capitao?.teamId) return null

  const sessaoAtiva = Object.entries(sessoes).find(([, s]) =>
    s.status !== 'encerrado' &&
    (s.timeA?.id === capitao.teamId || s.timeB?.id === capitao.teamId)
  )

  if (!sessaoAtiva) return null

  const [sessaoId, sessao] = sessaoAtiva
  const lado     = sessao.timeA?.id === capitao.teamId ? 'A' : 'B'
  const adversario = lado === 'A' ? sessao.timeB : sessao.timeA
  const url      = `/hero-draft?sessao=${encodeURIComponent(sessaoId)}&time=${lado}`
  const isRodando = sessao.status === 'rodando'

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: 16, padding: '12px 20px', borderRadius: 10,
      background: isRodando ? 'rgba(224,85,85,0.1)' : 'rgba(155,110,232,0.08)',
      border: `1px solid ${isRodando ? 'rgba(224,85,85,0.35)' : 'rgba(155,110,232,0.3)'}`,
      flexWrap: 'wrap',
    }}>
      <div>
        <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 13, fontWeight: 700, color: isRodando ? 'var(--red)' : 'var(--purple)', letterSpacing: '0.06em', marginBottom: 2 }}>
          {isRodando ? '🔴 Hero Draft em andamento!' : '🎯 Hero Draft disponível!'}
        </div>
        <div style={{ fontFamily: "'Barlow', sans-serif", fontSize: 13, color: 'var(--text2)' }}>
          {adversario?.nome
            ? <>Sua partida contra <strong style={{ color: 'var(--text)' }}>{adversario.nome}</strong></>
            : 'Sua sessão está pronta'
          }
        </div>
      </div>
      <Link
        to={url}
        style={{
          fontFamily: "'Barlow Condensed', sans-serif", fontSize: 14, fontWeight: 700,
          letterSpacing: '0.08em', padding: '8px 20px', borderRadius: 6,
          background: isRodando ? 'var(--red)' : 'var(--purple)',
          color: '#fff', textDecoration: 'none', whiteSpace: 'nowrap',
          display: 'flex', alignItems: 'center', gap: 6,
        }}
      >
        {isRodando ? 'Entrar agora →' : 'Ir para o draft →'}
      </Link>
    </div>
  )
}
