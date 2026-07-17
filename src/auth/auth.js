export const roles = ["Student", "Teacher", "Employer", "Employee", "Admin"];

export const routePermissions = {
  dashboard: roles,
  trainer: ["Teacher", "Admin"],
  recordings: ["Teacher", "Admin"],
  sessionRecordings: roles,
  sessionManagement: ["Teacher", "Admin"],
  classroom: ["Student", "Teacher", "Admin"],
  virtualClassroom: ["Student", "Teacher", "Admin"],
  attendance: ["Student", "Teacher", "Admin"],
  attendanceReports: ["Student", "Teacher", "Admin"],
};

export function saveAuthSession(authData) {
  localStorage.setItem("authToken", authData.access_token);
  localStorage.setItem("authUser", JSON.stringify(authData.user));
}

export function clearAuthSession() {
  localStorage.removeItem("authToken");
  localStorage.removeItem("authUser");
}

export function getAuthToken() {
  return localStorage.getItem("authToken");
}

export function getAuthUser() {
  try {
    const user = localStorage.getItem("authUser");
    return user ? JSON.parse(user) : null;
  } catch {
    return null;
  }
}

export function getUserRole() {
  return getAuthUser()?.role || "";
}

export function canAccess(allowedRoles) {
  const role = getUserRole();
  return Boolean(role) && allowedRoles.includes(role);
}

