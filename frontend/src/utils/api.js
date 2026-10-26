import axios from 'axios';

const API = axios.create({ baseURL: process.env.REACT_APP_API_URL || 'http://localhost:5001/api' });

API.interceptors.request.use(config => {
  const token = localStorage.getItem('astra_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

API.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
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

export const auth = {
  login: (data) => API.post('/auth/login', data),
  register: (data) => API.post('/auth/register', data),
};

export const spacecraft = {
  getAll: () => API.get('/spacecraft').then(toArray),
  getOne: (id) => API.get(`/spacecraft/${id}`),
  create: (data) => API.post('/spacecraft', data),
  update: (id, data) => API.put(`/spacecraft/${id}`, data),
  delete: (id) => API.delete(`/spacecraft/${id}`),
};

export const missions = {
  getAll: () => API.get('/missions').then(toArray),
  create: (data) => API.post('/missions', data),
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
