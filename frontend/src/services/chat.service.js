import apiClient from './config'

export const getChatProviderStatus = async () => {
  return apiClient.get('/chat/providers')
}

export const sendChatMessage = async ({ message, history = [], provider }) => {
  return apiClient.post('/chat/message', {
    message,
    history,
    provider,
  })
}
