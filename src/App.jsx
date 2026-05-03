import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { CampeonatoProvider } from './contexts/CampeonatoContext'
import Navbar from './components/Navbar.jsx'
import Footer from './components/Footer.jsx'
import CampeonatoLayout from './components/CampeonatoLayout.jsx'
import HomeMestre from './pages/HomeMestre.jsx'
import Home from './pages/Home.jsx'
import Inscritos from './pages/Inscritos.jsx'
import Inscricao from './pages/Inscricao.jsx'
import Draft from './pages/Draft.jsx'
import Espectador from './pages/Espectador.jsx'
import Admin from './pages/Admin.jsx'
import Login from './pages/Login.jsx'
import Resultados from './pages/Resultados.jsx'
import Tabela from './pages/Tabela.jsx'
import Agendamento from './pages/Agendamento.jsx'
import LoginCapitao from './pages/LoginCapitao.jsx'
import Elenco from './pages/Elenco.jsx'
import Chave from './pages/Chave.jsx'
import HeroDraft from './pages/HeroDraft.jsx'
import HeroDraftEspectador from './pages/HeroDraftEspectador.jsx'
import HeroDraftOverlay from './pages/HeroDraftOverlay.jsx'
import Regras from './pages/Regras.jsx'
import Perfil from './pages/Perfil.jsx'
import CampeonatoWizard from './pages/CampeonatoWizard.jsx'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import { useCampeonato } from './contexts/CampeonatoContext.jsx'

function LoginCapitaoRedirect() {
  const { idPublico, loading } = useCampeonato()
  if (loading) return null
  return <Navigate to={idPublico ? `/campeonatos/${idPublico}/login-capitao` : '/'} replace />
}

export default function App() {
  return (
    <CampeonatoProvider>
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Navbar />
      <Routes>
        {/* Master home */}
        <Route path="/" element={<HomeMestre />} />

        {/* Championship-scoped routes */}
        <Route path="/campeonatos/:campeonatoId" element={<CampeonatoLayout />}>
          <Route index element={<Home />} />
          <Route path="inscricao"           element={<Inscricao />} />
          <Route path="inscritos"           element={<Inscritos />} />
          <Route path="draft"               element={<Draft />} />
          <Route path="espectador"          element={<Espectador />} />
          <Route path="resultados"          element={<Resultados />} />
          <Route path="elenco"              element={<Elenco />} />
          <Route path="tabela"              element={<Tabela />} />
          <Route path="chave"               element={<Chave />} />
          <Route path="agendamento"         element={<Agendamento />} />
          <Route path="regras"              element={<Regras />} />
          <Route path="hero-draft"            element={<HeroDraft />} />
          <Route path="hero-draft/espectador" element={<HeroDraftEspectador />} />
          <Route path="hero-draft/overlay"    element={<HeroDraftOverlay />} />
          <Route path="login-capitao"         element={<LoginCapitao />} />
        </Route>

        {/* Legacy flat routes — redirect to master home */}
        <Route path="/draft"       element={<Navigate to="/" replace />} />
        <Route path="/espectador"  element={<Navigate to="/" replace />} />
        <Route path="/resultados"  element={<Navigate to="/" replace />} />
        <Route path="/inscritos"   element={<Navigate to="/" replace />} />
        <Route path="/inscricao"   element={<Navigate to="/" replace />} />
        <Route path="/elenco"      element={<Navigate to="/" replace />} />
        <Route path="/tabela"      element={<Navigate to="/" replace />} />
        <Route path="/chave"       element={<Navigate to="/" replace />} />
        <Route path="/agendamento" element={<Navigate to="/" replace />} />
        <Route path="/regras"      element={<Navigate to="/" replace />} />

        {/* Auth & profile */}
        <Route path="/login"         element={<Login />} />
        <Route path="/login-capitao" element={<LoginCapitaoRedirect />} />
        <Route path="/meu-perfil"    element={<Perfil />} />

        {/* Admin */}
        <Route path="/admin/novo-campeonato" element={<ProtectedRoute><CampeonatoWizard /></ProtectedRoute>} />
        <Route path="/admin" element={<ProtectedRoute><Admin /></ProtectedRoute>} />
      </Routes>
      <Footer />
    </BrowserRouter>
    </CampeonatoProvider>
  )
}
