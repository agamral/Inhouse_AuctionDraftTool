import { useState, useEffect } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { ref, get, set, remove } from 'firebase/database'
import { auth } from '../firebase/auth'
import { db } from '../firebase/database'

const sanitizeEmail = (email) => email.toLowerCase().replace(/\./g, ',')

export function useAuth() {
  const [user,               setUser]               = useState(undefined)
  const [isAdmin,            setIsAdmin]            = useState(false)
  const [isSuperAdmin,       setIsSuperAdmin]       = useState(false)
  const [capitao,            setCapitao]            = useState(null)
  const [adminCampeonatoIds, setAdminCampeonatoIds] = useState([])
  const [adminChecked,       setAdminChecked]       = useState(false)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser ?? null)

      if (firebaseUser) {
        try {
          // Salva perfil básico para gerenciamento
          await set(ref(db, `/users/${firebaseUser.uid}`), {
            email:    firebaseUser.email,
            name:     firebaseUser.displayName ?? firebaseUser.email,
            photoURL: firebaseUser.photoURL ?? null,
          })

          // ── Verificação de superadmin ────────────────────────────────────
          // Tenta path novo e legado; falha individual não derruba o login
          const safeGet = async (path) => {
            try { return await get(ref(db, path)) } catch { return null }
          }

          const [superNew, superLeg] = await Promise.all([
            safeGet(`/superAdmins/${firebaseUser.uid}`),
            safeGet(`/config/superAdmins/${firebaseUser.uid}`),
          ])
          const isSA = (superNew?.exists()  && superNew.val()  === true)
                    || (superLeg?.exists() && superLeg.val() === true)

          // ── Verificação de admin ─────────────────────────────────────────
          let isAdm = isSA
          if (!isAdm) {
            const adminLeg = await safeGet(`/config/admins/${firebaseUser.uid}`)
            if (adminLeg?.exists() && adminLeg.val() === true) isAdm = true
          }
          if (!isAdm) {
            const campSnap = await safeGet('/campeonatos')
            const campeonatos = campSnap?.val() ?? {}

            // Admins confirmados por UID
            const adminIds = Object.keys(campeonatos).filter(id =>
              campeonatos[id]?.admins?.[firebaseUser.uid] === true
            )

            // Convites pendentes por email — promove automaticamente
            const sanitized = sanitizeEmail(firebaseUser.email ?? '')
            const promotedIds = []
            for (const [cid, camp] of Object.entries(campeonatos)) {
              if (camp?.adminsPendentes?.[sanitized]) {
                try {
                  await set(ref(db,    `/campeonatos/${cid}/admins/${firebaseUser.uid}`), true)
                  await remove(ref(db, `/campeonatos/${cid}/adminsPendentes/${sanitized}`))
                  promotedIds.push(cid)
                } catch {
                  promotedIds.push(cid) // sem permissão de escrita, mas concede acesso UI
                }
              }
            }

            const allIds = [...new Set([...adminIds, ...promotedIds])]
            if (allIds.length > 0) {
              isAdm = true
              setAdminCampeonatoIds(allIds)
            }
          }

          setIsSuperAdmin(isSA)
          setIsAdmin(isAdm)

          // ── Verificação de capitão ───────────────────────────────────────
          if (!isAdm) {
            const email = firebaseUser.email ?? ''
            // Match por UID OU email (mais robusto — email persiste mesmo se Auth
            // reset/migrar; UID pode ficar dessincronizado entre criação e login)
            const matchTeam = (t) =>
              (t.capitaoUid && t.capitaoUid === firebaseUser.uid) ||
              (t.capitaoEmail && email && t.capitaoEmail === email)

            const teamsLeg = await safeGet('/teams')
            const teamsOld = teamsLeg?.val() ?? {}
            const legEntry = Object.entries(teamsOld).find(([, t]) => matchTeam(t))

            if (legEntry) {
              setCapitao({ teamId: legEntry[0], ...legEntry[1] })
            } else {
              const campSnap = await safeGet('/campeonatos')
              const campeonatos = campSnap?.val() ?? {}
              let found = null
              // Procura em TODOS os campeonatos (não só no principal) — capitão
              // pode estar em qualquer um, especialmente em multi-campeonato
              for (const [cid, camp] of Object.entries(campeonatos)) {
                const teams = camp.teams ?? {}
                const entry = Object.entries(teams).find(([, t]) => matchTeam(t))
                if (entry) {
                  found = { teamId: entry[0], campeonatoId: cid, ...entry[1] }
                  break
                }
              }
              setCapitao(found)
            }
          } else {
            setCapitao(null)
          }
        } catch {
          setIsAdmin(false)
          setIsSuperAdmin(false)
          setCapitao(null)
          setAdminCampeonatoIds([])
        }
      } else {
        setIsAdmin(false)
        setIsSuperAdmin(false)
        setCapitao(null)
        setAdminCampeonatoIds([])
      }
      setAdminChecked(true)
    })
    return unsubscribe
  }, [])

  const loading = !adminChecked
  return { user, isAdmin, isSuperAdmin, capitao, adminCampeonatoIds, loading }
}
