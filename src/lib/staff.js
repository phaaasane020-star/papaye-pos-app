import { api } from "./client-api.js";

export const getStaff = () => api("/api/admin/staff");
export const createStaff = (member) => api("/api/admin/staff", { method: "POST", body: member });
export const updateStaff = (id, changes) => api(`/api/admin/staff/${id}`, { method: "PATCH", body: changes });