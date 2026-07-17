import { Routes, Route } from "react-router-dom";
import Login from "./pages/Login";
import Register from "./pages/Register";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import DigitalClassroom from "./pages/DigitalClassroom";
import TrainerDashboard from "./pages/TrainerDashboard";
import RecordingDashboard from "./pages/RecordingDashboard";
import SessionRecordings from "./pages/SessionRecordings";
import SessionManagement from "./pages/SessionManagement";
import VirtualClassroom from "./pages/VirtualClassroom";
import AdminDashboard from "./pages/AdminDashboard";
import Attendance from "./pages/Attendance";
import AccessDenied from "./pages/AccessDenied";
import ProtectedRoute from "./auth/ProtectedRoute";
import AttendanceReports from "./pages/AttendanceReports";
import { routePermissions } from "./auth/auth";

function App() {
  return (
    <Routes>
      <Route path="/" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/access-denied" element={<AccessDenied />} />
      <Route path="/dashboard" element={<ProtectedRoute allowedRoles={routePermissions.dashboard}><AdminDashboard /></ProtectedRoute>} />
      <Route path="/trainer-dashboard" element={<ProtectedRoute allowedRoles={routePermissions.trainer}><TrainerDashboard /></ProtectedRoute>} />
      <Route path="/recordings" element={<ProtectedRoute allowedRoles={routePermissions.recordings}><RecordingDashboard /></ProtectedRoute>} />
      <Route path="/session-recordings" element={<ProtectedRoute allowedRoles={routePermissions.sessionRecordings}><SessionRecordings /></ProtectedRoute>} />
      <Route path="/session-management" element={<ProtectedRoute allowedRoles={routePermissions.sessionManagement}><SessionManagement /></ProtectedRoute>} />
      <Route path="/attendance" element={<ProtectedRoute allowedRoles={routePermissions.attendance}><Attendance /></ProtectedRoute>} />
      <Route path="/virtual-classroom" element={<ProtectedRoute allowedRoles={routePermissions.virtualClassroom}><VirtualClassroom /></ProtectedRoute>} />
      <Route path="/classroom" element={<ProtectedRoute allowedRoles={routePermissions.classroom}><DigitalClassroom /></ProtectedRoute>} />
      <Route path="/attendance-reports" element={<ProtectedRoute allowedRoles={routePermissions.attendanceReports}><AttendanceReports /></ProtectedRoute>} />
    </Routes>
  );
}

export default App;

