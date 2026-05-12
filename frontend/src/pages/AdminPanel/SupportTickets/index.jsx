import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Filter, Clock, CheckCircle, CircleAlert, UserCheck, Eye, MessageSquare, Calendar, Tag } from 'lucide-react';
import { AdminContent } from '../components';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import Badge from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Pagination } from '@/components/common';
import { useAuth, useDebounce } from '@/hooks';
import { getAllSupportTickets } from '@/services/supportTickets.service';

const ITEMS_PER_PAGE = 10;

const statusConfig = {
  open: { label: 'Open', variant: 'secondary', icon: Clock },
  pending: { label: 'Pending', variant: 'default', icon: CircleAlert },
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

const SupportTickets = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebounce(searchTerm, 450);
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [assignedFilter, setAssignedFilter] = useState('all');
  const [sortBy, setSortBy] = useState('newest');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(ITEMS_PER_PAGE);
  const [totalItems, setTotalItems] = useState(0);
  const [showFilters, setShowFilters] = useState(false);

  const fetchTickets = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const response = await getAllSupportTickets({
        search: debouncedSearch || undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
        priority: priorityFilter !== 'all' ? priorityFilter : undefined,
        category: categoryFilter !== 'all' ? categoryFilter : undefined,
        assignedTo: assignedFilter !== 'all'
          ? (assignedFilter === 'me' ? (user?.id || user?._id || 'me') : assignedFilter)
          : undefined,
        sortBy,
        page: currentPage,
        limit: pageSize,
      });
      setTickets(response?.tickets || []);
      setTotalItems(response?.total || 0);
    } catch (err) {
      const message = err.response?.data?.message || err.message || 'Failed to load tickets';
      setError(message);
      setTickets([]);
      setTotalItems(0);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, statusFilter, priorityFilter, categoryFilter, assignedFilter, sortBy, currentPage, pageSize, user?.id, user?._id]);

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, statusFilter, priorityFilter, categoryFilter, assignedFilter, sortBy, pageSize]);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  const header = (
    <div className="admin-card bg-white/85 backdrop-blur-md border border-slate-200 rounded-2xl shadow-[0_18px_42px_-28px_rgba(15,23,42,0.22)] p-4 sm:p-5 md:p-6">
      <div className="flex flex-col gap-3">
        <div className="space-y-1">
          <h2 className="text-xl sm:text-2xl font-semibold text-slate-900">Support Tickets</h2>
          <p className="text-xs sm:text-sm text-slate-500">Track, assign, and resolve tickets created by chat or web</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <label className="flex-1 flex items-center gap-2 px-3 py-2.5 rounded-xl bg-white/85 border border-slate-200 shadow-inner backdrop-blur-sm">
            <Search className="w-4 h-4 text-slate-400 flex-shrink-0" />
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search tickets, names, emails..."
              className="w-full bg-transparent outline-none text-sm text-slate-700 placeholder:text-slate-400"
            />
          </label>
          <Button
            variant="outline"
            onClick={() => setShowFilters((v) => !v)}
            className="px-3 py-2 rounded-xl border border-slate-200 bg-white/80 text-slate-700 hover:bg-slate-50 transition flex items-center justify-center gap-2"
          >
            <Filter className="w-4 h-4" />
            <span className="sm:inline">Filter</span>
          </Button>
        </div>
      </div>

      {showFilters && (
        <div className="mt-4 pt-4 border-t border-slate-200/70 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <Label>Status</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Priority</Label>
            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Category</Label>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {Object.entries(categoryLabels).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Assignee</Label>
            <Select value={assignedFilter} onValueChange={setAssignedFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="me">Assigned to me</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Sort</Label>
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Newest</SelectItem>
                <SelectItem value="oldest">Oldest</SelectItem>
                <SelectItem value="priority-high">Priority High</SelectItem>
                <SelectItem value="priority-low">Priority Low</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}
    </div>
  );

  const stats = useMemo(() => {
    const openCount = tickets.filter((t) => t.status === 'open').length;
    const pendingCount = tickets.filter((t) => t.status === 'pending').length;
    const closedCount = tickets.filter((t) => t.status === 'closed').length;
    return (
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card><CardContent className="p-4"><div className="text-sm text-slate-500">Open</div><div className="text-2xl font-bold">{openCount}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-sm text-slate-500">Pending</div><div className="text-2xl font-bold">{pendingCount}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-sm text-slate-500">Closed</div><div className="text-2xl font-bold">{closedCount}</div></CardContent></Card>
      </div>
    );
  }, [tickets]);

  const handlePageChange = (page) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <>
      <AdminContent loading={loading} error={error} onRetry={fetchTickets} header={header} stats={stats}>
        <div className="space-y-4">
          {tickets.length === 0 ? (
            <div className="text-center py-10 text-slate-500">No tickets found</div>
          ) : tickets.map((ticket) => {
            const StatusIcon = statusConfig[ticket.status]?.icon || Clock;
            return (
              <Card key={ticket._id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                    <div className="space-y-2 flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs sm:text-sm font-semibold">
                          #{ticket.ticketNumber?.slice(-8) || ticket._id.slice(-8)}
                        </span>
                        <Badge variant={statusConfig[ticket.status]?.variant || 'secondary'} className="flex items-center gap-1">
                          <StatusIcon size={12} />
                          {statusConfig[ticket.status]?.label || ticket.status}
                        </Badge>
                        <Badge variant={priorityConfig[ticket.priority]?.variant || 'default'} className="flex items-center gap-1">
                          <Tag size={12} />
                          {priorityConfig[ticket.priority]?.label || ticket.priority}
                        </Badge>
                        <Badge variant="outline">{categoryLabels[ticket.category] || ticket.category || 'Other'}</Badge>
                      </div>
                      <div className="text-sm text-slate-600 space-y-1">
                        <p className="truncate"><strong>Customer:</strong> {ticket.contactName || ticket.userId?.fullName || 'Guest'}</p>
                        <p className="truncate"><strong>Email:</strong> {ticket.contactEmail || ticket.userId?.email || 'N/A'}</p>
                        <p className="truncate"><strong>Subject:</strong> {ticket.subject}</p>
                        <p className="line-clamp-2 text-slate-500">{ticket.description}</p>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-2 flex-shrink-0">
                      <div className="text-right text-xs text-slate-500">
                        <p className="flex items-center gap-1 justify-end"><Calendar size={12} /> {new Date(ticket.createdAt).toLocaleString()}</p>
                        <p className="flex items-center gap-1 justify-end"><MessageSquare size={12} /> {ticket.channel || 'chat'}</p>
                        <p className="flex items-center gap-1 justify-end"><UserCheck size={12} /> {ticket.assignedTo?.fullName || 'Unassigned'}</p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => navigate(`/admin/support-tickets/${ticket._id}`)}
                      >
                        <Eye size={14} className="mr-1" />
                        View
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {totalItems > pageSize && (
          <div className="mt-5">
            <Pagination
              currentPage={currentPage}
              totalItems={totalItems}
              pageSize={pageSize}
              onPageChange={handlePageChange}
              onPageSizeChange={setPageSize}
            />
          </div>
        )}
      </AdminContent>
    </>
  );
};

export default SupportTickets;
