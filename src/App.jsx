import { Routes, Route } from "react-router-dom";
import Login from "./pages/Login";
import Register from "./pages/Register";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import DigitalClassroom from "./pages/DigitalClassroom";
import TrainerDashboard from "./pages/TrainerDashboard";
import RecordingDashboard from "./pages/RecordingDashboard";
import SessionRecordings from "./pages/SessionRecordings";
import AdminDashboard from "./pages/AdminDashboard";

function App() {
  return (
    <Routes>
      <Route path="/" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/dashboard" element={<AdminDashboard />} />
      <Route path="/trainer-dashboard" element={<TrainerDashboard />} />
      <Route path="/recordings" element={<RecordingDashboard />} />
      <Route path="/session-recordings" element={<SessionRecordings />} />
      <Route path="/classroom" element={<DigitalClassroom />} />
    </Routes>
  );
}

export default App;
