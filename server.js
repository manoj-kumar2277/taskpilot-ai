// TaskPilot AI - backend (Express + JWT + JSON file storage)
const express = require('express'), fs = require('fs'), path = require('path');
const bcrypt = require('bcryptjs'), jwt = require('jsonwebtoken');

const PORT = process.env.PORT || 3000;
const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const DB_FILE = path.join(__dirname, 'db.json');
const DAY = 86400000;
const uid = () => Math.random().toString(36).slice(2, 10);
const iso = t => new Date(t).toISOString().slice(0, 10);

/* ---------- storage ---------- */
let db;
const save = () => fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
function seed() {
  const h = p => bcrypt.hashSync(p, 8), now = Date.now();
  const users = [
    { id: 'u1', name: 'Asha Admin', email: 'admin@taskpilot.com', pass: h('admin123'), role: 'Admin' },
    { id: 'u2', name: 'Mohan Manager', email: 'manager@taskpilot.com', pass: h('manager123'), role: 'Manager' },
    { id: 'u3', name: 'Divya Developer', email: 'dev@taskpilot.com', pass: h('member123'), role: 'Member' },
    { id: 'u4', name: 'Karthik Tester', email: 'qa@taskpilot.com', pass: h('member123'), role: 'Member' },
  ];
  const projects = [{ id: 'p1', name: 'Website Redesign', description: 'Rebuild the company website with a new design system.',
    deadline: iso(now + 12 * DAY), createdAt: now - 10 * DAY, ownerId: 'u2' }];
  const T = (title, status, priority, assigneeId, dueIn, est, doneAgo) => ({ id: uid(), projectId: 'p1', title, description: '',
    status, priority, assigneeId, due: iso(now + dueIn * DAY), estimate: est, createdAt: now - 10 * DAY,
    completedAt: status === 'done' ? now - doneAgo * DAY : null });
  const tasks = [
    T('Gather requirements', 'done', 'high', 'u2', -8, 4, 8), T('Design system and wireframes', 'done', 'high', 'u3', -4, 12, 4),
    T('Build landing page', 'doing', 'high', 'u3', 2, 10, 0), T('Set up authentication', 'doing', 'medium', 'u3', -1, 8, 0),
    T('Write API documentation', 'todo', 'low', 'u4', 9, 5, 0), T('Cross-browser testing', 'todo', 'medium', 'u4', 6, 8, 0),
    T('Performance optimisation', 'todo', 'medium', 'u3', 8, 6, 0), T('Deploy to production', 'todo', 'high', 'u2', 11, 3, 0),
  ];
  return { users, projects, tasks, activity: [{ id: uid(), msg: 'Demo project created', at: now }] };
}
if (fs.existsSync(DB_FILE)) db = JSON.parse(fs.readFileSync(DB_FILE)); else { db = seed(); save(); }
const log = msg => { db.activity.unshift({ id: uid(), msg, at: Date.now() }); db.activity.length = Math.min(db.activity.length, 50); };

/* ---------- auth ---------- */
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
const pub = u => ({ id: u.id, name: u.name, email: u.email, role: u.role });
const sign = u => jwt.sign({ id: u.id }, SECRET, { expiresIn: '7d' });
function auth(req, res, next) {
  try {
    const { id } = jwt.verify((req.headers.authorization || '').slice(7), SECRET);
    req.user = db.users.find(u => u.id === id); if (!req.user) throw new Error();
    next();
  } catch { res.status(401).json({ error: 'Please sign in to continue' }); }
}
const need = (...roles) => (req, res, next) =>
  roles.includes(req.user.role) ? next() : res.status(403).json({ error: 'You do not have permission to do this' });

app.post('/api/auth/register', (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !email || !password || password.length < 6) return res.status(400).json({ error: 'Enter a name, email and a password of at least 6 characters' });
  if (db.users.some(u => u.email === email.toLowerCase())) return res.status(409).json({ error: 'This email is already registered' });
  const u = { id: uid(), name, email: email.toLowerCase(), pass: bcrypt.hashSync(password, 8), role: 'Member' };
  db.users.push(u); log(`${u.name} joined the workspace`); save();
  res.json({ token: sign(u), user: pub(u) });
});
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  const u = db.users.find(x => x.email === String(email).toLowerCase());
  if (!u || !bcrypt.compareSync(String(password), u.pass)) return res.status(401).json({ error: 'Email or password is incorrect' });
  res.json({ token: sign(u), user: pub(u) });
});
app.get('/api/me', auth, (req, res) => res.json(pub(req.user)));
app.get('/api/users', auth, (req, res) => res.json(db.users.map(pub)));
app.patch('/api/users/:id/role', auth, need('Admin'), (req, res) => {
  const u = db.users.find(x => x.id === req.params.id);
  if (!u || !['Admin', 'Manager', 'Member'].includes(req.body.role)) return res.status(400).json({ error: 'Invalid user or role' });
  u.role = req.body.role; log(`${u.name} is now ${u.role}`); save(); res.json(pub(u));
});

/* ---------- projects & tasks ---------- */
app.get('/api/projects', auth, (req, res) => res.json(db.projects));
app.post('/api/projects', auth, need('Admin', 'Manager'), (req, res) => {
  const { name, description, deadline } = req.body || {};
  if (!name || !deadline) return res.status(400).json({ error: 'A project needs a name and a deadline' });
  const p = { id: uid(), name, description: description || '', deadline, createdAt: Date.now(), ownerId: req.user.id };
  db.projects.push(p); log(`${req.user.name} created project ${p.name}`); save(); res.json(p);
});
app.get('/api/projects/:id/tasks', auth, (req, res) => res.json(db.tasks.filter(t => t.projectId === req.params.id)));
app.post('/api/projects/:id/tasks', auth, need('Admin', 'Manager'), (req, res) => {
  const b = req.body || {};
  if (!b.title) return res.status(400).json({ error: 'A task needs a title' });
  const t = { id: uid(), projectId: req.params.id, title: b.title, description: b.description || '', status: 'todo',
    priority: b.priority || 'medium', assigneeId: b.assigneeId || null, due: b.due || null, estimate: Number(b.estimate) || 4,
    createdAt: Date.now(), completedAt: null };
  db.tasks.push(t); log(`${req.user.name} added task "${t.title}"`); save(); res.json(t);
});
app.patch('/api/tasks/:id', auth, (req, res) => {
  const t = db.tasks.find(x => x.id === req.params.id);
  if (!t) return res.status(404).json({ error: 'Task not found' });
  const manager = ['Admin', 'Manager'].includes(req.user.role);
  if (!manager && t.assigneeId !== req.user.id) return res.status(403).json({ error: 'You can only update tasks assigned to you' });
  const allowed = manager ? ['title', 'description', 'status', 'priority', 'assigneeId', 'due', 'estimate'] : ['status'];
  const before = t.status;
  allowed.forEach(k => { if (k in req.body) t[k] = k === 'estimate' ? Number(req.body[k]) || 0 : req.body[k]; });
  if (t.status !== before) { t.completedAt = t.status === 'done' ? Date.now() : null; log(`${req.user.name} moved "${t.title}" to ${t.status}`); }
  save(); res.json(t);
});
app.delete('/api/tasks/:id', auth, need('Admin', 'Manager'), (req, res) => {
  db.tasks = db.tasks.filter(t => t.id !== req.params.id); save(); res.json({ ok: true });
});

/* ---------- AI engine (rule-based; the LLM only writes the summary) ---------- */
function analyse(project) {
  const now = Date.now(), tasks = db.tasks.filter(t => t.projectId === project.id);
  const done = tasks.filter(t => t.status === 'done'), open = tasks.filter(t => t.status !== 'done');
  const dueTs = t => (t.due ? Date.parse(t.due + 'T23:59:59') : Infinity);
  const overdue = open.filter(t => dueTs(t) < now);
  const elapsed = Math.max(1, (now - project.createdAt) / DAY), velocity = done.length / elapsed;
  const daysLeft = (Date.parse(project.deadline + 'T23:59:59') - now) / DAY;
  const needed = velocity > 0 ? open.length / velocity : null;
  let score = 0;
  if (open.length) {
    if (daysLeft < 0) score = 100;
    else if (needed === null) score = 70;
    else score = Math.min(100, (needed / Math.max(daysLeft, 0.5)) * 50);
    score = Math.min(100, Math.round(score + Math.min(overdue.length * 8, 25)));
  }
  const level = score < 35 ? 'Low' : score < 65 ? 'Medium' : 'High';
  const reasons = [];
  if (daysLeft < 0 && open.length) reasons.push('The deadline has passed with open tasks remaining.');
  if (needed !== null && needed > daysLeft && daysLeft >= 0) reasons.push(`At the current pace the remaining work needs about ${Math.ceil(needed)} days, but only ${Math.ceil(daysLeft)} remain.`);
  if (overdue.length) reasons.push(`${overdue.length} task${overdue.length > 1 ? 's are' : ' is'} overdue.`);
  if (!reasons.length) reasons.push(open.length ? 'The project is on pace to finish before the deadline.' : 'All tasks are complete.');
  const workload = db.users.map(u => {
    const mine = open.filter(t => t.assigneeId === u.id);
    return { id: u.id, name: u.name, openTasks: mine.length, hours: mine.reduce((s, t) => s + (t.estimate || 0), 0) };
  }).filter(w => w.openTasks);
  const w = { high: 30, medium: 20, low: 10 };
  const priorityQueue = open.map(t => {
    const d = (dueTs(t) - now) / DAY;
    const urgency = d < 0 ? 40 : d === Infinity ? 0 : Math.max(0, 30 - d * 3);
    return { id: t.id, title: t.title, status: t.status, due: t.due, aiScore: Math.round((w[t.priority] || 10) + urgency) };
  }).sort((a, b) => b.aiScore - a.aiScore).slice(0, 5);
  return { stats: { total: tasks.length, done: done.length, open: open.length, overdue: overdue.length,
    progress: tasks.length ? Math.round((done.length / tasks.length) * 100) : 0, daysLeft: Math.ceil(daysLeft),
    velocity: +velocity.toFixed(2) }, risk: { score, level, reasons }, workload, priorityQueue };
}
app.get('/api/projects/:id/analytics', auth, (req, res) => {
  const p = db.projects.find(x => x.id === req.params.id);
  if (!p) return res.status(404).json({ error: 'Project not found' });
  res.json({ ...analyse(p), activity: db.activity.slice(0, 8) });
});
app.post('/api/projects/:id/summary', auth, async (req, res) => {
  const p = db.projects.find(x => x.id === req.params.id);
  if (!p) return res.status(404).json({ error: 'Project not found' });
  const a = analyse(p);
  const fallback = `${p.name} is ${a.stats.progress}% complete (${a.stats.done} of ${a.stats.total} tasks). Delay risk is ${a.risk.level.toLowerCase()} (${a.risk.score}/100). ${a.risk.reasons.join(' ')} ` +
    (a.priorityQueue[0] ? `Focus next on "${a.priorityQueue[0].title}".` : '');
  if (!process.env.ANTHROPIC_API_KEY) return res.json({ summary: fallback, source: 'rules' });
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5', max_tokens: 400,
        messages: [{ role: 'user', content: `Write a concise weekly status report (under 120 words) for a project manager from this data:\n${JSON.stringify({ project: p.name, deadline: p.deadline, ...a })}` }] }) });
    const d = await r.json();
    res.json({ summary: d.content?.[0]?.text || fallback, source: d.content ? 'llm' : 'rules' });
  } catch { res.json({ summary: fallback, source: 'rules' }); }
});

app.listen(PORT, () => console.log(`TaskPilot AI running at http://localhost:${PORT}`));
