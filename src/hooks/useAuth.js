import { useState, useEffect } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { ref, get, set, onValue } from 'firebase/database'
import { auth } from '../firebase/auth'
import { db } from '../firebase/database'

export function useAuth() {
  const [user,         setUser]         = useState(undefined)
  const [isAdmin,      setIsAdmin]      = useState(false)
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [capitao,      setCapitao]      = useState(null)  // { teamId, ...team } ou null
  const [adminChecked, setAdminChecked] = useState(false)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser ?? null)

      if (firebaseUser) {
        try {
          // Salva perfil para o super admin poder gerenciar
          await set(ref(db, `/users/${firebaseUser.uid}`), {
            email:    firebaseUser.email,
            name:     firebaseUser.displayName ?? firebaseUser.email,
            photoURL: firebaseUser.photoURL ?? null,
          })

          const [adminSnap, superSnap] = await Promise.all([
            get(ref(db, `/config/admins/${firebaseUser.uid}`)),
            get(ref(db, `/config/superAdmins/${firebaseUser.uid}`)),
          ])

          const isAdm = (adminSnap.exists() && adminSnap.val() === true)
                      || (superSnap.exists() && superSnap.val() === true)

          setIsSuperAdmin(superSnap.exists() && superSnap.val() === true)
          setIsAdmin(isAdm)

          // Se não é admin, verifica se é capitão (UID vinculado a algum time)
          if (!isAdm) {
            const teamsSnap = await get(ref(db, '/teams'))
            const teams = teamsSnap.val() ?? {}
            const entry = Object.entries(teams).find(([, t]) => t.capitaoUid === firebaseUser.uid)
            setCapitao(entry ? { teamId: entry[0], ...entry[1] } : null)
          } else {
            setCapitao(null)
          }
        } catch {
          setIsAdmin(false)
          setIsSuperAdmin(false)
          setCapitao(null)
        }
      } else {
        setIsAdmin(false)
        setIsSuperAdmin(false)
        setCapitao(null)
      }
      setAdminChecked(true)
    })
    return unsubscribe
  }, [])

  const loading = !adminChecked

  return { user, isAdmin, isSuperAdmin, capitao, loading }
}
