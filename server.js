import dotenv from 'dotenv';
import express from 'express';
import http from 'node:http';
import { Server as SocketIOServer } from 'socket.io';
import helmet from 'helmet';
import morgan from 'morgan';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import multer from 'multer';
import { fileURLToPath } from 'node:url';
import { MercadoPagoConfig, Preference, Payment } from 'mercadopago';
import admin from 'firebase-admin';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Carga explícita de variables. En Windows, el Bloc de notas a veces guarda `.env.txt`.
const envCandidates = [path.join(__dirname, '.env'), path.join(__dirname, '.env.txt')];
let loadedEnvFile = null;
for (const envPath of envCandidates) {
  try {
    const result = dotenv.config({ path: envPath, override: false });
    if (!result.error) { loadedEnvFile = path.basename(envPath); break; }
  } catch {}
}

const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server, { cors: { origin: true, credentials: true } });
const PORT = Number(process.env.PORT || 8000);
const PUBLIC_URL = String(process.env.PUBLIC_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
const JWT_SECRET = process.env.JWT_SECRET || 'frostland-local-dev-secret';
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'db.json');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');

app.set('trust proxy', 1);
app.get('/health', (_req, res) => res.json({ ok: true, service: 'frostland', time: new Date().toISOString() }));

app.use(helmet({ contentSecurityPolicy: false }));
app.use(morgan('dev'));
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '7d' }));

app.get('/api/config-status', (_req, res) => {
  res.json({
    mercadoPagoConfigured: Boolean(String(process.env.MP_ACCESS_TOKEN || '').trim()),
    publicKeyConfigured: Boolean(String(process.env.MP_PUBLIC_KEY || '').trim()),
    envFileLoaded: loadedEnvFile,
    publicUrl: PUBLIC_URL
  });
});


const uid = () => crypto.randomUUID();
const now = () => new Date().toISOString();
const money = n => Math.max(0, Math.round(Number(n) || 0));

const seed = {
  settings: {
    storeName: process.env.STORE_NAME || 'FROSTLAND',
    storeAddress: process.env.STORE_ADDRESS || 'Configurar dirección del local',
    storeLat: Number(process.env.STORE_LAT || -34.6037),
    storeLng: Number(process.env.STORE_LNG || -58.3816),
    whatsappNumber: process.env.WHATSAPP_NUMBER || '',
    instagramUrl: process.env.INSTAGRAM_URL || '',
    instagramHandle: process.env.INSTAGRAM_HANDLE || '@frostland',
    mapsUrl: process.env.MAPS_URL || '',
    pointsPerPeso: 0.01,
    pointValue: 10,
    maxPointsDiscountPercent: 50,
    welcomePoints: 100,
    deliveryFee: 2500,
    freeDeliveryFrom: 25000,
    minimumOrder: 5000,
    adminPin: '1234',
    storeStatusMode: 'auto',
    manualOpen: false,
    promoFlyer: { active: false, title: '', text: '', imageUrl: '', buttonText: '', buttonUrl: '', frequency: 'daily', startAt: '', endAt: '' },
    siteContent: {
      hero1Eyebrow: 'EL SABOR DE FROSTLAND',
      hero1Title: 'Momentos que se disfrutan cucharada a cucharada.',
      hero1Text: 'Armá tu combinación, elegí hasta 12 sabores y recibila donde estés.',
      hero1Button: 'Ver la carta',
      hero1Image: 'https://images.unsplash.com/photo-1567206563064-6f60f40a2b57?auto=format&fit=crop&w=1800&q=85',
      hero2Eyebrow: 'BENEFICIOS',
      hero2Title: 'Cada compra suma puntos.',
      hero2Text: 'Canjealos por descuentos en tus próximos pedidos.',
      hero2Button: 'Ver mis puntos',
      hero2Image: 'https://images.unsplash.com/photo-1570197788417-0e82375c9371?auto=format&fit=crop&w=1800&q=85',
      hero3Eyebrow: 'DELIVERY O RETIRO',
      hero3Title: 'Tu helado, a tu manera.',
      hero3Text: 'Pedí a domicilio con ubicación o retiralo por el local.',
      hero3Button: 'Hacer un pedido',
      hero3Image: 'https://images.unsplash.com/photo-1488900128323-21503983a07e?auto=format&fit=crop&w=1800&q=85',
      benefit1Title: 'Helado artesanal', benefit1Text: 'Sabores seleccionados',
      benefit2Title: 'Hasta 12 gustos', benefit2Text: 'Según el tamaño',
      benefit3Title: 'Programa de puntos', benefit3Text: 'Comprá y ahorrá',
      benefit4Title: 'Delivery rápido', benefit4Text: 'Seguimiento del pedido',
      featuredEyebrow: 'ELEGÍ TU FAVORITO', featuredTitle: 'Tamaños destacados', featuredButton: 'Ver toda la carta →',
      clubEyebrow: 'FROSTLAND CLUB', clubTitle: 'Más helado, más beneficios.', clubText: 'Ingresá a tu cuenta para consultar puntos, pedidos y hablar con el local.'
    },
    weeklyHours: {
      0: { enabled: true, open: '12:00', close: '23:30' },
      1: { enabled: true, open: '12:00', close: '23:30' },
      2: { enabled: true, open: '12:00', close: '23:30' },
      3: { enabled: true, open: '12:00', close: '23:30' },
      4: { enabled: true, open: '12:00', close: '23:30' },
      5: { enabled: true, open: '12:00', close: '00:30' },
      6: { enabled: true, open: '12:00', close: '00:30' }
    }
  },
  users: [],
  products: [],
  flavors: [],
  promotions: [
    { id: 'promo-bienvenida', title: 'Bienvenida', description: 'Registrate y empezá a sumar puntos.', active: true }
  ],
  orders: [],
  notifications: [],
  cashShifts: [],
  expenses: [],
  auditLog: [],
  promoCodes: [],
  passwordResets: []
};

let firestore = null;
async function initFirebase() {
  if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON) return;
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    firestore = admin.firestore();
    console.log('Firestore conectado');
  } catch (err) {
    console.error('No se pudo iniciar Firestore; se usará JSON local:', err.message);
  }
}

async function ensureDb() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  try { await fs.access(DATA_FILE); }
  catch { await fs.writeFile(DATA_FILE, JSON.stringify(seed, null, 2)); }
  const db = JSON.parse(await fs.readFile(DATA_FILE, 'utf8'));
  db.settings = { ...seed.settings, ...(db.settings || {}) };
  db.settings.siteContent = { ...seed.settings.siteContent, ...(db.settings.siteContent || {}) };
  db.products = (db.products || []).map(p => ({ active: true, imageUrl: '', description: '', unitsIncluded: 1, unitLabel: 'pote', flavorsPerUnit: Number(p.maxFlavors || 1), ...p }));
  db.flavors = (db.flavors || []).map(f => ({ bucketStock: Number(f.bucketStock ?? f.stock ?? 0), lowBucketsAt: Number(f.lowBucketsAt ?? f.lowStockAt ?? 1), active: true, ...f }));
  db.orders ||= [];
  db.users ||= [];
  db.cashShifts ||= [];
  db.expenses ||= [];
  db.auditLog ||= [];
  db.promoCodes ||= [];
  db.passwordResets ||= [];
  db.settings.promoFlyer = { ...seed.settings.promoFlyer, ...(db.settings.promoFlyer || {}) };
  const employeeSeeds = [
    { name: 'Nadia', email: String(process.env.EMPLOYEE_NADIA_EMAIL || 'nadia@frostland.local').toLowerCase(), password: process.env.EMPLOYEE_NADIA_PASSWORD || 'CambiarNadia2026!' },
    { name: 'Candela', email: String(process.env.EMPLOYEE_CANDELA_EMAIL || 'candela@frostland.local').toLowerCase(), password: process.env.EMPLOYEE_CANDELA_PASSWORD || 'CambiarCandela2026!' },
    { name: 'Daniela', email: String(process.env.EMPLOYEE_DANIELA_EMAIL || 'daniela@frostland.local').toLowerCase(), password: process.env.EMPLOYEE_DANIELA_PASSWORD || 'CambiarDaniela2026!' }
  ];
  for (const employee of employeeSeeds) {
    if (!db.users.some(u => u.email === employee.email)) {
      db.users.push({ id: uid(), name: employee.name, email: employee.email, phone: '', passwordHash: await bcrypt.hash(employee.password, 10), role: 'employee', points: 0, mustChangePassword: true, createdAt: now() });
    }
  }
  if (!db.users.some(u => u.role === 'admin')) {
    const adminEmail = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
    const adminPassword = String(process.env.ADMIN_PASSWORD || '');
    if (!adminEmail || adminPassword.length < 10) throw new Error('Configurá ADMIN_EMAIL y ADMIN_PASSWORD (mínimo 10 caracteres) en .env.');
    db.users.push({ id: uid(), name: process.env.ADMIN_NAME || 'Administración FROSTLAND', email: adminEmail, phone: '', passwordHash: await bcrypt.hash(adminPassword, 10), role: 'admin', points: 0, createdAt: now() });
    await fs.writeFile(DATA_FILE, JSON.stringify(db, null, 2));
  }
}

async function readDb() {
  if (firestore) {
    const snap = await firestore.doc('app/main').get();
    if (snap.exists) return snap.data();
    await firestore.doc('app/main').set(seed);
    return structuredClone(seed);
  }
  return JSON.parse(await fs.readFile(DATA_FILE, 'utf8'));
}
async function writeDb(db) {
  if (firestore) return firestore.doc('app/main').set(db);
  return fs.writeFile(DATA_FILE, JSON.stringify(db, null, 2));
}

function publicUser(u) { return { id: u.id, name: u.name, email: u.email, phone: u.phone, role: u.role, points: u.points || 0, active: u.active !== false, createdAt: u.createdAt || null }; }
function sign(u) { return jwt.sign({ sub: u.id, role: u.role }, JWT_SECRET, { expiresIn: '365d' }); }
async function auth(req, res, next) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Iniciá sesión.' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const db = await readDb();
    const user = db.users.find(u => u.id === payload.sub);
    if (!user) throw new Error('Usuario inexistente');
    req.user = user; req.db = db; next();
  } catch { res.status(401).json({ error: 'Sesión inválida.' }); }
}
const role = (...roles) => (req, res, next) => roles.includes(req.user.role) ? next() : res.status(403).json({ error: 'Sin permiso.' });

io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) throw new Error('Sin sesión');
    const payload = jwt.verify(token, JWT_SECRET);
    const db = await readDb();
    const user = db.users.find(u => u.id === payload.sub);
    if (!user) throw new Error('Usuario inexistente');
    socket.user = publicUser(user);
    next();
  } catch (err) { next(new Error('Sesión inválida')); }
});
io.on('connection', socket => {
  if (['admin','employee','courier'].includes(socket.user.role)) socket.join('staff');
  socket.on('chat:join', async ({ orderId }) => {
    const db = await readDb();
    const order = db.orders.find(o => o.id === orderId);
    if (!order) return socket.emit('chat:error', { message: 'Pedido inexistente.' });
    const allowed = ['admin','employee','courier'].includes(socket.user.role) || order.userId === socket.user.id;
    if (!allowed) return socket.emit('chat:error', { message: 'Sin acceso al chat.' });
    for (const room of socket.rooms) if (room.startsWith('order:')) socket.leave(room);
    socket.join(`order:${orderId}`);
    socket.emit('chat:joined', { orderId });
  });
});


function minutesOf(value) {
  const [h, m] = String(value || '00:00').split(':').map(Number);
  return (h * 60) + m;
}
function storeAvailability(settings, date = new Date()) {
  if (settings.storeStatusMode === 'manual') {
    return { isOpen: Boolean(settings.manualOpen), mode: 'manual', label: settings.manualOpen ? 'Abierto ahora' : 'Cerrado ahora' };
  }
  const day = date.getDay();
  const h = settings.weeklyHours?.[day];
  if (!h?.enabled) return { isOpen: false, mode: 'auto', label: 'Cerrado hoy' };
  const current = date.getHours() * 60 + date.getMinutes();
  const open = minutesOf(h.open), close = minutesOf(h.close);
  const isOpen = close > open ? current >= open && current < close : current >= open || current < close;
  return { isOpen, mode: 'auto', label: isOpen ? `Abierto hasta ${h.close}` : `Cerrado · abre ${h.open}`, today: h };
}

app.get('/api/bootstrap', async (_req, res) => {
  const db = await readDb();
  res.json({ settings: { ...db.settings, availability: storeAvailability(db.settings) }, products: db.products.filter(x => x.active).map(({ stock, lowStockAt, ...p }) => p), flavors: db.flavors.filter(x => x.active).map(f => ({ id: f.id, name: f.name, active: f.active, available: Number(f.bucketStock || 0) > 0 })), promotions: db.promotions.filter(x => x.active) });
});

app.post('/api/auth/register', async (req, res) => {
  const { name, email, phone, password } = req.body;
  if (!name || !email || !password || password.length < 6) return res.status(400).json({ error: 'Completá nombre, email y una contraseña de 6 caracteres o más.' });
  const db = await readDb();
  if (db.users.some(u => u.email.toLowerCase() === email.toLowerCase())) return res.status(409).json({ error: 'Ese email ya está registrado.' });
  const user = { id: uid(), name: name.trim(), email: email.trim().toLowerCase(), phone: String(phone || '').trim(), passwordHash: await bcrypt.hash(password, 10), role: 'customer', points: Math.max(0, Math.floor(Number(db.settings.welcomePoints) || 0)), createdAt: now() };
  db.users.push(user); await writeDb(db);
  res.status(201).json({ token: sign(user), user: publicUser(user) });
});
app.post('/api/auth/login', async (req, res) => {
  const db = await readDb();
  const user = db.users.find(u => u.email.toLowerCase() === String(req.body.email || '').toLowerCase());
  if (!user || !(await bcrypt.compare(String(req.body.password || ''), user.passwordHash))) return res.status(401).json({ error: 'Email o contraseña incorrectos.' });
  res.json({ token: sign(user), user: publicUser(user) });
});
async function sendResetEmail(to, resetUrl) {
  const key = String(process.env.RESEND_API_KEY || '').trim();
  const from = String(process.env.RESET_FROM_EMAIL || '').trim();
  if (!key || !from) return false;
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [to], subject: 'Restablecer contraseña de FROSTLAND', html: `<h2>FROSTLAND</h2><p>Recibimos una solicitud para cambiar tu contraseña.</p><p><a href="${resetUrl}">Restablecer contraseña</a></p><p>Este enlace vence en 30 minutos.</p>` })
  });
  return response.ok;
}
app.post('/api/auth/forgot-password', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const db = await readDb();
  const user = db.users.find(u => u.email === email && u.role === 'customer');
  if (user) {
    const token = crypto.randomBytes(32).toString('hex');
    db.passwordResets = (db.passwordResets || []).filter(r => r.userId !== user.id && new Date(r.expiresAt).getTime() > Date.now());
    db.passwordResets.push({ id: uid(), userId: user.id, tokenHash: crypto.createHash('sha256').update(token).digest('hex'), expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(), usedAt: null, createdAt: now() });
    await writeDb(db);
    const resetUrl = `${PUBLIC_URL}/?reset=${encodeURIComponent(token)}`;
    try { await sendResetEmail(user.email, resetUrl); } catch (err) { console.error('No se pudo enviar recuperación:', err.message); }
  }
  res.json({ ok: true, message: 'Si existe una cuenta con ese correo, recibirá instrucciones.' });
});
app.post('/api/auth/reset-password', async (req, res) => {
  const token = String(req.body.token || '');
  const password = String(req.body.password || '');
  if (password.length < 8) return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres.' });
  const db = await readDb();
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  const reset = (db.passwordResets || []).find(r => r.tokenHash === hash && !r.usedAt && new Date(r.expiresAt).getTime() > Date.now());
  if (!reset) return res.status(400).json({ error: 'El enlace es inválido o venció.' });
  const user = db.users.find(u => u.id === reset.userId);
  if (!user) return res.status(404).json({ error: 'Cuenta inexistente.' });
  user.passwordHash = await bcrypt.hash(password, 10);
  reset.usedAt = now();
  await writeDb(db);
  res.json({ ok: true });
});
app.get('/api/me', auth, (req, res) => res.json(publicUser(req.user)));
app.get('/api/my-orders', auth, (req, res) => res.json(req.db.orders.filter(o => o.userId === req.user.id).sort((a,b) => b.createdAt.localeCompare(a.createdAt))));

function calculateOrder(db, body, user) {
  const items = [];
  for (const raw of body.items || []) {
    const product = db.products.find(p => p.id === raw.productId && p.active);
    if (!product) throw new Error('Producto inválido.');
    const qty = Math.max(1, Math.min(20, Number(raw.qty) || 1));
    const unitsIncluded = Math.max(1, Math.min(20, Number(product.unitsIncluded) || 1));
    const flavorsPerUnit = Math.max(1, Math.min(12, Number(product.flavorsPerUnit || product.maxFlavors) || 1));
    const totalUnits = qty * unitsIncluded;
    let units = Array.isArray(raw.units) ? raw.units : [];
    // Compatibilidad con carritos anteriores.
    if (!units.length && Array.isArray(raw.flavorIds)) {
      units = Array.from({ length: totalUnits }, () => ({ flavorIds: raw.flavorIds }));
    }
    if (units.length !== totalUnits) throw new Error(`${product.name}: completá los sabores de cada ${product.unitLabel || 'unidad'}.`);
    const normalizedUnits = units.map((unit, index) => {
      const flavorIds = [...new Set(unit.flavorIds || [])];
      if (!flavorIds.length || flavorIds.length > flavorsPerUnit) throw new Error(`${product.name}, ${product.unitLabel || 'unidad'} ${index + 1}: elegí entre 1 y ${flavorsPerUnit} sabores.`);
      const flavors = flavorIds.map(id => db.flavors.find(f => f.id === id && f.active)).filter(Boolean);
      if (flavors.length !== flavorIds.length) throw new Error('Hay sabores inválidos o no disponibles.');
      const unavailable = flavors.find(f => Number(f.bucketStock || 0) <= 0);
      if (unavailable) throw new Error(`${unavailable.name} está agotado.`);
      return { index: index + 1, flavorIds, flavorNames: flavors.map(f => f.name) };
    });
    items.push({
      id: uid(), productId: product.id, productName: product.name, qty,
      unitPrice: product.price, subtotal: product.price * qty,
      unitsIncluded, unitLabel: product.unitLabel || 'unidad', flavorsPerUnit,
      units: normalizedUnits,
      flavorIds: [...new Set(normalizedUnits.flatMap(u => u.flavorIds))],
      flavorNames: [...new Set(normalizedUnits.flatMap(u => u.flavorNames))]
    });
  }
  if (!items.length) throw new Error('El carrito está vacío.');
  const subtotal = items.reduce((a, i) => a + i.subtotal, 0);
  const delivery = body.delivery || {};
  if (!['delivery','pickup'].includes(delivery.type)) throw new Error('Elegí delivery o retiro.');
  if (delivery.type === 'delivery' && (!delivery.street || !delivery.number || !delivery.city)) throw new Error('Completá calle, número y localidad.');
  const deliveryFee = delivery.type === 'delivery' && subtotal < db.settings.freeDeliveryFrom ? money(db.settings.deliveryFee) : 0;
  const orderBase = subtotal + deliveryFee;
  const pointValue = Math.max(1, money(db.settings.pointValue || 1));
  const maxDiscountPercent = Math.min(100, Math.max(0, Number(db.settings.maxPointsDiscountPercent ?? 50)));
  const maxDiscountAmount = Math.floor(orderBase * maxDiscountPercent / 100);
  const maxPointsByOrder = Math.floor(maxDiscountAmount / pointValue);
  const pointsRequested = Math.max(0, Math.floor(Number(body.pointsToRedeem) || 0));
  const pointsUsed = Math.min(pointsRequested, Math.max(0, Math.floor(user.points || 0)), maxPointsByOrder);
  const pointsDiscount = money(pointsUsed * pointValue);
  let promoDiscount = 0;
  let promoCode = null;
  const requestedPromo = String(body.promoCode || '').trim().toUpperCase();
  if (requestedPromo) {
    const promo = (db.promoCodes || []).find(p => p.code === requestedPromo && p.active !== false);
    if (!promo) throw new Error('Código promocional inválido.');
    const current = Date.now();
    if (promo.startAt && current < new Date(promo.startAt).getTime()) throw new Error('La promoción todavía no comenzó.');
    if (promo.endAt && current > new Date(promo.endAt).getTime()) throw new Error('El código promocional venció.');
    if (promo.maxUses && Number(promo.usedCount || 0) >= Number(promo.maxUses)) throw new Error('El código alcanzó el máximo de usos.');
    if (promo.oncePerCustomer && (promo.usedBy || []).includes(user.id)) throw new Error('Ya utilizaste este código.');
    if (subtotal < Number(promo.minimumOrder || 0)) throw new Error(`El código requiere una compra mínima de $${Number(promo.minimumOrder || 0).toLocaleString('es-AR')}.`);
    promoDiscount = promo.type === 'percent' ? money(orderBase * Math.min(100, Math.max(0, Number(promo.value || 0))) / 100) : money(promo.value || 0);
    promoDiscount = Math.min(promoDiscount, Math.max(0, orderBase - pointsDiscount));
    promoCode = promo.code;
  }
  const discount = pointsDiscount + promoDiscount;
  const total = Math.max(0, orderBase - discount);
  if (subtotal < db.settings.minimumOrder) throw new Error(`El pedido mínimo es $${db.settings.minimumOrder.toLocaleString('es-AR')}.`);
  const earnedPoints = Math.max(0, Math.floor(total * Math.max(0, Number(db.settings.pointsPerPeso) || 0)));
  return { items, subtotal, promoCode, promoDiscount, pointsDiscount, delivery: { type: delivery.type, street: delivery.street || '', number: delivery.number || '', city: delivery.city || '', floor: delivery.floor || '', notes: delivery.notes || '', lat: Number(delivery.lat) || null, lng: Number(delivery.lng) || null, mapsUrl: delivery.mapsUrl || '' }, deliveryFee, pointsUsed, discount, total, earnedPoints };
}

function restoreOrderResources(db, order, { restoreInventory = true, restorePoints = true } = {}) {
  if (restoreInventory && order.inventoryDeducted && !order.inventoryRestored) {
    for (const item of order.items || []) {
    }
    order.inventoryRestored = true;
  }
  if (restorePoints) {
    const user = db.users.find(u => u.id === order.userId);
    if (order.pointsUsed > 0 && !order.redeemedPointsRestored) {
      if (user) user.points = Number(user.points || 0) + Number(order.pointsUsed || 0);
      order.redeemedPointsRestored = true;
    }
    if (order.pointsCredited && order.earnedPoints > 0 && !order.earnedPointsReversed) {
      if (user) user.points = Math.max(0, Number(user.points || 0) - Number(order.earnedPoints || 0));
      order.earnedPointsReversed = true;
      order.pointsCredited = false;
    }
  }
}

app.post('/api/orders', auth, async (req, res) => {
  try {
    const availability = storeAvailability(req.db.settings);
    if (!availability.isOpen) throw new Error('El local está cerrado en este momento. Podés revisar los horarios y volver a pedir cuando abra.');
    const paymentMethod = req.body.paymentMethod;
    if (!['cash','mercadopago','qr','transfer'].includes(paymentMethod)) throw new Error('Medio de pago inválido.');
    const calc = calculateOrder(req.db, req.body, req.user);
    const order = { id: uid(), code: `FR-${Date.now().toString().slice(-7)}`, userId: req.user.id, customer: publicUser(req.user), ...calc, paymentMethod, paymentStatus: paymentMethod === 'cash' ? 'pending_cash' : 'pending', status: 'received', createdAt: now(), updatedAt: now() };
    req.db.orders.push(order);
    if (calc.promoCode) { const promo = (req.db.promoCodes || []).find(p => p.code === calc.promoCode); if (promo) { promo.usedCount = Number(promo.usedCount || 0) + 1; promo.usedBy ||= []; if (!promo.usedBy.includes(req.user.id)) promo.usedBy.push(req.user.id); } }
    req.user.points = Math.max(0, (req.user.points || 0) - calc.pointsUsed);
    order.inventoryDeducted = false;
    await writeDb(req.db);
    io.to('staff').emit('admin:new-order', { order: { id: order.id, code: order.code, total: order.total, paymentMethod: order.paymentMethod, createdAt: order.createdAt } });

    if (paymentMethod === 'mercadopago') {
      const mpAccessToken = String(process.env.MP_ACCESS_TOKEN || '').trim();
      if (!mpAccessToken) return res.status(201).json({ order, warning: 'Mercado Pago todavía no tiene credenciales configuradas en MP_ACCESS_TOKEN.' });
      const client = new MercadoPagoConfig({ accessToken: mpAccessToken });
      const preference = new Preference(client);
      const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
      const inferredOrigin = `${forwardedProto || req.protocol}://${req.get('host')}`.replace(/\/$/, '');
      const checkoutBaseUrl = /^https:\/\//i.test(PUBLIC_URL) ? PUBLIC_URL : inferredOrigin;
      const isHttpsPublicUrl = /^https:\/\//i.test(checkoutBaseUrl);
      const preferenceBody = {
        items: [{ id: order.id, title: `Pedido ${order.code} - FROSTLAND`, quantity: 1, unit_price: order.total, currency_id: 'ARS' }],
        external_reference: order.id,
        metadata: { order_id: order.id }
      };
      // Mercado Pago solo acepta retorno automático con URLs públicas HTTPS.
      // En localhost se crea el checkout sin back_urls ni auto_return.
      if (isHttpsPublicUrl) {
        preferenceBody.back_urls = {
          success: `${checkoutBaseUrl}/?payment=success&order=${order.id}`,
          pending: `${checkoutBaseUrl}/?payment=pending&order=${order.id}`,
          failure: `${checkoutBaseUrl}/?payment=failure&order=${order.id}`
        };
        preferenceBody.auto_return = 'approved';
        preferenceBody.notification_url = `${checkoutBaseUrl}/api/mercadopago/webhook`;
      }
      try {
        const result = await preference.create({ body: preferenceBody });
        order.mpPreferenceId = result.id; order.mpInitPoint = result.init_point; order.updatedAt = now(); await writeDb(req.db);
        return res.status(201).json({ order, checkoutUrl: result.init_point });
      } catch (mpError) {
        restoreOrderResources(req.db, order);
        req.db.orders = req.db.orders.filter(o => o.id !== order.id);
        await writeDb(req.db);
        throw new Error(`No se pudo iniciar Mercado Pago: ${mpError.message}`);
      }
    }
    res.status(201).json({ order });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

app.post('/api/mercadopago/webhook', async (req, res) => {
  res.sendStatus(200);
  try {
    const paymentId = req.query['data.id'] || req.body?.data?.id;
    const mpAccessToken = String(process.env.MP_ACCESS_TOKEN || '').trim();
    if (!paymentId || !mpAccessToken) return;
    const client = new MercadoPagoConfig({ accessToken: mpAccessToken });
    const payment = await new Payment(client).get({ id: paymentId });
    const orderId = payment.external_reference || payment.metadata?.order_id;
    const db = await readDb(); const order = db.orders.find(o => o.id === orderId);
    if (!order) return;
    order.paymentStatus = payment.status; order.mpPaymentId = String(payment.id); order.updatedAt = now();
    if (payment.status === 'approved' && !order.pointsCredited) {
      const user = db.users.find(u => u.id === order.userId);
      if (user) user.points = (user.points || 0) + order.earnedPoints;
      order.pointsCredited = true;
    } else if (['rejected','cancelled'].includes(payment.status)) {
      restoreOrderResources(db, order);
      order.status = 'cancelled';
    }
    await writeDb(db);
  } catch (err) { console.error('Webhook MP:', err.message); }
});


app.get('/api/orders/:id/messages', auth, (req, res) => {
  const order = req.db.orders.find(o => o.id === req.params.id);
  if (!order) return res.status(404).json({ error: 'Pedido no encontrado.' });
  if (!['admin','employee','courier'].includes(req.user.role) && order.userId !== req.user.id) return res.status(403).json({ error: 'No tenés acceso a este chat.' });
  res.json(order.messages || []);
});
app.post('/api/orders/:id/messages', auth, async (req, res) => {
  const order = req.db.orders.find(o => o.id === req.params.id);
  if (!order) return res.status(404).json({ error: 'Pedido no encontrado.' });
  if (!['admin','employee','courier'].includes(req.user.role) && order.userId !== req.user.id) return res.status(403).json({ error: 'No tenés acceso a este chat.' });
  const text = String(req.body.text || '').trim().slice(0, 500);
  if (!text) return res.status(400).json({ error: 'Escribí un mensaje.' });
  order.messages ||= [];
  const message = { id: uid(), userId: req.user.id, senderName: ['admin','employee'].includes(req.user.role) ? `FROSTLAND · ${req.user.name}` : req.user.name, senderRole: req.user.role, text, createdAt: now() };
  order.messages.push(message); order.updatedAt = now(); await writeDb(req.db); io.to(`order:${order.id}`).emit('chat:message', { orderId: order.id, message }); res.status(201).json(message);
});


const imageUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${path.extname(file.originalname).toLowerCase()}`)
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, /^image\/(jpeg|png|webp|gif)$/i.test(file.mimetype))
});
app.post('/api/admin/upload-image', auth, role('admin'), (req, res) => {
  imageUpload.single('image')(req, res, err => {
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'La imagen supera el máximo de 5 MB.' });
    }
    if (err) return res.status(400).json({ error: 'No se pudo subir la imagen. Usá JPG, PNG, WEBP o GIF.' });
    if (!req.file) return res.status(400).json({ error: 'Elegí una imagen JPG, PNG, WEBP o GIF de hasta 5 MB.' });
    return res.status(201).json({ imageUrl: `/uploads/${req.file.filename}` });
  });
});

app.get('/api/admin/dashboard', auth, role('admin','employee'), (req, res) => {
  const orders = req.db.orders;
  const paid = orders.filter(o => o.paymentStatus === 'approved' || o.paymentMethod === 'cash');
  res.json({ totals: { orders: orders.length, sales: paid.reduce((a,o)=>a+o.total,0), customers: req.db.users.filter(u=>u.role==='customer').length, pending: orders.filter(o=>!['delivered','cancelled'].includes(o.status)).length }, orders: orders.slice().sort((a,b)=>b.createdAt.localeCompare(a.createdAt)), users: req.db.users.map(publicUser), products: req.db.products, flavors: req.db.flavors, settings: req.db.settings, activeShift: req.db.cashShifts.find(s=>!s.closedAt)||null, shifts: req.db.cashShifts.slice().sort((a,b)=>b.openedAt.localeCompare(a.openedAt)).slice(0,30), expenses: req.db.expenses.slice().sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,100), promoCodes: req.db.promoCodes || [], auditLog: (req.db.auditLog || []).slice().sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,200) });
});
app.put('/api/admin/orders/:id', auth, role('admin','employee','courier'), async (req, res) => {
  const order = req.db.orders.find(o => o.id === req.params.id); if (!order) return res.status(404).json({ error: 'Pedido no encontrado.' });
  const allowed = ['received','confirmed','preparing','ready','on_the_way','delivered','cancelled'];
  if (!allowed.includes(req.body.status)) return res.status(400).json({ error: 'Estado inválido.' });
  const previousStatus = order.status;
  order.status = req.body.status; order.updatedAt = now();
  if (order.status === 'cancelled' && previousStatus !== 'cancelled') restoreOrderResources(req.db, order);
  if (order.status === 'delivered' && order.paymentMethod === 'cash' && !order.pointsCredited) {
    const user = req.db.users.find(u => u.id === order.userId); if (user) user.points = (user.points || 0) + order.earnedPoints;
    order.pointsCredited = true; order.paymentStatus = 'approved';
  }
  await writeDb(req.db); io.to(`order:${order.id}`).emit('order:status', { orderId: order.id, status: order.status, updatedAt: order.updatedAt }); res.json(order);
});

app.put('/api/admin/orders/:id/payment', auth, role('admin','employee'), async (req, res) => {
  const order = req.db.orders.find(o => o.id === req.params.id);
  if (!order) return res.status(404).json({ error: 'Pedido no encontrado.' });
  const allowed = ['pending','pending_cash','approved','rejected','cancelled','refunded'];
  const paymentStatus = String(req.body.paymentStatus || '');
  if (!allowed.includes(paymentStatus)) return res.status(400).json({ error: 'Estado de pago inválido.' });
  order.paymentStatus = paymentStatus;
  order.updatedAt = now();
  if (paymentStatus === 'approved' && !order.pointsCredited) {
    const user = req.db.users.find(u => u.id === order.userId);
    if (user) user.points = (user.points || 0) + (order.earnedPoints || 0);
    order.pointsCredited = true;
  }
  await writeDb(req.db);
  io.to(`order:${order.id}`).emit('order:status', { orderId: order.id, status: order.status, paymentStatus: order.paymentStatus, updatedAt: order.updatedAt });
  res.json(order);
});

app.put('/api/admin/settings', auth, role('admin'), async (req, res) => {
  const body = req.body || {};
  req.db.settings = { ...req.db.settings, ...body, adminPin: req.db.settings.adminPin };
  if (body.weeklyHours && typeof body.weeklyHours === 'object') req.db.settings.weeklyHours = body.weeklyHours;
  if (body.siteContent && typeof body.siteContent === 'object') req.db.settings.siteContent = { ...seed.settings.siteContent, ...(req.db.settings.siteContent || {}), ...body.siteContent };
  for (const key of ['deliveryFee','freeDeliveryFrom','minimumOrder','pointValue','welcomePoints']) req.db.settings[key] = Math.max(0, money(req.db.settings[key]));
  req.db.settings.pointsPerPeso = Math.max(0, Number(req.db.settings.pointsPerPeso) || 0);
  req.db.settings.maxPointsDiscountPercent = Math.min(100, Math.max(0, Number(req.db.settings.maxPointsDiscountPercent ?? 50)));
  if (!['auto','manual'].includes(req.db.settings.storeStatusMode)) req.db.settings.storeStatusMode = 'auto';
  await writeDb(req.db);
  res.json({ ...req.db.settings, availability: storeAvailability(req.db.settings) });
});

function audit(db, user, action, details = {}) {
  db.auditLog ||= [];
  db.promoCodes ||= [];
  db.passwordResets ||= [];
  db.auditLog.push({ id: uid(), userId: user.id, userName: user.name, action, details, createdAt: now() });
  if (db.auditLog.length > 2000) db.auditLog = db.auditLog.slice(-2000);
}
function shiftTotals(db, shift) {
  const start = new Date(shift.openedAt).getTime();
  const end = shift.closedAt ? new Date(shift.closedAt).getTime() : Date.now();
  const orders = db.orders.filter(o => { const t = new Date(o.createdAt).getTime(); return t >= start && t <= end && o.status !== 'cancelled' && (o.paymentStatus === 'approved' || ['cash','qr','transfer'].includes(o.paymentMethod)); });
  const byMethod = { cash: 0, mercadopago: 0, qr: 0, transfer: 0 };
  for (const o of orders) byMethod[o.paymentMethod] = (byMethod[o.paymentMethod] || 0) + Number(o.total || 0);
  const expenses = db.expenses.filter(e => e.shiftId === shift.id);
  const expenseByMethod = { cash: 0, mercadopago: 0, qr: 0, transfer: 0 };
  for (const e of expenses) expenseByMethod[e.paymentMethod] = (expenseByMethod[e.paymentMethod] || 0) + Number(e.amount || 0);
  const totalSales = Object.values(byMethod).reduce((a,b)=>a+b,0);
  const totalExpenses = expenses.reduce((a,e)=>a+Number(e.amount||0),0);
  const expectedCash = Number(shift.openingCash || 0) + byMethod.cash - expenseByMethod.cash;
  return { ordersCount: orders.length, byMethod, expenses, expenseByMethod, totalSales, totalExpenses, netTotal: totalSales-totalExpenses, expectedCash };
}
async function mercadoPagoRefund(order) {
  if (!order.mpPaymentId) return { status: 'not_applicable', detail: 'El pedido no tiene ID de pago de Mercado Pago.' };
  const token = String(process.env.MP_ACCESS_TOKEN || '').trim();
  if (!token) return { status: 'failed', detail: 'Falta MP_ACCESS_TOKEN.' };
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Idempotency-Key': `frostland-refund-${order.id}` };
  const approved = order.paymentStatus === 'approved';
  const url = approved ? `https://api.mercadopago.com/v1/payments/${order.mpPaymentId}/refunds` : `https://api.mercadopago.com/v1/payments/${order.mpPaymentId}`;
  const response = await fetch(url, { method: approved ? 'POST' : 'PUT', headers, body: approved ? '{}' : JSON.stringify({ status: 'cancelled' }) });
  const data = await response.json().catch(()=>({}));
  if (!response.ok) return { status: 'failed', detail: data.message || data.error || `Mercado Pago respondió ${response.status}` };
  return { status: approved ? 'requested' : 'cancelled', detail: data.status || 'ok', mpResponseId: data.id || null };
}

app.post('/api/admin/orders/:id/accept', auth, role('admin','employee'), async (req,res)=>{
  const order=req.db.orders.find(o=>o.id===req.params.id); if(!order)return res.status(404).json({error:'Pedido no encontrado.'});
  if(order.status==='cancelled')return res.status(400).json({error:'El pedido está cancelado.'});
  if(order.status==='received') order.status='confirmed';
  order.acceptedBy={id:req.user.id,name:req.user.name}; order.acceptedAt=now(); order.updatedAt=now();
  audit(req.db,req.user,'order.accept',{orderId:order.id,code:order.code}); await writeDb(req.db);
  io.to(`order:${order.id}`).emit('order:status',{orderId:order.id,status:order.status,acceptedBy:order.acceptedBy,updatedAt:order.updatedAt});
  res.json(order);
});
app.post('/api/admin/orders/:id/cancel', auth, role('admin','employee'), async (req,res)=>{
  const order=req.db.orders.find(o=>o.id===req.params.id); if(!order)return res.status(404).json({error:'Pedido no encontrado.'});
  if(order.status==='cancelled')return res.json(order);
  const reason=String(req.body.reason||'Cancelado por el local').trim().slice(0,300);
  let refund={status:'not_applicable',detail:'Sin cobro online'};
  if(order.paymentMethod==='mercadopago') { try { refund=await mercadoPagoRefund(order); } catch(e){ refund={status:'failed',detail:e.message}; } }
  order.status='cancelled'; order.cancelReason=reason; order.cancelledBy={id:req.user.id,name:req.user.name}; order.cancelledAt=now(); order.refund=refund; order.paymentStatus=refund.status==='requested'?'refund_pending':refund.status==='cancelled'?'cancelled':order.paymentStatus; order.updatedAt=now();
  restoreOrderResources(req.db,order); audit(req.db,req.user,'order.cancel',{orderId:order.id,code:order.code,reason,refund}); await writeDb(req.db);
  io.to(`order:${order.id}`).emit('order:status',{orderId:order.id,status:order.status,refund:order.refund,updatedAt:order.updatedAt}); res.json(order);
});
app.post('/api/admin/shifts/open', auth, role('admin','employee'), async (req,res)=>{
  if(req.db.cashShifts.some(s=>!s.closedAt))return res.status(400).json({error:'Ya hay una caja abierta.'});
  const allowedNames=['Nadia','Candela','Daniela']; const requestedName=String(req.body.employeeName||req.user.name).trim(); const employeeName=allowedNames.includes(requestedName)?requestedName:req.user.name; const shift={id:uid(),employeeId:req.user.id,employeeName,openingCash:money(req.body.openingCash),openedAt:now(),closedAt:null}; req.db.cashShifts.push(shift); audit(req.db,req.user,'cash.open',{shiftId:shift.id,openingCash:shift.openingCash}); await writeDb(req.db); res.status(201).json(shift);
});
app.post('/api/admin/shifts/:id/close', auth, role('admin','employee'), async (req,res)=>{
  const shift=req.db.cashShifts.find(s=>s.id===req.params.id); if(!shift)return res.status(404).json({error:'Turno inexistente.'}); if(shift.closedAt)return res.status(400).json({error:'La caja ya está cerrada.'});
  if(req.user.role!=='admin'&&shift.employeeId!==req.user.id)return res.status(403).json({error:'Solo podés cerrar tu propio turno.'});
  const totals=shiftTotals(req.db,shift); shift.countedCash=money(req.body.countedCash); shift.closedAt=now(); shift.closedBy={id:req.user.id,name:req.user.name}; shift.totals=totals; shift.cashDifference=shift.countedCash-totals.expectedCash; audit(req.db,req.user,'cash.close',{shiftId:shift.id,cashDifference:shift.cashDifference}); await writeDb(req.db); res.json(shift);
});
app.post('/api/admin/expenses', auth, role('admin','employee'), async (req,res)=>{
  const shift=req.db.cashShifts.find(s=>!s.closedAt); if(!shift)return res.status(400).json({error:'Abrí la caja antes de registrar gastos.'});
  const paymentMethod=String(req.body.paymentMethod||'cash'); if(!['cash','mercadopago','qr','transfer'].includes(paymentMethod))return res.status(400).json({error:'Forma de pago inválida.'});
  const expense={id:uid(),shiftId:shift.id,amount:money(req.body.amount),category:String(req.body.category||'Otros').slice(0,80),description:String(req.body.description||'').slice(0,300),supplier:String(req.body.supplier||'').slice(0,120),paymentMethod,createdBy:{id:req.user.id,name:req.user.name},createdAt:now()}; if(!expense.amount)return res.status(400).json({error:'Ingresá un monto.'}); req.db.expenses.push(expense); audit(req.db,req.user,'expense.create',{expenseId:expense.id,amount:expense.amount}); await writeDb(req.db); res.status(201).json(expense);
});
app.put('/api/admin/flyer', auth, role('admin','employee'), async (req,res)=>{
  req.db.settings.promoFlyer={...seed.settings.promoFlyer,...req.db.settings.promoFlyer,...req.body,active:Boolean(req.body.active)}; audit(req.db,req.user,'flyer.update',{}); await writeDb(req.db); res.json(req.db.settings.promoFlyer);
});
app.get('/api/admin/shifts/:id/summary', auth, role('admin','employee'), (req,res)=>{const shift=req.db.cashShifts.find(s=>s.id===req.params.id);if(!shift)return res.status(404).json({error:'Turno inexistente.'});res.json({...shift,totals:shift.totals||shiftTotals(req.db,shift)});});

app.post('/api/admin/products', auth, role('admin'), async (req,res)=>{ const maxFlavors=Math.max(1,Number(req.body.maxFlavors)||1); const p={id:uid(),name:req.body.name,price:money(req.body.price),maxFlavors,unitsIncluded:Math.max(1,Number(req.body.unitsIncluded)||1),unitLabel:String(req.body.unitLabel||'pote').trim()||'pote',flavorsPerUnit:Math.max(1,Number(req.body.flavorsPerUnit)||maxFlavors),active:true,imageUrl:String(req.body.imageUrl||'').trim(),description:String(req.body.description||'').trim()}; req.db.products.push(p); await writeDb(req.db); res.status(201).json(p); });
app.delete('/api/admin/products/:id', auth, role('admin'), async (req,res)=>{ const i=req.db.products.findIndex(x=>x.id===req.params.id); if(i<0)return res.status(404).json({error:'No encontrado'}); req.db.products.splice(i,1); await writeDb(req.db); res.sendStatus(204); });
app.put('/api/admin/products/:id', auth, role('admin'), async (req,res)=>{ const p=req.db.products.find(x=>x.id===req.params.id); if(!p)return res.status(404).json({error:'No encontrado'}); Object.assign(p,{name:req.body.name??p.name,price:req.body.price===undefined?p.price:money(req.body.price),maxFlavors:req.body.maxFlavors===undefined?p.maxFlavors:Math.max(1,Number(req.body.maxFlavors)),unitsIncluded:req.body.unitsIncluded===undefined?p.unitsIncluded:Math.max(1,Number(req.body.unitsIncluded)),unitLabel:req.body.unitLabel===undefined?p.unitLabel:String(req.body.unitLabel||'unidad').trim()||'unidad',flavorsPerUnit:req.body.flavorsPerUnit===undefined?p.flavorsPerUnit:Math.max(1,Number(req.body.flavorsPerUnit)),active:req.body.active===undefined?p.active:Boolean(req.body.active),imageUrl:req.body.imageUrl===undefined?p.imageUrl:String(req.body.imageUrl||'').trim(),description:req.body.description===undefined?p.description:String(req.body.description||'').trim()}); await writeDb(req.db); res.json(p); });
app.post('/api/admin/flavors', auth, role('admin'), async (req,res)=>{ const f={id:uid(),name:req.body.name,bucketStock:Math.max(0,Number(req.body.bucketStock)||0),lowBucketsAt:Math.max(0,Number(req.body.lowBucketsAt)||1),active:true}; req.db.flavors.push(f); await writeDb(req.db); res.status(201).json(f); });
app.delete('/api/admin/flavors/:id', auth, role('admin'), async (req,res)=>{ const i=req.db.flavors.findIndex(x=>x.id===req.params.id); if(i<0)return res.status(404).json({error:'No encontrado'}); req.db.flavors.splice(i,1); await writeDb(req.db); res.sendStatus(204); });
app.put('/api/admin/flavors/:id', auth, role('admin'), async (req,res)=>{ const f=req.db.flavors.find(x=>x.id===req.params.id); if(!f)return res.status(404).json({error:'No encontrado'}); Object.assign(f,{name:req.body.name??f.name,bucketStock:req.body.bucketStock===undefined?f.bucketStock:Math.max(0,Number(req.body.bucketStock)),lowBucketsAt:req.body.lowBucketsAt===undefined?f.lowBucketsAt:Math.max(0,Number(req.body.lowBucketsAt)),active:req.body.active===undefined?f.active:Boolean(req.body.active)}); await writeDb(req.db); res.json(f); });

app.post('/api/admin/inventory/flavor/:id/adjust', auth, role('admin'), async (req, res) => {
  const item = req.db.flavors.find(x => x.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Sabor no encontrado.' });
  const delta = Math.trunc(Number(req.body.delta));
  if (!Number.isFinite(delta) || delta === 0) return res.status(400).json({ error: 'Ingresá un ajuste distinto de cero.' });
  item.bucketStock = Math.max(0, Number(item.bucketStock || 0) + delta);
  item.updatedAt = now();
  audit(req.db, req.user, 'inventory.adjust', { flavorId: item.id, flavorName: item.name, delta, newStock: item.bucketStock, reason: String(req.body.reason || '').slice(0,160) });
  await writeDb(req.db);
  res.json(item);
});

app.get('/api/promos/validate/:code', auth, (req,res)=>{
  const code=String(req.params.code||'').trim().toUpperCase();
  const p=(req.db.promoCodes||[]).find(x=>x.code===code&&x.active!==false);
  if(!p)return res.status(404).json({error:'Código inválido.'});
  const t=Date.now(); if(p.startAt&&t<new Date(p.startAt).getTime())return res.status(400).json({error:'La promoción todavía no comenzó.'});
  if(p.endAt&&t>new Date(p.endAt).getTime())return res.status(400).json({error:'El código venció.'});
  if(p.maxUses&&Number(p.usedCount||0)>=Number(p.maxUses))return res.status(400).json({error:'El código alcanzó el máximo de usos.'});
  if(p.oncePerCustomer&&(p.usedBy||[]).includes(req.user.id))return res.status(400).json({error:'Ya usaste este código.'});
  res.json({code:p.code,type:p.type,value:p.value,minimumOrder:p.minimumOrder||0,description:p.description||''});
});
app.post('/api/admin/promos', auth, role('admin'), async (req,res)=>{
  const code=String(req.body.code||'').trim().toUpperCase().replace(/[^A-Z0-9_-]/g,'');
  if(code.length<3)return res.status(400).json({error:'El código debe tener al menos 3 caracteres.'});
  if((req.db.promoCodes||[]).some(p=>p.code===code))return res.status(409).json({error:'Ese código ya existe.'});
  const p={id:uid(),code,description:String(req.body.description||'').slice(0,200),type:req.body.type==='fixed'?'fixed':'percent',value:Math.max(0,Number(req.body.value)||0),minimumOrder:money(req.body.minimumOrder),maxUses:Math.max(0,Math.floor(Number(req.body.maxUses)||0)),usedCount:0,usedBy:[],oncePerCustomer:Boolean(req.body.oncePerCustomer),startAt:req.body.startAt||'',endAt:req.body.endAt||'',active:req.body.active!==false,createdAt:now()};
  req.db.promoCodes||=[];req.db.promoCodes.push(p);audit(req.db,req.user,'promo.create',{code});await writeDb(req.db);res.status(201).json(p);
});
app.put('/api/admin/promos/:id', auth, role('admin'), async (req,res)=>{
  const p=(req.db.promoCodes||[]).find(x=>x.id===req.params.id);if(!p)return res.status(404).json({error:'Promoción inexistente.'});
  Object.assign(p,{description:req.body.description===undefined?p.description:String(req.body.description||'').slice(0,200),type:req.body.type===undefined?p.type:(req.body.type==='fixed'?'fixed':'percent'),value:req.body.value===undefined?p.value:Math.max(0,Number(req.body.value)||0),minimumOrder:req.body.minimumOrder===undefined?p.minimumOrder:money(req.body.minimumOrder),maxUses:req.body.maxUses===undefined?p.maxUses:Math.max(0,Math.floor(Number(req.body.maxUses)||0)),oncePerCustomer:req.body.oncePerCustomer===undefined?p.oncePerCustomer:Boolean(req.body.oncePerCustomer),startAt:req.body.startAt===undefined?p.startAt:req.body.startAt,endAt:req.body.endAt===undefined?p.endAt:req.body.endAt,active:req.body.active===undefined?p.active:Boolean(req.body.active)});audit(req.db,req.user,'promo.update',{code:p.code});await writeDb(req.db);res.json(p);
});
app.delete('/api/admin/promos/:id', auth, role('admin'), async (req,res)=>{const i=(req.db.promoCodes||[]).findIndex(x=>x.id===req.params.id);if(i<0)return res.status(404).json({error:'Promoción inexistente.'});const [p]=req.db.promoCodes.splice(i,1);audit(req.db,req.user,'promo.delete',{code:p.code});await writeDb(req.db);res.sendStatus(204);});
app.get('/api/admin/customers', auth, role('admin','employee'), (req,res)=>{
  const customers=req.db.users.filter(u=>u.role==='customer').map(u=>{const orders=req.db.orders.filter(o=>o.userId===u.id);const valid=orders.filter(o=>o.status!=='cancelled');return {...publicUser(u),ordersCount:orders.length,totalSpent:valid.reduce((a,o)=>a+Number(o.total||0),0),lastOrderAt:orders.sort((a,b)=>b.createdAt.localeCompare(a.createdAt))[0]?.createdAt||null};}).sort((a,b)=>b.totalSpent-a.totalSpent);res.json(customers);
});
app.put('/api/admin/customers/:id', auth, role('admin'), async (req,res)=>{const u=req.db.users.find(x=>x.id===req.params.id&&x.role==='customer');if(!u)return res.status(404).json({error:'Cliente inexistente.'});if(req.body.points!==undefined)u.points=Math.max(0,Math.floor(Number(req.body.points)||0));if(req.body.active!==undefined)u.active=Boolean(req.body.active);if(req.body.phone!==undefined)u.phone=String(req.body.phone||'').slice(0,60);audit(req.db,req.user,'customer.update',{customerId:u.id});await writeDb(req.db);res.json(publicUser(u));});
app.post('/api/admin/customers/:id/temp-password', auth, role('admin'), async (req,res)=>{const u=req.db.users.find(x=>x.id===req.params.id&&x.role==='customer');if(!u)return res.status(404).json({error:'Cliente inexistente.'});const password=crypto.randomBytes(5).toString('base64url');u.passwordHash=await bcrypt.hash(password,10);u.mustChangePassword=true;audit(req.db,req.user,'customer.temp_password',{customerId:u.id});await writeDb(req.db);res.json({temporaryPassword:password});});
app.get('/api/admin/finance-summary', auth, role('admin','employee'), (req,res)=>{const from=req.query.from?new Date(req.query.from).getTime():0;const to=req.query.to?new Date(req.query.to).getTime()+86400000:Date.now()+86400000;const orders=req.db.orders.filter(o=>{const t=new Date(o.createdAt).getTime();return t>=from&&t<to&&o.status!=='cancelled'&&(o.paymentStatus==='approved'||['cash','qr','transfer'].includes(o.paymentMethod));});const expenses=req.db.expenses.filter(e=>{const t=new Date(e.createdAt).getTime();return t>=from&&t<to;});const byMethod={cash:0,mercadopago:0,qr:0,transfer:0};orders.forEach(o=>byMethod[o.paymentMethod]=(byMethod[o.paymentMethod]||0)+Number(o.total||0));const totalSales=Object.values(byMethod).reduce((a,b)=>a+b,0);const totalExpenses=expenses.reduce((a,e)=>a+Number(e.amount||0),0);res.json({ordersCount:orders.length,byMethod,totalSales,totalExpenses,net:totalSales-totalExpenses,expenses});});
app.post('/api/admin/users', auth, role('admin'), async (req,res)=>{ if(!['admin','employee','courier'].includes(req.body.role))return res.status(400).json({error:'Rol inválido'}); const u={id:uid(),name:req.body.name,email:req.body.email.toLowerCase(),phone:req.body.phone||'',passwordHash:await bcrypt.hash(req.body.password||'frostland123',10),role:req.body.role,points:0,createdAt:now()}; req.db.users.push(u); await writeDb(req.db); res.status(201).json(publicUser(u)); });

app.get('/{*splat}', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

await initFirebase();
await ensureDb();
server.listen(PORT, '0.0.0.0', () => {
  console.log(`FROSTLAND funcionando en ${PUBLIC_URL}`);
  console.log(`Archivo de configuración: ${loadedEnvFile || 'NO ENCONTRADO (.env o .env.txt)'}`);
  console.log(`Mercado Pago: ${String(process.env.MP_ACCESS_TOKEN || '').trim() ? 'CONFIGURADO' : 'SIN CREDENCIALES'}`);
  if (!/^https:\/\//i.test(PUBLIC_URL)) console.log('Mercado Pago: retorno automático desactivado en localhost; el checkout igualmente puede abrirse.');
});
