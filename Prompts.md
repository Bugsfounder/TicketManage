# AI Transparency & Technical Notes - Prompts.md

This document outlines the technical design decisions, data structure design, and troubleshooting strategies implemented for the **Live Ops Helpdesk** project.


## 1. In-Memory Lock Map Structure
To track active ticket locks efficiently and ensure fast retrieval, we used a JavaScript `Map()` on the Node.js server. 

### Map Entry Schema
- **Key**: `ticketId` (String)
- **Value**: `{ socketId, agentName }` (Object)

### Rationale
- Standard databases (like SQL or MongoDB) incur network overhead and disk I/O, which are too slow for real-time ticket locks. A simple in-memory `Map()` provides $O(1)$ lock lookups, updates, and deletions.
- When an agent disconnects, we iterate through the `Map()` to find entries matching `socket.id`. This is highly efficient for up to a few thousand concurrent connections.


## 2. Managing React Strict Mode & Double Socket Registration
In React (especially version 18+ and 19), components mounted inside `React.StrictMode` run their `useEffect` hooks twice in development. This can cause sockets to:
- Connect and register listeners twice.
- Create duplicate events or cause memory leaks.

### Mitigation Strategy
We solved this by using the standard cleanup function in the `useEffect` hook to remove the registered socket event listeners on component unmount:

```javascript
useEffect(() => {
  // Setup listeners
  socket.on('connect', onConnect);
  socket.on('disconnect', onDisconnect);
  socket.on('init_data', onInitData);
  // ...

  // Cleanup listeners on unmount
  return () => {
    socket.off('connect', onConnect);
    socket.off('disconnect', onDisconnect);
    socket.off('init_data', onInitData);
    // ...
  };
}, []);
```

Using `socket.off(eventName, callback)` ensures that when React mounts, unmounts, and remounts the component in development, the old listeners are fully discarded, leaving exactly one active listener per event.


## 3. Server-Driven UI State (Pessimistic Locking Flow)
To ensure absolute synchronization and prevent local race conditions, the client does not immediately toggle into editing mode upon clicking a button.
1. The user clicks "Select" on a ticket.
2. If it is unlocked, the client sends `lock_ticket` to the server.
3. The server validates the lock in memory. If successful, it broadcasts `ticket_locked` to *all* clients (including the requester).
4. The client's React component listens for `ticket_locked`. If the incoming lock belongs to the client's current `socket.id`, it triggers editing mode and sets form values.
5. If another agent's socket wins the race, the client receives `ticket_locked` with a different `socketId`, disabling the select button and showing the locked badge.
