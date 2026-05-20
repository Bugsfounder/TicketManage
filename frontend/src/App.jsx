import React, { useState, useEffect } from 'react';
import { socket } from './socket';

function App() {
  // State for Agent Info
  const [myAgentName, setMyAgentName] = useState(() => {
    const saved = localStorage.getItem('agentName');
    if (saved) return saved;
    const randomName = `Agent-${Math.floor(100 + Math.random() * 900)}`;
    localStorage.setItem('agentName', randomName);
    return randomName;
  });

  // State for tickets and locks
  const [tickets, setTickets] = useState([]);
  const [locks, setLocks] = useState({});
  const [isConnected, setIsConnected] = useState(socket.connected);

  // Selection & Editor state
  const [selectedTicketId, setSelectedTicketId] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editStatus, setEditStatus] = useState('');
  const [editCustomer, setEditCustomer] = useState('');

  // Track newly created tickets for slide-in animation
  const [newlyCreatedTicketIds, setNewlyCreatedTicketIds] = useState(new Set());

  // Form state for creating a ticket
  const [newTitle, setNewTitle] = useState('');
  const [newCustomer, setNewCustomer] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newStatus, setNewStatus] = useState('Open');

  // Handle agent name change
  const handleAgentNameChange = (e) => {
    const newName = e.target.value;
    setMyAgentName(newName);
    localStorage.setItem('agentName', newName);
  };

  // Socket event listener hook
  useEffect(() => {
    // 1. Send initial join event
    socket.emit('join_dashboard');

    const onConnect = () => {
      setIsConnected(true);
      socket.emit('join_dashboard');
    };

    const onDisconnect = () => {
      setIsConnected(false);
    };

    const onInitData = ({ tickets: initialTickets, locks: initialLocks }) => {
      setTickets(initialTickets);
      setLocks(initialLocks);
    };

    const onTicketCreated = (newTicket) => {
      setTickets((prev) => {
        if (prev.some(t => t.id === newTicket.id)) return prev;
        return [...prev, newTicket];
      });

      // Track the ID to apply CSS animation
      setNewlyCreatedTicketIds((prev) => {
        const updated = new Set(prev);
        updated.add(newTicket.id);
        return updated;
      });

      // Clear animation class after a few seconds
      setTimeout(() => {
        setNewlyCreatedTicketIds((prev) => {
          const updated = new Set(prev);
          updated.delete(newTicket.id);
          return updated;
        });
      }, 3000);
    };

    const onTicketLocked = ({ ticketId, lock }) => {
      setLocks((prev) => ({
        ...prev,
        [ticketId]: lock
      }));
    };

    const onTicketUnlocked = ({ ticketId }) => {
      setLocks((prev) => {
        const updated = { ...prev };
        delete updated[ticketId];
        return updated;
      });
    };

    const onTicketsUpdated = (updatedTickets) => {
      setTickets(updatedTickets);
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('init_data', onInitData);
    socket.on('ticket_created', onTicketCreated);
    socket.on('ticket_locked', onTicketLocked);
    socket.on('ticket_unlocked', onTicketUnlocked);
    socket.on('tickets_updated', onTicketsUpdated);

    setIsConnected(socket.connected);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('init_data', onInitData);
      socket.off('ticket_created', onTicketCreated);
      socket.off('ticket_locked', onTicketLocked);
      socket.off('ticket_unlocked', onTicketUnlocked);
      socket.off('tickets_updated', onTicketsUpdated);
    };
  }, []);

  // Synchronize input fields when selection or lock owner changes
  useEffect(() => {
    if (selectedTicketId) {
      const ticket = tickets.find(t => t.id === selectedTicketId);
      if (ticket) {
        setEditTitle(ticket.title);
        setEditDescription(ticket.description);
        setEditStatus(ticket.status);
        setEditCustomer(ticket.customer);
      }
    } else {
      setEditTitle('');
      setEditDescription('');
      setEditStatus('');
      setEditCustomer('');
    }
  }, [selectedTicketId, tickets]);

  // Lock checking functions
  const getTicketLock = (ticketId) => locks[ticketId];
  const isTicketLockedByOther = (ticketId) => {
    const lock = locks[ticketId];
    return lock && lock.socketId !== socket.id;
  };
  const isTicketLockedByMe = (ticketId) => {
    const lock = locks[ticketId];
    return lock && lock.socketId === socket.id;
  };

  // Click handler for ticket selection & locking
  const handleSelectTicket = (ticketId) => {
    const lock = getTicketLock(ticketId);

    // If locked by someone else, we can only view, no locking request sent
    if (lock && lock.socketId !== socket.id) {
      // If we previously held another lock, release it
      if (selectedTicketId && isTicketLockedByMe(selectedTicketId)) {
        socket.emit('unlock_ticket', { ticketId: selectedTicketId });
      }
      setSelectedTicketId(ticketId);
      return;
    }

    // If it's already locked by me, just ensure it's selected
    if (lock && lock.socketId === socket.id) {
      setSelectedTicketId(ticketId);
      return;
    }

    // Release old lock if we held one
    if (selectedTicketId && isTicketLockedByMe(selectedTicketId)) {
      socket.emit('unlock_ticket', { ticketId: selectedTicketId });
    }

    // Select and request lock for the new ticket
    setSelectedTicketId(ticketId);
    socket.emit('lock_ticket', { ticketId, agentName: myAgentName });
  };

  // Close or Cancel Edit
  const handleCloseDetail = () => {
    if (selectedTicketId) {
      // Release lock if we hold it
      if (isTicketLockedByMe(selectedTicketId)) {
        socket.emit('unlock_ticket', { ticketId: selectedTicketId });
      }
      setSelectedTicketId(null);
    }
  };

  // Save changes
  const handleSaveTicket = (e) => {
    e.preventDefault();
    if (!selectedTicketId || !isTicketLockedByMe(selectedTicketId)) return;

    const updatedData = {
      title: editTitle,
      description: editDescription,
      status: editStatus,
      customer: editCustomer
    };

    socket.emit('unlock_ticket', {
      ticketId: selectedTicketId,
      updatedData
    });

    setSelectedTicketId(null);
  };

  // Create ticket
  const handleCreateTicket = (e) => {
    e.preventDefault();
    if (!newTitle.trim() || !newCustomer.trim()) return;

    socket.emit('create_ticket', {
      title: newTitle,
      customer: newCustomer,
      description: newDescription,
      status: newStatus
    });

    setNewTitle('');
    setNewCustomer('');
    setNewDescription('');
    setNewStatus('Open');
  };

  // Get current active ticket metadata
  const selectedTicket = tickets.find(t => t.id === selectedTicketId);
  const selectedTicketLock = selectedTicketId ? getTicketLock(selectedTicketId) : null;
  const isEditingAllowed = selectedTicketId && (!selectedTicketLock || selectedTicketLock.socketId === socket.id);

  return (
    <div>
      <header>
        <h1>RapidDispatch Freight - Live Ops Helpdesk</h1>
        <div className="subtitle">Real-Time Collaborative Support Board</div>
        
        <div className="agent-profile">
          <span>Agent Console Profile:</span>
          <input
            type="text"
            value={myAgentName}
            onChange={handleAgentNameChange}
            placeholder="Enter Agent Name"
          />
          <span style={{ marginLeft: 'auto', color: isConnected ? 'var(--success-text)' : 'var(--error-text)' }}>
            Status: {isConnected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
      </header>

      {/* Connection Lost Banner */}
      {!isConnected && (
        <div className="disconnect-banner">
          Connection Lost: Reconnecting to dispatch system... Please do not close this window.
        </div>
      )}

      <div className="app-grid">
        {/* Left Panel: Ticket Board */}
        <div>
          <div className="panel">
            <h2 className="panel-title">Active Tickets Board</h2>
            <div className="ticket-table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Customer</th>
                    <th>Title</th>
                    <th>Status</th>
                    <th>Presence / Lock Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {tickets.map((ticket) => {
                    const lock = getTicketLock(ticket.id);
                    const isLocked = !!lock;
                    const lockedByMe = isTicketLockedByMe(ticket.id);
                    const lockedByOther = isTicketLockedByOther(ticket.id);
                    const isSelected = selectedTicketId === ticket.id;

                    let rowClass = '';
                    if (lockedByOther) rowClass = 'locked-row';
                    if (isSelected) rowClass += ' selected-row';
                    if (newlyCreatedTicketIds.has(ticket.id)) rowClass += ' new-ticket-anim';

                    return (
                      <tr key={ticket.id} className={rowClass.trim()}>
                        <td style={{ fontFamily: 'var(--font-mono)' }}>{ticket.id}</td>
                        <td>{ticket.customer}</td>
                        <td style={{ fontWeight: '500' }}>{ticket.title}</td>
                        <td>
                          <span className={`status-tag ${ticket.status.toLowerCase()}`}>
                            {ticket.status}
                          </span>
                        </td>
                        <td>
                          {lockedByMe && (
                            <span className="lock-badge-me">Editing Now</span>
                          )}
                          {lockedByOther && (
                            <span className="lock-badge">Locked by {lock.agentName}</span>
                          )}
                          {!isLocked && (
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Available</span>
                          )}
                        </td>
                        <td>
                          <button
                            type="button"
                            onClick={() => handleSelectTicket(ticket.id)}
                            disabled={lockedByOther || !isConnected}
                          >
                            {lockedByMe ? 'Edit' : 'Select'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {tickets.length === 0 && (
                    <tr>
                      <td colSpan="6" className="placeholder-text">
                        No active support tickets.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Bottom Left Panel: Create Ticket */}
          <div className="panel">
            <h2 className="panel-title">Create New Support Ticket</h2>
            <form onSubmit={handleCreateTicket}>
              <div className="form-group">
                <label htmlFor="ticket-title">Ticket Title / Dispatch Issue</label>
                <input
                  id="ticket-title"
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g., Brake System Malfunction - Truck #12"
                  required
                  disabled={!isConnected}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label htmlFor="ticket-customer">Customer / Fleet Partner</label>
                  <input
                    id="ticket-customer"
                    type="text"
                    value={newCustomer}
                    onChange={(e) => setNewCustomer(e.target.value)}
                    placeholder="e.g., Texas Cargo Logistics"
                    required
                    disabled={!isConnected}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="ticket-status">Initial Status</label>
                  <select
                    id="ticket-status"
                    value={newStatus}
                    onChange={(e) => setNewStatus(e.target.value)}
                    disabled={!isConnected}
                  >
                    <option value="Open">Open</option>
                    <option value="InProgress">In Progress</option>
                    <option value="Resolved">Resolved</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="ticket-desc">Detailed Description</label>
                <textarea
                  id="ticket-desc"
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Provide incident details, location, and immediate action items..."
                  disabled={!isConnected}
                />
              </div>

              <button type="submit" className="button-primary" disabled={!isConnected}>
                Create Ticket
              </button>
            </form>
          </div>
        </div>

        {/* Right Panel: Selected Ticket Details & Editor */}
        <div>
          <div className="panel" style={{ position: 'sticky', top: '1.5rem' }}>
            <h2 className="panel-title">Ticket Detail & Resolution</h2>
            {selectedTicket ? (
              <div>
                {/* Meta details */}
                <div className="detail-meta">
                  <div>Ticket ID: {selectedTicket.id}</div>
                  <div>Customer: {selectedTicket.customer}</div>
                  <div>Last Updated: {new Date(selectedTicket.updatedAt).toLocaleTimeString()}</div>
                </div>

                {/* Edit Form / Read-Only View */}
                {isEditingAllowed ? (
                  <form onSubmit={handleSaveTicket}>
                    <div className="form-group">
                      <label htmlFor="edit-title">Title</label>
                      <input
                        id="edit-title"
                        type="text"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        required
                        disabled={!isConnected}
                      />
                    </div>

                    <div className="form-group">
                      <label htmlFor="edit-status">Status</label>
                      <select
                        id="edit-status"
                        value={editStatus}
                        onChange={(e) => setEditStatus(e.target.value)}
                        disabled={!isConnected}
                      >
                        <option value="Open">Open</option>
                        <option value="InProgress">In Progress</option>
                        <option value="Resolved">Resolved</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label htmlFor="edit-desc">Resolution / Description</label>
                      <textarea
                        id="edit-desc"
                        value={editDescription}
                        onChange={(e) => setEditDescription(e.target.value)}
                        required
                        disabled={!isConnected}
                      />
                    </div>

                    <div className="form-actions">
                      <button type="submit" className="button-primary" disabled={!isConnected}>
                        Save Resolution
                      </button>
                      <button type="button" onClick={handleCloseDetail}>
                        Cancel / Release Lock
                      </button>
                    </div>
                  </form>
                ) : (
                  <div>
                    <h3 style={{ margin: '0 0 0.5rem 0', fontWeight: 'normal' }}>
                      {selectedTicket.title}
                    </h3>
                    <div style={{ marginBottom: '1rem' }}>
                      Status:{' '}
                      <span className={`status-tag ${selectedTicket.status.toLowerCase()}`}>
                        {selectedTicket.status}
                      </span>
                    </div>
                    
                    <div className="detail-desc">
                      {selectedTicket.description}
                    </div>

                    {selectedTicketLock && (
                      <div className="disconnect-banner" style={{ background: '#f5eee6', border: '1px solid #c2b6a9', color: '#6b5a49', marginBottom: '1rem' }}>
                        This ticket is locked by {selectedTicketLock.agentName}. You cannot make edits until they finish.
                      </div>
                    )}

                    <button type="button" onClick={handleCloseDetail}>
                      Close Details
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="placeholder-text">
                Select a ticket from the board to view, lock, and edit its resolution in real-time.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
