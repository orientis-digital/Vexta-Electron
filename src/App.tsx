import { Navigate, Route, Routes } from 'react-router-dom'
import LoginScreen from './screens/LoginScreen'
import SignupScreen from './screens/SignupScreen'
import LoadingScreen from './screens/LoadingScreen'
import AppLayout from './screens/AppLayout'
import HomeView from './screens/HomeView'
import ChatView from './screens/ChatView'
import ChatInfoView from './screens/ChatInfoView'
import FriendsView from './screens/FriendsView'
import SettingsView from './screens/SettingsView'

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginScreen />} />
      <Route path="/signup" element={<SignupScreen />} />
      <Route path="/loading" element={<LoadingScreen />} />

      <Route path="/" element={<AppLayout />}>
        <Route index element={<HomeView />} />
        <Route path="friends" element={<FriendsView />} />
        <Route path="settings" element={<SettingsView />} />
        <Route path="chat/:chatId" element={<ChatView />} />
        <Route path="chat/:chatId/info" element={<ChatInfoView />} />
      </Route>

      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}

export default App
