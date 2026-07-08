export const API_ORIGIN = import.meta.env.VITE_API_ORIGIN || "http://localhost:8000";
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || `${API_ORIGIN}/api`;

export function toApiUrl(path) {
  if (!path) return "";
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return `${API_ORIGIN}${path}`;
}

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
    ...options,
  });

  return parseResponse(response);
}

async function multipartRequest(path, formData) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    body: formData,
  });

  return parseResponse(response);
}

async function parseResponse(response) {
  if (!response.ok) {
    let message = "Request failed.";

    try {
      const errorBody = await response.json();
            if (Array.isArray(errorBody.detail)) {
        message = errorBody.detail
          .map((item) => `${item.loc?.join(".") || "field"}: ${item.msg}`)
          .join("; ");
      } else {
        message = errorBody.detail || message;
      }
    } catch {
      message = response.statusText || message;
    }

    throw new Error(message);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

export const trainerSessionsApi = {
  list: () => request("/trainer-sessions"),
  create: (payload) =>
    request("/trainer-sessions", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  update: (id, payload) =>
    request(`/trainer-sessions/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  delete: (id) =>
    request(`/trainer-sessions/${id}`, {
      method: "DELETE",
    }),
};

export const recordingsApi = {
  list: () => request("/recordings"),
  create: (payload) =>
    request("/recordings", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  upload: (payload) => {
    const formData = new FormData();
    formData.append("recording_id", payload.recordingId);
    formData.append("session_name", payload.sessionName);
    formData.append("title", payload.title);
    formData.append("duration", payload.duration);
    formData.append("video_file", payload.videoFile);
    return multipartRequest("/recordings/upload", formData);
  },
  update: (id, payload) =>
    request(`/recordings/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  delete: (id) =>
    request(`/recordings/${id}`, {
      method: "DELETE",
    }),
};

export const sessionRecordingsApi = {
  list: () => request("/session-recordings"),
  create: (payload) =>
    request("/session-recordings", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  update: (id, payload) =>
    request(`/session-recordings/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  delete: (id) =>
    request(`/session-recordings/${id}`, {
      method: "DELETE",
    }),
};

