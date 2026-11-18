# TaskPilot AI
Intelligent Project Management and Predictive Analytics Dashboard.

## Run
```
npm install
npm start          # http://localhost:3000
```
Requires Node.js 18+. Data is stored in `db.json` (created on first run; delete it to reset demo data).

## Demo accounts
| Role | Email | Password |
|---|---|---|
| Admin | admin@taskpilot.com | admin123 |
| Manager | manager@taskpilot.com | manager123 |
| Member | dev@taskpilot.com | member123 |

## Features
- JWT authentication and role-based access (Admin, Manager, Member)
- Projects, tasks, Kanban board with drag and drop
- AI engine: delay-risk score, priority ranking, workload per member
- Status report: rule-based by default, written by an LLM if `ANTHROPIC_API_KEY` is set (see `.env.example`; export the variables before `npm start`)
- Activity feed, auto-refresh every 20 seconds, admin team page

## Structure
- `server.js` API, auth, AI engine (`analyse()` holds the risk and priority logic)
- `public/index.html` the whole frontend (vanilla JS)

## Suggested next steps
1. Replace `db.json` with MongoDB or PostgreSQL
2. Split the frontend into React components with Recharts
3. Add WebSocket notifications, comments and file attachments
4. Add tests and Docker
