const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth.middleware');
const optionalAuth = require('../middlewares/optionalAuth.middleware');
const adminOnly = require('../middlewares/admin.middleware');
const supportTicketController = require('../controllers/support-ticket.controller');
const { apiLimiter } = require('../middlewares/rateLimit.middleware');

router.post('/', apiLimiter, optionalAuth, supportTicketController.createTicket);
router.get('/me', auth, supportTicketController.getMyTickets);
router.get('/admin', auth, adminOnly, supportTicketController.adminListTickets);
router.get('/admin/stats', auth, adminOnly, supportTicketController.adminTicketStats);
router.get('/admin/assignees', auth, adminOnly, supportTicketController.adminAssigneeStats);
router.patch('/admin/:id', auth, adminOnly, supportTicketController.adminUpdateTicket);
router.post('/admin/:id/comments', auth, adminOnly, supportTicketController.adminAddComment);
router.get('/:id', auth, supportTicketController.getTicketById);

module.exports = router;
