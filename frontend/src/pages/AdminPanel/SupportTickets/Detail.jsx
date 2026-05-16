import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Calendar, CheckCircle, Clock, Ticket, UserCheck, MessageSquare, Tag } from 'lucide-react';
import { AdminContent } from '../components';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import Badge from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/hooks';
import { getAllSupportTickets, addSupportTicketComment, getSupportTicketById, updateSupportTicket } from '@/services/supportTickets.service';

const statusConfig = {
  open: { label: 'Open', variant: 'secondary', icon: Clock },
  pending: { label: 'Pending', variant: 'default', icon: MessageSquare },
  closed: { label: 'Closed', variant: 'success', icon: CheckCircle },
};

const priorityConfig = {
  low: { label: 'Low', variant: 'secondary' },
  normal: { label: 'Normal', variant: 'default' },
  high: { label: 'High', variant: 'destructive' },
  urgent: { label: 'Urgent', variant: 'destructive' },
};

const categoryLabels = {
  checkout: 'Checkout',
  catalog: 'Catalog',
  shipping: 'Shipping',
  payment: 'Payment',
  refund: 'Refund',
  return: 'Return',
  account: 'Account',
  product: 'Product',
  complaint: 'Complaint',
  other: 'Other',
};

const TicketDetailPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { ticketId } = useParams();
  const [ticket, setTicket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [commentVisibility, setCommentVisibility] = useState('internal');
  const [form, setForm] = useState({
    status: 'open',
    priority: 'normal',
    assignedTo: '',
    internalNote: '',
    resolutionNote: '',
  });

  const loadTicket = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      let response = await getSupportTicketById(ticketId);
      let data = response?.data || null;

      if (!data) {
        const fallback = await getAllSupportTickets({ search: ticketId, limit: 1 });
        data = fallback?.tickets?.[0] || null;
      }

      setTicket(data);
      setForm({
        status: data?.status || 'open',
        priority: data?.priority || 'normal',
        assignedTo: data?.assignedTo?._id || data?.assignedTo || '',
        internalNote: data?.internalNote || '',
        resolutionNote: data?.resolutionNote || '',
      });
    } catch (err) {
      const fallback = await getAllSupportTickets({ search: ticketId, limit: 1 }).catch(() => null);
      const data = fallback?.tickets?.[0] || null;
      if (data) {
        setTicket(data);
        setForm({
          status: data?.status || 'open',
          priority: data?.priority || 'normal',
          assignedTo: data?.assignedTo?._id || data?.assignedTo || '',
          internalNote: data?.internalNote || '',
          resolutionNote: data?.resolutionNote || '',
        });
        setError('');
        return;
      }
      setError(err.response?.data?.message || err.message || 'Failed to load ticket');
      setTicket(null);
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  useEffect(() => {
    if (!ticketId) return;
    loadTicket();
  }, [ticketId, loadTicket]);

  const handleSave = async () => {
    if (!ticket) return;
    try {
      setSaving(true);
      await updateSupportTicket(ticket._id, {
        ...form,
        assignedTo: form.assignedTo || null,
      });
      toast.success('Ticket updated successfully');
      await loadTicket();
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Failed to update ticket');
    } finally {
      setSaving(false);
    }
  };

  const handleAddComment = async () => {
    if (!commentText.trim() || !ticket) return;
    try {
      setSaving(true);
      await addSupportTicketComment(ticket._id, {
        message: commentText,
        visibility: commentVisibility,
      });
      toast.success('Comment added successfully');
      setCommentText('');
      await loadTicket();
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Failed to add comment');
    } finally {
      setSaving(false);
    }
  };

  const header = useMemo(() => {
    if (!ticket) return null;
    const StatusIcon = statusConfig[ticket.status]?.icon || Clock;
    return (
      <div className="admin-card bg-white/85 backdrop-blur-md border border-slate-200 rounded-2xl shadow-[0_18px_42px_-28px_rgba(15,23,42,0.22)] p-4 sm:p-5 md:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => navigate('/admin/support-tickets')}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
            >
              <ArrowLeft size={14} />
              Back to tickets
            </button>
            <div className="flex items-center gap-2 flex-wrap">
              <Ticket size={18} />
              <h2 className="text-xl sm:text-2xl font-semibold text-slate-900">{ticket.ticketNumber}</h2>
              <Badge variant={statusConfig[ticket.status]?.variant || 'secondary'} className="flex items-center gap-1">
                <StatusIcon size={12} />
                {statusConfig[ticket.status]?.label || ticket.status}
              </Badge>
              <Badge variant={priorityConfig[ticket.priority]?.variant || 'default'} className="flex items-center gap-1">
                <Tag size={12} />
                {priorityConfig[ticket.priority]?.label || ticket.priority}
              </Badge>
            </div>
            <p className="text-sm text-slate-500">{ticket.subject}</p>
          </div>
          <div className="text-sm text-slate-600 lg:text-right space-y-1">
            <p className="flex items-center gap-1 lg:justify-end"><Calendar size={12} /> {new Date(ticket.createdAt).toLocaleString()}</p>
            <p className="flex items-center gap-1 lg:justify-end"><UserCheck size={12} /> {ticket.assignedTo?.fullName || 'Unassigned'}</p>
            <p className="flex items-center gap-1 lg:justify-end">Category: {categoryLabels[ticket.category] || ticket.category || 'Other'}</p>
          </div>
        </div>
      </div>
    );
  }, [ticket, navigate]);

  const body = ticket ? (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(value) => setForm((current) => ({ ...current, status: value }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Priority</Label>
              <Select value={form.priority} onValueChange={(value) => setForm((current) => ({ ...current, priority: value }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
            <div>
              <div className="text-sm font-medium">Assigned To</div>
              <div className="text-xs text-slate-500">{ticket.assignedTo?.fullName || 'Unassigned'}</div>
            </div>
            <Button variant="outline" onClick={() => setForm((current) => ({ ...current, assignedTo: user?.id || user?._id || '' }))}>
              Assign to me
            </Button>
          </div>

          <div>
            <Label>Internal Note</Label>
            <textarea
              value={form.internalNote}
              onChange={(e) => setForm((current) => ({ ...current, internalNote: e.target.value }))}
              rows={6}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none"
              placeholder="Internal note for CSKH..."
            />
          </div>

          <div>
            <Label>Resolution Note</Label>
            <textarea
              value={form.resolutionNote}
              onChange={(e) => setForm((current) => ({ ...current, resolutionNote: e.target.value }))}
              rows={6}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none"
              placeholder="What was done to resolve this ticket..."
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => navigate('/admin/support-tickets')}>
              Back
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-5">
          <div>
            <div className="text-sm font-semibold mb-1">Customer</div>
            <div className="text-sm text-slate-700">{ticket.contactName || ticket.userId?.fullName || 'Guest'}</div>
            <div className="text-sm text-slate-500">{ticket.contactEmail || ticket.userId?.email || 'N/A'}</div>
            <div className="text-sm text-slate-500">{ticket.contactPhone || ticket.userId?.phone || 'N/A'}</div>
          </div>

          <div>
            <div className="text-sm font-semibold mb-1">Description</div>
            <p className="text-sm text-slate-700 whitespace-pre-wrap rounded-lg bg-slate-50 p-3">
              {ticket.description}
            </p>
          </div>

          <div>
            <div className="text-sm font-semibold mb-1">Source Message</div>
            <p className="text-sm text-slate-600 whitespace-pre-wrap rounded-lg bg-slate-50 p-3">
              {ticket.sourceMessage || 'N/A'}
            </p>
          </div>

          {ticket.orderId && (
            <div>
              <div className="text-sm font-semibold mb-1">Linked Order</div>
              <div className="text-sm text-slate-600">
                #{ticket.orderId._id ? ticket.orderId._id.slice(-8) : ticket.orderId}
              </div>
            </div>
          )}

          {ticket.internalNote && (
            <div>
              <div className="text-sm font-semibold mb-1">Internal Note Preview</div>
              <p className="text-sm text-slate-600 whitespace-pre-wrap rounded-lg bg-slate-50 p-3">
                {ticket.internalNote}
              </p>
            </div>
          )}

          {ticket.resolutionNote && (
            <div>
              <div className="text-sm font-semibold mb-1">Resolution Note Preview</div>
              <p className="text-sm text-slate-600 whitespace-pre-wrap rounded-lg bg-slate-50 p-3">
                {ticket.resolutionNote}
              </p>
            </div>
          )}

          <div className="border-t pt-4">
            <div className="flex items-center justify-between gap-2 mb-3">
              <div>
                <div className="text-sm font-semibold">Timeline / Thread</div>
                <div className="text-xs text-slate-500">All ticket activity in one place</div>
              </div>
              <Badge variant="outline">{ticket.activities?.length || 0} items</Badge>
            </div>

            <div className="space-y-3 max-h-[22rem] overflow-y-auto pr-1">
              {(ticket.activities || [])
                .slice()
                .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
                .map((item, index) => (
                  <div key={`${item.type}-${item.createdAt}-${index}`} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        {item.type?.replace(/_/g, ' ') || 'comment'}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {new Date(item.createdAt).toLocaleString()}
                      </div>
                    </div>
                    <div className="mt-1 text-sm text-slate-700 whitespace-pre-wrap">
                      {item.message || (
                        item.type === 'status_changed'
                          ? `Status changed from ${item.previousStatus || 'unknown'} to ${item.nextStatus || 'unknown'}`
                          : 'No message'
                      )}
                    </div>
                    <div className="mt-2 text-[11px] text-slate-500">
                      {item.authorName || 'System'}
                      {item.visibility ? ` • ${item.visibility}` : ''}
                    </div>
                  </div>
                ))}
            </div>

            <div className="mt-4 space-y-3 rounded-xl border border-slate-200 bg-white p-3">
              <div className="text-sm font-semibold">Add Comment</div>
              <div>
                <Label>Visibility</Label>
                <Select value={commentVisibility} onValueChange={setCommentVisibility}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="internal">Internal note</SelectItem>
                    <SelectItem value="public">Public reply</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <textarea
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                rows={4}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none"
                placeholder="Write a follow-up comment..."
              />
              <div className="flex justify-end">
                <Button onClick={handleAddComment} disabled={saving || !commentText.trim()}>
                  {saving ? 'Saving...' : 'Add Comment'}
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  ) : null;

  return (
    <AdminContent
      loading={loading}
      error={error}
      onRetry={loadTicket}
      header={header}
    >
      {body}
    </AdminContent>
  );
};

export default TicketDetailPage;
