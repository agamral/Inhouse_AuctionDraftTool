import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Navbar from './components/Navbar.jsx'
import Footer from './components/Footer.jsx'
import Home from './pages/Home.jsx'
import Inscritos from './pages/Inscritos.jsx'
import Inscricao from './pages/Inscricao.jsx'
import Draft from './pages/Draft.jsx'
import Espectador from './pages/Espectador.jsx'
import Admin from './pages/Admin.jsx'
import Login from './pages/Login.jsx'
import Resultados from './pages/Resultados.jsx'
import ProtectedRoute from './components/ProtectedRoute.jsx'

export default function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Navbar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/inscritos" element={<Inscritos />} />
        <Route path="/inscricao" element={<Inscricao />} />
        <Route path="/draft" element={<Draft />} />
        <Route path="/espectador" element={<Espectador />} />
        <Route path="/resultados" element={<Resultados />} />
        <Route path="/login" element={<Login />} />
        <Route path="/admin" element={<ProtectedRoute><Admin /></ProtectedRoute>} />
      </Routes>
      <Footer />
    </BrowserRouter>
  )
}
