import React from "react";
import { Navigate } from "react-router-dom";
import { canAccess, getAuthToken } from "./auth";

function ProtectedRoute({ allowedRoles, children }) {
  if (!getAuthToken()) {
    return <Navigate replace to="/" />;
  }

  if (!canAccess(allowedRoles)) {
    return <Navigate replace to="/access-denied" />;
  }

  return children;
}

export default ProtectedRoute;
