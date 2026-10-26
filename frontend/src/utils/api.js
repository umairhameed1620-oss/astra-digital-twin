import axios from 'axios';

export const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5001/api';

const API = axios.create({ baseURL: API_URL, timeout: 300000 });

API.interceptors.request.use(config => {
  const token = localStorage.getItem('astra_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

API.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401 && !String(err.config?.url || '').startsWith('/auth/')) {
      localStorage.removeItem('astra_token');
      localStorage.removeItem('astra_user');
      window.location.href = '/';
    }
    return Promise.reject(err);
  }
);

// Helper to always get array from response
const toArray = (res) => {
  if (Array.isArray(res.data)) return { data: res.data };
  if (res.data?.data) return res.data;
  return { data: [], pagination: { total: 0 } };
};

// Human-readable message from an API error.
export const errorText = (err, fallback = 'Something went wrong') =>
  err?.response?.data?.error || (err?.code === 'ECONNABORTED' ? 'The request timed out' : err?.message) || fallback;

export const auth = {
  login: (data) => API.post('/auth/login', data),
  register: (data) => API.post('/auth/register', data),
};

export const spacecraft = {
  getAll: () => API.get('/spacecraft').then(toArray),
  getOne: (id) => API.get(`/spacecraft/${id}`),
  create: (data) => API.post('/spacecraft', data),
  update: (id, data) => API.put(`/spacecraft/${id}`, data),
  setStatus: (id, status) => API.put(`/spacecraft/${id}/status`, { status }),
  linkOrbit: (id, body) => API.put(`/spacecraft/${id}/orbit`, body),
  bulkNorad: (noradIds, opts = {}) => API.post('/spacecraft/bulk-norad', { noradIds, ...opts }),
  setAlertsMuted: (id, muted) => API.put(`/spacecraft/${id}/alerts`, { muted }),
  screenNow: (id) => API.post(`/spacecraft/${id}/screen`),
  uploadCdm: (id, content) => API.post(`/spacecraft/${id}/cdm`, { content }),
  cdms: (id) => API.get(`/spacecraft/${id}/cdms`),
  events: (id) => API.get(`/spacecraft/${id}/events`),
  delete: (id) => API.delete(`/spacecraft/${id}`),
};

export const tle = {
  lookup: (norad) => API.get(`/tle/${encodeURIComponent(norad)}`),
};

export const conjunction = {
  screen: (id) => API.get(`/conjunction/${id}`),
  manoeuvre: (id, threat) => API.get(`/conjunction/${id}/manoeuvre`, { params: threat ? { threat } : {} }),
  reportPdf: (id, threat) => API.get(`/conjunction/${id}/report.pdf`, { responseType: 'blob', params: threat ? { threat } : {} }),
};

export const missions = {
  getAll: () => API.get('/missions').then(toArray),
  create: (data) => API.post('/missions', data),
  setStatus: (id, status) => API.put(`/missions/${id}/status`, { status }),
  delete: (id) => API.delete(`/missions/${id}`),
};

export const alerts = {
  list: () => API.get('/alerts'),
  status: () => API.get('/alerts/status'),
  getSettings: () => API.get('/alerts/settings'),
  saveSettings: (data) => API.put('/alerts/settings', data),
  test: () => API.post('/alerts/test'),
};

export const validation = {
  run: (spacecraftIds) => API.post('/validation/run', spacecraftIds ? { spacecraftIds } : {}),
  list: () => API.get('/validation'),
  summary: () => API.get('/validation/summary'),
  get: (id) => API.get(`/validation/${id}`),
  csv: (id) => API.get(`/validation/${id}/export.csv`, { responseType: 'blob' }),
  pdf: (id) => API.get(`/validation/${id}/report.pdf`, { responseType: 'blob' }),
};

export const simulation = {
  start: (id) => API.post(`/simulation/start/${id}`),
  stop: (id) => API.post(`/simulation/stop/${id}`),
};

export const ai = {
  analyse: (data) => API.post('/ai/analyse', data),
  briefing: (data) => API.post('/ai/briefing', data),
};

export const telemetry = {
  history: (id, limit) => API.get(`/telemetry/${id}/history?limit=${limit || 100}`),
};

export default API;
