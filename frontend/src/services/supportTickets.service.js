import apiClient from './config';

export const getAllSupportTickets = async (params = {}) => {
  const response = await apiClient.get('/support-tickets/admin', { params });
  return response;
};

export const getSupportTicketStats = async (params = {}) => {
  const response = await apiClient.get('/support-tickets/admin/stats', { params });
  return response;
};

export const getSupportTicketAssigneeStats = async (params = {}) => {
  const response = await apiClient.get('/support-tickets/admin/assignees', { params });
  return response;
};

export const getSupportTicketById = async (ticketId) => {
  const response = await apiClient.get(`/support-tickets/${ticketId}`);
  return response;
};

export const updateSupportTicket = async (ticketId, data) => {
  const response = await apiClient.patch(`/support-tickets/admin/${ticketId}`, data);
  return response;
};

export const addSupportTicketComment = async (ticketId, data) => {
  const response = await apiClient.post(`/support-tickets/admin/${ticketId}/comments`, data);
  return response;
};

export default {
  getAllSupportTickets,
  getSupportTicketStats,
  getSupportTicketAssigneeStats,
  getSupportTicketById,
  updateSupportTicket,
  addSupportTicketComment,
};
