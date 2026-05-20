const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Seed data for Support Tickets
let tickets = [
  {
    id: "tk-101",
    title: "Engine Failure - Truck #4521 (I-35 Dallas)",
    description: "Driver reports engine overheating, pulled over on highway shoulder. Heavy smoke. Needs immediate towing.",
    status: "Open",
    customer: "Dallas Freight Group",
    updatedAt: new Date().toISOString()
  },
  {
    id: "tk-102",
    title: "Missed Delivery Window - Warehouse B",
    description: "Shipment #9921 arrived 3 hours late due to severe traffic. Customer refusing delivery unless discount applied.",
    status: "Open",
    customer: "Apex Logistics",
    updatedAt: new Date().toISOString()
  },
  {
    id: "tk-103",
    title: "Broken Liftgate - Truck #0912",
    description: "Liftgate jammed halfway down. Cannot unload pallets of fragile electronics. Driver requesting repair dispatch.",
    status: "InProgress",
    customer: "Lone Star Electronics",
    updatedAt: new Date().toISOString()
  },
  {
    id: "tk-104",
    title: "Refrigeration Unit Fault - Truck #3312",
    description: "Temp alert: Temp rose from -5C to 4C. Carrying frozen seafood. Must redirect to nearest cold storage facility.",
    status: "Open",
    customer: "Ocean Harvest Inc",
    updatedAt: new Date().toISOString()
  }
];

// In-memory lock state: ticketId -> { socketId, agentName }
const locks = new Map();

// Helper to convert locks map to an object for client consumption
const getLocksObject = () => {
  const obj = {};
  for (let [ticketId, lockInfo] of locks.entries()) {
    obj[ticketId] = lockInfo;
  }
  return obj;
};

// HTTP routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', clientCount: io.engine.clientsCount });
});

// Socket.io event loop
io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  // 1. Join Dashboard - Send initial state
  socket.on('join_dashboard', () => {
    socket.emit('init_data', {
      tickets,
      locks: getLocksObject()
    });
  });

  // 2. Lock Ticket Request
  socket.on('lock_ticket', ({ ticketId, agentName }) => {
    // If ticket is already locked by someone else, reject
    if (locks.has(ticketId)) {
      const existingLock = locks.get(ticketId);
      if (existingLock.socketId !== socket.id) {
        socket.emit('lock_failed', { ticketId, reason: `Already locked by ${existingLock.agentName}` });
        return;
      }
    }

    // Assign the lock
    locks.set(ticketId, { socketId: socket.id, agentName });
    console.log(`Ticket locked: ${ticketId} by ${agentName} (${socket.id})`);

    // Broadcast the updated lock to all clients
    io.emit('ticket_locked', { ticketId, lock: { socketId: socket.id, agentName } });
  });

  // 3. Unlock Ticket Request (Save or Cancel/Close)
  socket.on('unlock_ticket', ({ ticketId, updatedData }) => {
    const existingLock = locks.get(ticketId);

    // Only allow unlocking if lock exists and is held by the caller (or force release)
    if (existingLock && existingLock.socketId === socket.id) {
      if (updatedData) {
        // Save the updated ticket info
        const ticketIdx = tickets.findIndex(t => t.id === ticketId);
        if (ticketIdx !== -1) {
          tickets[ticketIdx] = {
            ...tickets[ticketIdx],
            ...updatedData,
            updatedAt: new Date().toISOString()
          };
          console.log(`Ticket updated: ${ticketId} by ${existingLock.agentName}`);
          // Broadcast full updated tickets list to ensure everyone is synced
          io.emit('tickets_updated', tickets);
        }
      }

      locks.delete(ticketId);
      console.log(`Ticket unlocked: ${ticketId}`);
      io.emit('ticket_unlocked', { ticketId });
    }
  });

  // 4. Create Ticket Request
  socket.on('create_ticket', (ticketData) => {
    const newTicket = {
      id: `tk-${Date.now()}`,
      title: ticketData.title || "Untitled Ticket",
      description: ticketData.description || "",
      status: ticketData.status || "Open",
      customer: ticketData.customer || "Unknown Customer",
      updatedAt: new Date().toISOString()
    };

    tickets.push(newTicket);
    console.log(`Ticket created: ${newTicket.id} - ${newTicket.title}`);

    // Broadcast the newly created ticket to everyone
    io.emit('ticket_created', newTicket);
  });

  // 5. Ghost Disconnect Handler
  socket.on('disconnect', () => {
    console.log(`Socket disconnected abruptly: ${socket.id}`);
    
    // Find all locks held by this socket and unlock them
    for (let [ticketId, lockInfo] of locks.entries()) {
      if (lockInfo.socketId === socket.id) {
        locks.delete(ticketId);
        console.log(`Ghost disconnect release: Unlocked ticket ${ticketId} (held by ${lockInfo.agentName})`);
        io.emit('ticket_unlocked', { ticketId });
      }
    }
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
