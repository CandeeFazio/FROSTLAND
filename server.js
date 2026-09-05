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
import tls from 'node:tls';
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
app.get('/health', (_req, res) => res.json({ ok: true, service: 'carniceria-pro', time: new Date().toISOString() }));

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
    publicUrl: PUBLIC_URL,
    gmailConfigured: Boolean(String(process.env.GMAIL_USER||'').trim() && String(process.env.GMAIL_APP_PASSWORD||'').trim())
  });
});


const uid = () => crypto.randomUUID();
const now = () => new Date().toISOString();
const money = n => Math.max(0, Math.round(Number(n) || 0));

const seed = {
  settings: {
    storeName: process.env.STORE_NAME || 'CANFRAN',
    storeAddress: process.env.STORE_ADDRESS || 'Configurar dirección del local',
    storePhone: process.env.STORE_PHONE || '',
    minAdvanceHours: 24,
    autoEmailReceipt: false,
    receiptFooter: 'Gracias por elegir CANFRAN',
    storeLat: Number(process.env.STORE_LAT || -34.6037),
    storeLng: Number(process.env.STORE_LNG || -58.3816),
    whatsappNumber: process.env.WHATSAPP_NUMBER || '',
    instagramUrl: process.env.INSTAGRAM_URL || '',
    instagramHandle: process.env.INSTAGRAM_HANDLE || '@carniceria',
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
      brandSubtitle: 'Carnicería · Cortes · Asados',
      heroEyebrow: 'PEDIDOS CON 24 HS DE ANTICIPACIÓN',
      heroTitle: 'Elegí el corte.\nNosotros hacemos el resto.',
      heroText: 'Pedí kilos aproximados, elegí cómo querés cada corte y pagá recién cuando confirmemos el peso real.',
      heroButton: 'Ver cortes',
      howTitle: '¿Cómo funciona?',
      howSteps: ['Elegís producto, kilos y corte.','Recibimos y preparamos tu pedido.','Cargamos el peso real.','Te mostramos el total definitivo.','Recién ahí pagás.'],
      noticeTitle: 'IMPORTANTE — PEDIDOS CON 24 HORAS DE ANTICIPACIÓN',
      noticeText: 'El peso solicitado es aproximado. El importe definitivo se calculará según el peso real preparado. No pagás ahora.',
      noticeAccept: 'Entiendo y acepto realizar el pedido con un mínimo de 24 horas de anticipación.',
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
  auditLog: []
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
  db.inventoryMovements ||= [];
  db.products = (db.products || []).map(p => ({
    unitType: p.unitType || 'kg',
    pricePerKg: Number(p.pricePerKg ?? p.price ?? 0),
    price: Number(p.price ?? p.pricePerKg ?? 0),
    stockKg: Number(p.stockKg ?? 0),
    lowStockKg: Number(p.lowStockKg ?? 5),
    committedKg: Number(p.committedKg ?? 0),
    barcode: String(p.barcode || ''),
    category: String(p.category || 'Carnes'),
    cutOptions: Array.isArray(p.cutOptions) && p.cutOptions.length ? p.cutOptions : ['Entero','Parrilla','Fino'],
    ...p
  }));
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

function publicUser(u) { return { id: u.id, name: u.name, email: u.email, phone: u.phone, role: u.role, points: u.points || 0 }; }
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
  const discount = money(pointsUsed * pointValue);
  const total = Math.max(0, orderBase - discount);
  if (subtotal < db.settings.minimumOrder) throw new Error(`El pedido mínimo es $${db.settings.minimumOrder.toLocaleString('es-AR')}.`);
  const earnedPoints = Math.max(0, Math.floor(total * Math.max(0, Number(db.settings.pointsPerPeso) || 0)));
  return { items, subtotal, delivery: { type: delivery.type, street: delivery.street || '', number: delivery.number || '', city: delivery.city || '', floor: delivery.floor || '', notes: delivery.notes || '', lat: Number(delivery.lat) || null, lng: Number(delivery.lng) || null, mapsUrl: delivery.mapsUrl || '' }, deliveryFee, pointsUsed, discount, total, earnedPoints };
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
    const order = { id: uid(), code: `FR-${Date.now().toString().slice(-7)}`, userId: req.user.id, customer: publicUser(req.user), ...calc, paymentMethod, paymentStatus: paymentMethod === 'cash' ? 'pending_cash' : (['qr','transfer'].includes(paymentMethod) ? 'pending_local' : 'pending'), status: 'received', createdAt: now(), updatedAt: now() };
    req.db.orders.push(order);
    req.user.points = Math.max(0, (req.user.points || 0) - calc.pointsUsed);
    order.inventoryDeducted = false;
    await writeDb(req.db);
    io.to('staff').emit('admin:new-order', { order: { id: order.id, code: order.code, total: order.total, paymentMethod: order.paymentMethod, createdAt: order.createdAt } });

    // FROSTLAND_V6_TRANSFER_WHATSAPP
    if (paymentMethod === 'transfer') {
      const wa = String(req.db.settings?.whatsappNumber || '').replace(/\D/g,'');
      const msg = `Ya hice el pedido ${order.code} desde la web por ${money(order.total)}. Pasame el alias para abonar por favor.`;
      const whatsappUrl = wa ? `https://wa.me/${wa}?text=${encodeURIComponent(msg)}` : null;
      return res.status(201).json({ order, checkoutUrl: whatsappUrl, warning: whatsappUrl ? undefined : 'Pedido recibido. Falta configurar el WhatsApp del local.' });
    }

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
  const message = { id: uid(), userId: req.user.id, senderName: ['admin','employee'].includes(req.user.role) ? `${req.db.settings.storeName || 'CARNICERÍA'} · ${req.user.name}` : req.user.name, senderRole: req.user.role, text, createdAt: now() };
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
app.post('/api/admin/upload-image', auth, role('admin','employee'), (req, res) => {
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
  const allOrders = Array.isArray(req.db.orders) ? req.db.orders : [];
  const orders = allOrders.filter(o => !o.archivedAt);
  const arDay = value => {
    try {
      return new Intl.DateTimeFormat('en-CA', { timeZone:'America/Argentina/Buenos_Aires', year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date(value));
    } catch { return ''; }
  };
  const today = arDay(new Date());
  const todayOrders = orders.filter(o => o.status !== 'cancelled' && arDay(o.createdAt) === today);
  const todayExpenses = (Array.isArray(req.db.expenses) ? req.db.expenses : []).filter(e => arDay(e.createdAt) === today);
  const totalSales = todayOrders.reduce((a,o)=>a+Number(o.total||0),0);
  const totalExpenses = todayExpenses.reduce((a,e)=>a+Number(e.amount||0),0);
  const realMoney = totalSales - totalExpenses;
  const customersToday = new Set(todayOrders.map(o=>o.userId || o.customer?.email || o.customer?.phone || o.customer?.name).filter(Boolean)).size;
  const pendingToday = todayOrders.filter(o=>!['delivered','cancelled'].includes(o.status)).length;
  
  // FROSTLAND_V62C_TOTALES_HISTORICOS
  const historicalOrders = (req.db.orders || []).filter(o => o.status !== 'cancelled');
  const historicalSalesOrders = historicalOrders.filter(o =>
    o.paymentStatus === 'approved' ||
    (o.paymentMethod === 'cash' && o.status === 'delivered')
  );
  const historicalSales = historicalSalesOrders.reduce((a,o)=>a+Number(o.total||0),0);
  const historicalExpenses = (req.db.expenses || []).reduce((a,e)=>a+Number(e.amount||0),0);
  const historicalRealMoney = historicalSales - historicalExpenses;

  res.json({
    totals: {
    orders: historicalOrders.length,
    sales: historicalSales,
    customers: (req.db.users || []).filter(u=>u.role==='customer').length,
    pending: historicalOrders.filter(o=>!['delivered','cancelled'].includes(o.status)).length,
    expenses: historicalExpenses,
    realMoney: historicalRealMoney
  }, orders: orders.slice().sort((a,b)=>b.createdAt.localeCompare(a.createdAt)),
    users: req.db.users.map(publicUser), products: req.db.products, flavors: req.db.flavors, settings: req.db.settings,
    activeShift: req.db.cashShifts.find(s=>!s.closedAt)||null,
    shifts: req.db.cashShifts.slice().sort((a,b)=>b.openedAt.localeCompare(a.openedAt)).slice(0,30),
    expenses: req.db.expenses.slice().sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,100)
  });
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

app.put('/api/admin/settings', auth, role('admin','employee'), async (req, res) => {
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


// FROSTLAND_V61_CANCEL_ARCHIVE_PRINT
app.post('/api/admin/orders/:id/archive', auth, role('admin','employee'), async (req,res)=>{
  const order=(req.db.orders||[]).find(o=>o.id===req.params.id); if(!order)return res.status(404).json({error:'Pedido no encontrado.'});
  if(order.status!=='cancelled')return res.status(400).json({error:'Solo se pueden archivar pedidos cancelados.'});
  order.archivedAt=now(); order.archivedBy={id:req.user.id,name:req.user.name}; order.updatedAt=now();
  audit(req.db,req.user,'order.archive',{orderId:order.id,code:order.code}); await writeDb(req.db);
  res.json({ok:true,orderId:order.id});
});

// FROSTLAND_V6_SALES_NAV
function frostlandSalesRange(db, shiftId) {
  if (shiftId) {
    const shift = (db.cashShifts || []).find(s => s.id === shiftId);
    if (!shift) return null;
    return { shift, start: new Date(shift.openedAt).getTime(), end: new Date(shift.closedAt || now()).getTime(), label: `${shift.employeeName || 'Turno'} · ${new Date(shift.openedAt).toLocaleDateString('es-AR')}` };
  }
  const active = (db.cashShifts || []).find(s => !s.closedAt);
  if (active) return { shift: active, start: new Date(active.openedAt).getTime(), end: Date.now(), label: `Turno actual · ${active.employeeName || ''}` };
  const arDate = new Intl.DateTimeFormat('en-CA',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const start = new Date(`${arDate}T00:00:00-03:00`).getTime();
  return { shift: null, start, end: start + 86400000 - 1, label: `Hoy · ${arDate}` };
}
function buildSalesSnapshot(db, shiftId) {
  const range = frostlandSalesRange(db, shiftId); if (!range) return null;
  const orders = (db.orders || []).filter(o => { const t=new Date(o.createdAt).getTime(); return t>=range.start && t<=range.end && o.status!=='cancelled' && !o.archivedAt; }).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
  const paidStatuses = new Set(['approved']);
  const customersMap = new Map();
  for (const o of orders) {
    const key = o.userId || o.customer?.email || o.customer?.phone || o.customer?.name || o.id;
    const c = customersMap.get(key) || { id:key, name:o.customer?.name||'Cliente', email:o.customer?.email||'', phone:o.customer?.phone||'', ordersCount:0, total:0, paid:0, lastOrderAt:o.createdAt };
    c.ordersCount++; c.total += Number(o.total||0); if (paidStatuses.has(o.paymentStatus)) c.paid += Number(o.total||0); if(String(o.createdAt)>String(c.lastOrderAt))c.lastOrderAt=o.createdAt; customersMap.set(key,c);
  }
  const totalSales=orders.reduce((a,o)=>a+Number(o.total||0),0), paidTotal=orders.filter(o=>paidStatuses.has(o.paymentStatus)).reduce((a,o)=>a+Number(o.total||0),0);
  const expenses=(db.expenses||[]).filter(e=>{const t=new Date(e.createdAt).getTime();return t>=range.start&&t<=range.end});
  return { label:range.label, shiftId:range.shift?.id||null, from:new Date(range.start).toISOString(), to:new Date(range.end).toISOString(), ordersCount:orders.length, customersCount:customersMap.size, totalSales, paidTotal, pendingTotal:Math.max(0,totalSales-paidTotal), totalExpenses:expenses.reduce((a,e)=>a+Number(e.amount||0),0), customers:[...customersMap.values()].sort((a,b)=>b.total-a.total), orders };
}
app.get('/api/admin/sales-summary', auth, role('admin','employee'), (req,res)=>{
  const shiftId=String(req.query.shiftId||'').trim();
  if(shiftId){const shift=(req.db.cashShifts||[]).find(s=>s.id===shiftId);if(!shift)return res.status(404).json({error:'Cierre de caja no encontrado.'});if(shift.salesSnapshot)return res.json(shift.salesSnapshot);}
  const summary=buildSalesSnapshot(req.db,shiftId||null); if(!summary)return res.status(404).json({error:'Período no encontrado.'}); res.json(summary);
});

app.post('/api/admin/shifts/open', auth, role('admin','employee'), async (req,res)=>{
  if(req.db.cashShifts.some(s=>!s.closedAt))return res.status(400).json({error:'Ya hay una caja abierta.'});
  const allowedNames=['Nadia','Candela','Daniela']; const requestedName=String(req.body.employeeName||'').trim(); const employeeName=allowedNames.includes(requestedName)?requestedName:req.user.name; const shift={id:uid(),employeeId:req.user.id,employeeName,openingCash:money(req.body.openingCash),openedAt:now(),closedAt:null}; req.db.cashShifts.push(shift); audit(req.db,req.user,'cash.open',{shiftId:shift.id,openingCash:shift.openingCash}); await writeDb(req.db); res.status(201).json(shift);
});
app.post('/api/admin/shifts/:id/close', auth, role('admin','employee'), async (req,res)=>{
  const shift=req.db.cashShifts.find(s=>s.id===req.params.id); if(!shift)return res.status(404).json({error:'Turno inexistente.'}); if(shift.closedAt)return res.status(400).json({error:'La caja ya está cerrada.'});
  if(req.user.role!=='admin'&&shift.employeeId!==req.user.id)return res.status(403).json({error:'Solo podés cerrar tu propio turno.'});
  const totals=shiftTotals(req.db,shift); shift.countedCash=money(req.body.countedCash); shift.closedAt=now(); shift.closedBy={id:req.user.id,name:req.user.name}; shift.totals=totals; shift.salesSnapshot=buildSalesSnapshot(req.db,shift.id); shift.cashDifference=shift.countedCash-totals.expectedCash; audit(req.db,req.user,'cash.close',{shiftId:shift.id,cashDifference:shift.cashDifference}); await writeDb(req.db); res.json(shift);
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

app.post('/api/admin/products', auth, role('admin','employee'), async (req,res)=>{ const maxFlavors=Math.max(1,Number(req.body.maxFlavors)||1); const p={id:uid(),name:req.body.name,price:money(req.body.price),maxFlavors,unitsIncluded:Math.max(1,Number(req.body.unitsIncluded)||1),unitLabel:String(req.body.unitLabel||'pote').trim()||'pote',flavorsPerUnit:Math.max(1,Number(req.body.flavorsPerUnit)||maxFlavors),active:true,imageUrl:String(req.body.imageUrl||'').trim(),description:String(req.body.description||'').trim()}; req.db.products.push(p); await writeDb(req.db); res.status(201).json(p); });
app.delete('/api/admin/products/:id', auth, role('admin','employee'), async (req,res)=>{ const i=req.db.products.findIndex(x=>x.id===req.params.id); if(i<0)return res.status(404).json({error:'No encontrado'}); req.db.products.splice(i,1); await writeDb(req.db); res.sendStatus(204); });
app.put('/api/admin/products/:id', auth, role('admin','employee'), async (req,res)=>{ const p=req.db.products.find(x=>x.id===req.params.id); if(!p)return res.status(404).json({error:'No encontrado'}); Object.assign(p,{name:req.body.name??p.name,price:req.body.price===undefined?p.price:money(req.body.price),maxFlavors:req.body.maxFlavors===undefined?p.maxFlavors:Math.max(1,Number(req.body.maxFlavors)),unitsIncluded:req.body.unitsIncluded===undefined?p.unitsIncluded:Math.max(1,Number(req.body.unitsIncluded)),unitLabel:req.body.unitLabel===undefined?p.unitLabel:String(req.body.unitLabel||'unidad').trim()||'unidad',flavorsPerUnit:req.body.flavorsPerUnit===undefined?p.flavorsPerUnit:Math.max(1,Number(req.body.flavorsPerUnit)),active:req.body.active===undefined?p.active:Boolean(req.body.active),imageUrl:req.body.imageUrl===undefined?p.imageUrl:String(req.body.imageUrl||'').trim(),description:req.body.description===undefined?p.description:String(req.body.description||'').trim()}); await writeDb(req.db); res.json(p); });
app.post('/api/admin/flavors', auth, role('admin','employee'), async (req,res)=>{ const f={id:uid(),name:req.body.name,bucketStock:Math.max(0,Number(req.body.bucketStock)||0),lowBucketsAt:Math.max(0,Number(req.body.lowBucketsAt)||1),active:true}; req.db.flavors.push(f); await writeDb(req.db); res.status(201).json(f); });
app.delete('/api/admin/flavors/:id', auth, role('admin','employee'), async (req,res)=>{ const i=req.db.flavors.findIndex(x=>x.id===req.params.id); if(i<0)return res.status(404).json({error:'No encontrado'}); req.db.flavors.splice(i,1); await writeDb(req.db); res.sendStatus(204); });
app.put('/api/admin/flavors/:id', auth, role('admin','employee'), async (req,res)=>{ const f=req.db.flavors.find(x=>x.id===req.params.id); if(!f)return res.status(404).json({error:'No encontrado'}); Object.assign(f,{name:req.body.name??f.name,bucketStock:req.body.bucketStock===undefined?f.bucketStock:Math.max(0,Number(req.body.bucketStock)),lowBucketsAt:req.body.lowBucketsAt===undefined?f.lowBucketsAt:Math.max(0,Number(req.body.lowBucketsAt)),active:req.body.active===undefined?f.active:Boolean(req.body.active)}); await writeDb(req.db); res.json(f); });

app.post('/api/admin/inventory/flavor/:id/adjust', auth, role('admin','employee'), async (req, res) => {
  const item = req.db.flavors.find(x => x.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Sabor no encontrado.' });
  const delta = Math.trunc(Number(req.body.delta));
  if (!Number.isFinite(delta) || delta === 0) return res.status(400).json({ error: 'Ingresá un ajuste distinto de cero.' });
  item.bucketStock = Math.max(0, Number(item.bucketStock || 0) + delta);
  item.updatedAt = now();
  await writeDb(req.db);
  res.json(item);
});

app.post('/api/admin/users', auth, role('admin'), async (req,res)=>{ if(!['admin','employee','courier'].includes(req.body.role))return res.status(400).json({error:'Rol inválido'}); const u={id:uid(),name:req.body.name,email:req.body.email.toLowerCase(),phone:req.body.phone||'',passwordHash:await bcrypt.hash(req.body.password||'frostland123',10),role:req.body.role,points:0,createdAt:now()}; req.db.users.push(u); await writeDb(req.db); res.status(201).json(publicUser(u)); });



// ===== COMPROBANTES CANFRAN (PDF simple + Gmail SMTP sin dependencias extra) =====
function pdfText(v){return String(v??'').replace(/[\\()]/g,m=>'\\'+m).replace(/[\r\n]+/g,' ')}
function latin(v){return String(v??'').normalize('NFC').replace(/[–—]/g,'-').replace(/“|”/g,'"').replace(/’/g,"'")}
function wrapText(text,max=82){const words=latin(text).split(/\s+/),lines=[];let line='';for(const w of words){if((line+' '+w).trim().length>max){if(line)lines.push(line);line=w}else line=(line+' '+w).trim()}if(line)lines.push(line);return lines}
function receiptLines(order,settings){
  const final=Number(order.finalTotal||0)>0,total=final?order.finalTotal:order.totalEstimated;
  const lines=[settings.storeName||'CANFRAN',settings.storeAddress||'',settings.storePhone?`Tel: ${settings.storePhone}`:'','COMPROBANTE DE COMPRA',`Pedido: ${order.code}`,`Fecha: ${new Date(order.createdAt).toLocaleString('es-AR',{timeZone:'America/Argentina/Buenos_Aires'})}`,`Cliente: ${order.customer?.name||''}`,`Email: ${order.customer?.email||''}`,`Telefono: ${order.customer?.phone||''}`,`Entrega: ${order.delivery?.type==='delivery'?'Delivery':'Retiro en local'}`];
  if(order.delivery?.type==='delivery'){const a=[order.delivery.street,order.delivery.number,order.delivery.city].filter(Boolean).join(' ');if(a)lines.push(`Direccion: ${a}`);if(order.delivery.mapsLink)lines.push(`Maps: ${order.delivery.mapsLink}`)}
  lines.push('');
  for(const i of order.items||[]){const q=i.unitType==='kg'?(final&&i.actualKg?`${Number(i.actualKg).toLocaleString('es-AR')} kg real`:`${Number(i.requestedKg).toLocaleString('es-AR')} kg aprox.`):`x${i.qty}`;const sub=final?(i.finalSubtotal??i.estimatedSubtotal):i.estimatedSubtotal;lines.push(`${i.productName} - ${q}${i.cut?' - '+i.cut:''} - $${Number(sub||0).toLocaleString('es-AR')}`);if(i.notes)lines.push(`  Obs: ${i.notes}`)}
  lines.push('',`${final?'TOTAL':'TOTAL ESTIMADO'}: $${Number(total||0).toLocaleString('es-AR')}`,'',settings.receiptFooter||'Gracias por elegir CANFRAN','Documento comercial interno. No reemplaza factura fiscal ARCA.');
  return lines.flatMap(x=>wrapText(x,82));
}
function createSimplePdf(lines){
  const content=[];let y=800;content.push('BT','/F1 10 Tf');for(const raw of lines){if(y<45){break}const line=pdfText(latin(raw));content.push(`1 0 0 1 42 ${y} Tm (${line}) Tj`);y-=15}content.push('ET');const stream=content.join('\n');
  const objects=[null,'<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',`<< /Length ${Buffer.byteLength(stream,'latin1')} >>\nstream\n${stream}\nendstream`];
  let out='%PDF-1.4\n%âãÏÓ\n',offsets=[0];for(let i=1;i<objects.length;i++){offsets[i]=Buffer.byteLength(out,'latin1');out+=`${i} 0 obj\n${objects[i]}\nendobj\n`}const xref=Buffer.byteLength(out,'latin1');out+=`xref\n0 ${objects.length}\n0000000000 65535 f \n`;for(let i=1;i<objects.length;i++)out+=`${String(offsets[i]).padStart(10,'0')} 00000 n \n`;out+=`trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;return Buffer.from(out,'latin1')
}
function smtpWait(socket,expect){return new Promise((resolve,reject)=>{let buf='';const onData=d=>{buf+=d.toString();const lines=buf.split(/\r?\n/).filter(Boolean);const last=lines[lines.length-1]||'';if(/^\d{3} /.test(last)){cleanup();const code=Number(last.slice(0,3));if(expect.includes(code))resolve(buf);else reject(new Error(`Gmail SMTP ${code}: ${last.slice(4)}`))}};const onErr=e=>{cleanup();reject(e)};const cleanup=()=>{socket.off('data',onData);socket.off('error',onErr)};socket.on('data',onData);socket.on('error',onErr)})}
async function smtpCmd(socket,cmd,expect=[250]){if(cmd!==null)socket.write(cmd+'\r\n');return smtpWait(socket,expect)}
async function sendGmailReceipt(to,subject,text,pdfBuffer,filename){const user=String(process.env.GMAIL_USER||'').trim(),pass=String(process.env.GMAIL_APP_PASSWORD||'').replace(/\s/g,'');if(!user||!pass)throw new Error('Gmail no está configurado en el servidor.');const socket=tls.connect({host:'smtp.gmail.com',port:465,servername:'smtp.gmail.com'});await smtpCmd(socket,null,[220]);await smtpCmd(socket,'EHLO canfran');await smtpCmd(socket,'AUTH LOGIN',[334]);await smtpCmd(socket,Buffer.from(user).toString('base64'),[334]);await smtpCmd(socket,Buffer.from(pass).toString('base64'),[235]);await smtpCmd(socket,`MAIL FROM:<${user}>`);await smtpCmd(socket,`RCPT TO:<${to}>`,[250,251]);await smtpCmd(socket,'DATA',[354]);const boundary='----CANFRAN'+Date.now();const safeSubject=Buffer.from(subject).toString('base64');let msg=`From: CANFRAN <${user}>\r\nTo: <${to}>\r\nSubject: =?UTF-8?B?${safeSubject}?=\r\nMIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary="${boundary}"\r\n\r\n--${boundary}\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${Buffer.from(text).toString('base64').match(/.{1,76}/g).join('\r\n')}\r\n--${boundary}\r\nContent-Type: application/pdf; name="${filename}"\r\nContent-Disposition: attachment; filename="${filename}"\r\nContent-Transfer-Encoding: base64\r\n\r\n${pdfBuffer.toString('base64').match(/.{1,76}/g).join('\r\n')}\r\n--${boundary}--\r\n`;msg=msg.split('\n.').join('\n..');socket.write(msg+'\r\n.\r\n');await smtpWait(socket,[250]);socket.write('QUIT\r\n');socket.end()}
async function sendOrderReceipt(order,settings){if(!order.customer?.email)throw new Error('El cliente no tiene email cargado.');const pdf=createSimplePdf(receiptLines(order,settings));await sendGmailReceipt(order.customer.email,`Comprobante CANFRAN ${order.code}`,`Hola ${order.customer?.name||''}. Adjuntamos el comprobante de tu pedido ${order.code}.`,pdf,`CANFRAN_${order.code}.pdf`);order.receiptEmailSentAt=now();order.receiptEmailTo=order.customer.email;order.receiptEmailLastError='';return pdf}

// ===== CARNICERIA PRO: pedidos por peso, stock comprometido y código de barras =====
const kg3 = n => Math.max(0, Math.round((Number(n)||0)*1000)/1000);
function meatProductPublic(p){
  return { id:p.id,name:p.name,description:p.description||'',imageUrl:p.imageUrl||'',active:p.active!==false,category:p.category||'Carnes',unitType:p.unitType||'kg',pricePerKg:Number(p.pricePerKg??p.price??0),price:Number(p.price??p.pricePerKg??0),stockKg:kg3(p.stockKg),committedKg:kg3(p.committedKg),availableKg:kg3(Number(p.stockKg||0)-Number(p.committedKg||0)),lowStockKg:kg3(p.lowStockKg||5),barcode:p.barcode||'',cutOptions:Array.isArray(p.cutOptions)?p.cutOptions:[] };
}
function releaseCommitted(db, order){
  if(order.committedReleased)return;
  for(const item of order.items||[]){
    if(item.unitType!=='kg')continue;
    const p=db.products.find(x=>x.id===item.productId); if(!p)continue;
    p.committedKg=kg3(Math.max(0,Number(p.committedKg||0)-Number(item.requestedKg||0)));
  }
  order.committedReleased=true;
}
function meatAdminSnapshot(db){
  const orders=[...(db.orders||[])].filter(o=>o.systemType==='meat').sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
  const products=(db.products||[]).map(meatProductPublic);
  return { orders, products, inventoryMovements:[...(db.inventoryMovements||[])].sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))).slice(0,250), users:(db.users||[]).map(publicUser), settings:db.settings,
    metrics:{newOrders:orders.filter(o=>['received','accepted'].includes(o.status)).length,preparing:orders.filter(o=>o.status==='preparing').length,awaitingPayment:orders.filter(o=>o.status==='awaiting_payment').length,ready:orders.filter(o=>o.status==='ready').length,lowStock:products.filter(p=>p.unitType==='kg'&&p.availableKg<=p.lowStockKg).length,committedKg:kg3(products.reduce((a,p)=>a+Number(p.committedKg||0),0))}
  };
}
app.get('/api/meat/bootstrap', async (_req,res)=>{const db=await readDb();res.json({settings:db.settings,products:(db.products||[]).filter(p=>p.active!==false).map(meatProductPublic),availability:storeAvailability(db.settings)});});
app.post('/api/meat/orders', auth, async (req,res)=>{
  try{
    if(!req.body.ack24h)throw new Error('Tenés que aceptar que el pedido se realiza con 24 horas de anticipación.');
    const requestedFor=new Date(req.body.requestedFor||''); const minHours=Math.max(1,Number(req.db.settings.minAdvanceHours||24)); if(Number.isNaN(requestedFor.getTime())||requestedFor.getTime()<Date.now()+minHours*3600000-60000)throw new Error(`Elegí una fecha/hora de retiro o entrega con al menos ${minHours} horas de anticipación.`);
    const items=[]; let estimatedSubtotal=0;
    for(const raw of req.body.items||[]){const p=req.db.products.find(x=>x.id===raw.productId&&x.active!==false);if(!p)throw new Error('Hay un producto inválido.');
      if((p.unitType||'kg')==='kg'){const requestedKg=kg3(raw.requestedKg);if(requestedKg<=0)throw new Error(`${p.name}: indicá los kg aproximados.`);const available=Number(p.stockKg||0)-Number(p.committedKg||0);if(requestedKg>available+0.0001)throw new Error(`${p.name}: solo quedan ${kg3(available)} kg disponibles.`);const cut=String(raw.cut||'Entero').slice(0,80);const est=money(requestedKg*Number(p.pricePerKg??p.price??0));items.push({id:uid(),productId:p.id,productName:p.name,unitType:'kg',requestedKg,actualKg:null,cut,notes:String(raw.notes||'').slice(0,250),unitPrice:Number(p.pricePerKg??p.price??0),estimatedSubtotal:est,finalSubtotal:null});estimatedSubtotal+=est;p.committedKg=kg3(Number(p.committedKg||0)+requestedKg);}
      else{const qty=Math.max(1,Math.min(50,Math.trunc(Number(raw.qty)||1)));const est=money(qty*Number(p.price||0));items.push({id:uid(),productId:p.id,productName:p.name,unitType:'unit',qty,actualQty:qty,notes:String(raw.notes||'').slice(0,250),unitPrice:Number(p.price||0),estimatedSubtotal:est,finalSubtotal:est});estimatedSubtotal+=est;}
    }
    if(!items.length)throw new Error('El carrito está vacío.');
    const delivery=req.body.delivery||{}; if(!['pickup','delivery'].includes(delivery.type))throw new Error('Elegí retiro o delivery.');
    const order={id:uid(),code:`CA-${Date.now().toString().slice(-7)}`,systemType:'meat',userId:req.user.id,customer:publicUser(req.user),items,estimatedSubtotal,totalEstimated:estimatedSubtotal,finalTotal:null,paymentMethod:null,paymentStatus:'awaiting_weight',status:'received',requestedFor:requestedFor.toISOString(),ack24h:true,delivery:{type:delivery.type,street:String(delivery.street||''),number:String(delivery.number||''),city:String(delivery.city||''),notes:String(delivery.notes||''),mapsLink:String(delivery.mapsLink||'').slice(0,600),latitude:Number.isFinite(Number(delivery.latitude))?Number(delivery.latitude):null,longitude:Number.isFinite(Number(delivery.longitude))?Number(delivery.longitude):null},customerNotes:String(req.body.customerNotes||'').slice(0,500),createdAt:now(),updatedAt:now(),timeline:[{status:'received',at:now(),by:req.user.name}]};
    req.db.orders.push(order); await writeDb(req.db); io.to('staff').emit('admin:new-order',{order:{id:order.id,code:order.code,total:order.totalEstimated,createdAt:order.createdAt}});res.status(201).json(order);
  }catch(e){res.status(400).json({error:e.message});}
});
app.get('/api/meat/my-orders', auth, (req,res)=>res.json(req.db.orders.filter(o=>o.systemType==='meat'&&o.userId===req.user.id).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)))));
app.post('/api/meat/orders/:id/pay', auth, async (req,res)=>{
  const order=req.db.orders.find(o=>o.id===req.params.id&&o.systemType==='meat');if(!order)return res.status(404).json({error:'Pedido no encontrado.'});if(order.userId!==req.user.id&&!['admin','employee'].includes(req.user.role))return res.status(403).json({error:'Sin acceso.'});if(order.status!=='awaiting_payment'||!order.finalTotal)return res.status(400).json({error:'El pedido todavía no tiene importe definitivo.'});
  const method=String(req.body.paymentMethod||'');if(!['cash','mercadopago','qr','transfer'].includes(method))return res.status(400).json({error:'Medio de pago inválido.'});order.paymentMethod=method;order.paymentStatus=method==='cash'?'pending_cash':(method==='mercadopago'?'pending':'pending_local');order.updatedAt=now();
  if(method==='mercadopago'){
    const token=String(process.env.MP_ACCESS_TOKEN||'').trim();if(!token){await writeDb(req.db);return res.json({order,warning:'Mercado Pago no está configurado.'});}const client=new MercadoPagoConfig({accessToken:token});const preference=new Preference(client);const base=/^https:\/\//i.test(PUBLIC_URL)?PUBLIC_URL:`${req.protocol}://${req.get('host')}`;const body={items:[{id:order.id,title:`Pedido ${order.code}`,quantity:1,unit_price:Number(order.finalTotal),currency_id:'ARS'}],external_reference:order.id,metadata:{order_id:order.id}};if(/^https:\/\//i.test(base)){body.back_urls={success:`${base}/?payment=success&order=${order.id}`,pending:`${base}/?payment=pending&order=${order.id}`,failure:`${base}/?payment=failure&order=${order.id}`};body.auto_return='approved';body.notification_url=`${base}/api/mercadopago/webhook`;}const r=await preference.create({body});order.mpPreferenceId=r.id;order.mpInitPoint=r.init_point;await writeDb(req.db);return res.json({order,checkoutUrl:r.init_point});
  }
  await writeDb(req.db); if(method==='transfer'){const wa=String(req.db.settings.whatsappNumber||'').replace(/\D/g,'');return res.json({order,checkoutUrl:wa?`https://wa.me/${wa}?text=${encodeURIComponent(`Hola, quiero pagar el pedido ${order.code} por $${Number(order.finalTotal).toLocaleString('es-AR')}. ¿Me pasan el alias?`)}`:null});}res.json({order});
});
app.get('/api/meat/admin/orders/:id/receipt.pdf', auth, role('admin','employee'), async (req,res)=>{const o=req.db.orders.find(x=>x.id===req.params.id&&x.systemType==='meat');if(!o)return res.status(404).json({error:'Pedido no encontrado.'});const pdf=createSimplePdf(receiptLines(o,req.db.settings));res.setHeader('Content-Type','application/pdf');res.setHeader('Content-Disposition',`attachment; filename="CANFRAN_${o.code}.pdf"`);res.send(pdf)});
app.post('/api/meat/admin/orders/:id/email-receipt', auth, role('admin','employee'), async (req,res)=>{try{const o=req.db.orders.find(x=>x.id===req.params.id&&x.systemType==='meat');if(!o)throw new Error('Pedido no encontrado.');await sendOrderReceipt(o,req.db.settings);await writeDb(req.db);res.json({ok:true,to:o.customer.email,sentAt:o.receiptEmailSentAt})}catch(e){res.status(400).json({error:e.message})}});
app.put('/api/meat/admin/settings', auth, role('admin','employee'), async (req,res)=>{
  const body=req.body||{};
  const allowed=['storeName','storeAddress','storePhone','whatsappNumber','instagramHandle','instagramUrl','mapsUrl','receiptFooter'];
  for(const k of allowed) if(k in body) req.db.settings[k]=String(body[k]??'').slice(0,1000);
  if(body.minAdvanceHours!==undefined) req.db.settings.minAdvanceHours=Math.max(1,Math.min(168,Math.round(Number(body.minAdvanceHours)||24)));
  if(body.autoEmailReceipt!==undefined) req.db.settings.autoEmailReceipt=Boolean(body.autoEmailReceipt);
  if(body.siteContent&&typeof body.siteContent==='object'){
    req.db.settings.siteContent={...(req.db.settings.siteContent||{}),...body.siteContent};
    if(Array.isArray(body.siteContent.howSteps)) req.db.settings.siteContent.howSteps=body.siteContent.howSteps.map(x=>String(x).slice(0,180)).slice(0,10);
  }
  await writeDb(req.db);
  res.json(req.db.settings);
});
app.get('/api/meat/admin/dashboard', auth, role('admin','employee'), (req,res)=>res.json(meatAdminSnapshot(req.db)));
app.post('/api/meat/admin/orders/:id/accept', auth, role('admin','employee'), async (req,res)=>{const o=req.db.orders.find(x=>x.id===req.params.id&&x.systemType==='meat');if(!o)return res.status(404).json({error:'Pedido no encontrado.'});o.status='accepted';o.acceptedAt=now();o.acceptedBy={id:req.user.id,name:req.user.name};o.timeline||=[];o.timeline.push({status:'accepted',at:now(),by:req.user.name});o.updatedAt=now();await writeDb(req.db);res.json(o);});
app.post('/api/meat/admin/orders/:id/preparing', auth, role('admin','employee'), async (req,res)=>{const o=req.db.orders.find(x=>x.id===req.params.id&&x.systemType==='meat');if(!o)return res.status(404).json({error:'Pedido no encontrado.'});o.status='preparing';o.timeline||=[];o.timeline.push({status:'preparing',at:now(),by:req.user.name});o.updatedAt=now();await writeDb(req.db);res.json(o);});
app.post('/api/meat/admin/orders/:id/finalize', auth, role('admin','employee'), async (req,res)=>{
  try{const o=req.db.orders.find(x=>x.id===req.params.id&&x.systemType==='meat');if(!o)throw new Error('Pedido no encontrado.');const weights=req.body.weights||{};let total=0;
    for(const item of o.items||[]){const p=req.db.products.find(x=>x.id===item.productId);if(!p)throw new Error(`No existe ${item.productName}.`);if(item.unitType==='kg'){const actual=kg3(weights[item.id]);if(actual<=0)throw new Error(`Cargá el peso real de ${item.productName}.`);if(actual>Number(p.stockKg||0)+0.0001)throw new Error(`Stock insuficiente de ${item.productName}.`);item.actualKg=actual;item.finalSubtotal=money(actual*Number(item.unitPrice||0));total+=item.finalSubtotal;p.stockKg=kg3(Number(p.stockKg||0)-actual);p.committedKg=kg3(Math.max(0,Number(p.committedKg||0)-Number(item.requestedKg||0)));req.db.inventoryMovements.push({id:uid(),productId:p.id,productName:p.name,type:'exit',kg:actual,reason:'Pedido preparado',reference:o.code,barcode:p.barcode||'',createdBy:{id:req.user.id,name:req.user.name},createdAt:now(),stockAfter:p.stockKg});}else total+=Number(item.finalSubtotal||0);}
    o.committedReleased=true;o.finalTotal=money(total);o.status='awaiting_payment';o.paymentStatus='awaiting_payment';o.finalizedAt=now();o.timeline||=[];o.timeline.push({status:'awaiting_payment',at:now(),by:req.user.name});o.updatedAt=now();if(req.db.settings.autoEmailReceipt&&o.customer?.email){try{await sendOrderReceipt(o,req.db.settings)}catch(mailErr){o.receiptEmailLastError=mailErr.message;console.error('No se pudo enviar comprobante automático:',mailErr.message)}}await writeDb(req.db);io.to(`order:${o.id}`).emit('order:update',o);res.json(o);
  }catch(e){res.status(400).json({error:e.message});}
});
app.post('/api/meat/admin/orders/:id/ready', auth, role('admin','employee'), async (req,res)=>{const o=req.db.orders.find(x=>x.id===req.params.id&&x.systemType==='meat');if(!o)return res.status(404).json({error:'Pedido no encontrado.'});o.status='ready';o.timeline||=[];o.timeline.push({status:'ready',at:now(),by:req.user.name});o.updatedAt=now();await writeDb(req.db);res.json(o);});
app.post('/api/meat/admin/orders/:id/delivered', auth, role('admin','employee'), async (req,res)=>{const o=req.db.orders.find(x=>x.id===req.params.id&&x.systemType==='meat');if(!o)return res.status(404).json({error:'Pedido no encontrado.'});o.status='delivered';o.timeline||=[];o.timeline.push({status:'delivered',at:now(),by:req.user.name});o.updatedAt=now();await writeDb(req.db);res.json(o);});
app.post('/api/meat/admin/orders/:id/cancel', auth, role('admin','employee'), async (req,res)=>{const o=req.db.orders.find(x=>x.id===req.params.id&&x.systemType==='meat');if(!o)return res.status(404).json({error:'Pedido no encontrado.'});if(!o.committedReleased)releaseCommitted(req.db,o);o.status='cancelled';o.updatedAt=now();await writeDb(req.db);res.json(o);});
app.post('/api/meat/admin/products', auth, role('admin','employee'), async (req,res)=>{const p={id:uid(),name:String(req.body.name||'').trim(),description:String(req.body.description||'').trim(),imageUrl:String(req.body.imageUrl||'').trim(),category:String(req.body.category||'Carnes').trim(),unitType:req.body.unitType==='unit'?'unit':'kg',pricePerKg:money(req.body.pricePerKg??req.body.price),price:money(req.body.price??req.body.pricePerKg),stockKg:kg3(req.body.stockKg),committedKg:0,lowStockKg:kg3(req.body.lowStockKg||5),barcode:String(req.body.barcode||'').trim(),cutOptions:Array.isArray(req.body.cutOptions)?req.body.cutOptions.map(String).filter(Boolean):['Entero','Parrilla','Fino'],active:req.body.active!==false};if(!p.name)return res.status(400).json({error:'Ingresá el nombre.'});req.db.products.push(p);await writeDb(req.db);res.status(201).json(meatProductPublic(p));});
app.put('/api/meat/admin/products/:id', auth, role('admin','employee'), async (req,res)=>{const p=req.db.products.find(x=>x.id===req.params.id);if(!p)return res.status(404).json({error:'Producto no encontrado.'});for(const k of ['name','description','imageUrl','category','barcode'])if(req.body[k]!==undefined)p[k]=String(req.body[k]);if(req.body.unitType!==undefined)p.unitType=req.body.unitType==='unit'?'unit':'kg';if(req.body.pricePerKg!==undefined){p.pricePerKg=money(req.body.pricePerKg);p.price=p.pricePerKg;}if(req.body.price!==undefined)p.price=money(req.body.price);if(req.body.stockKg!==undefined&&p.unitType==='kg'){const next=kg3(req.body.stockKg),delta=kg3(next-Number(p.stockKg||0));if(Math.abs(delta)>0.0001){p.stockKg=next;req.db.inventoryMovements.push({id:uid(),productId:p.id,productName:p.name,type:delta>0?'entry':'exit',kg:kg3(Math.abs(delta)),reason:'Stock editado desde producto',reference:'EDICIÓN',barcode:p.barcode||'',createdBy:{id:req.user.id,name:req.user.name},createdAt:now(),stockAfter:p.stockKg});}}if(req.body.lowStockKg!==undefined)p.lowStockKg=kg3(req.body.lowStockKg);if(req.body.cutOptions!==undefined)p.cutOptions=Array.isArray(req.body.cutOptions)?req.body.cutOptions.map(String).filter(Boolean):[];if(req.body.active!==undefined)p.active=Boolean(req.body.active);await writeDb(req.db);res.json(meatProductPublic(p));});
app.delete('/api/meat/admin/products/:id', auth, role('admin','employee'), async (req,res)=>{const p=req.db.products.find(x=>x.id===req.params.id);if(!p)return res.status(404).json({error:'Producto no encontrado.'});p.active=false;await writeDb(req.db);res.sendStatus(204);});
app.post('/api/meat/admin/inventory/scan', auth, role('admin','employee'), async (req,res)=>{const barcode=String(req.body.barcode||'').trim();const p=req.db.products.find(x=>String(x.barcode||'')===barcode);if(!p)return res.status(404).json({error:'No hay producto asociado a ese código de barras.'});const type=req.body.type==='exit'?'exit':'entry';const kg=kg3(req.body.kg);if(kg<=0)return res.status(400).json({error:'Ingresá los kg.'});if(type==='exit'&&kg>Number(p.stockKg||0))return res.status(400).json({error:'Stock insuficiente.'});p.stockKg=kg3(Number(p.stockKg||0)+(type==='entry'?kg:-kg));const m={id:uid(),productId:p.id,productName:p.name,type,kg,reason:String(req.body.reason|| (type==='entry'?'Ingreso por escaneo':'Salida por escaneo')).slice(0,150),reference:String(req.body.reference||'').slice(0,120),barcode,createdBy:{id:req.user.id,name:req.user.name},createdAt:now(),stockAfter:p.stockKg};req.db.inventoryMovements.push(m);await writeDb(req.db);res.json({product:meatProductPublic(p),movement:m});});
app.post('/api/meat/admin/inventory/:id/adjust', auth, role('admin','employee'), async (req,res)=>{const p=req.db.products.find(x=>x.id===req.params.id);if(!p)return res.status(404).json({error:'Producto no encontrado.'});const delta=Number(req.body.deltaKg);if(!Number.isFinite(delta)||delta===0)return res.status(400).json({error:'Ingresá un ajuste.'});if(Number(p.stockKg||0)+delta<0)return res.status(400).json({error:'El stock no puede quedar negativo.'});p.stockKg=kg3(Number(p.stockKg||0)+delta);const m={id:uid(),productId:p.id,productName:p.name,type:delta>0?'entry':'exit',kg:kg3(Math.abs(delta)),reason:String(req.body.reason||'Ajuste manual').slice(0,150),reference:'AJUSTE',barcode:p.barcode||'',createdBy:{id:req.user.id,name:req.user.name},createdAt:now(),stockAfter:p.stockKg};req.db.inventoryMovements.push(m);await writeDb(req.db);res.json({product:meatProductPublic(p),movement:m});});

app.get('/{*splat}', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

await initFirebase();
await ensureDb();
server.listen(PORT, '0.0.0.0', () => {
  console.log(`CARNICERÍA PRO funcionando en ${PUBLIC_URL}`);
  console.log(`Archivo de configuración: ${loadedEnvFile || 'NO ENCONTRADO (.env o .env.txt)'}`);
  console.log(`Mercado Pago: ${String(process.env.MP_ACCESS_TOKEN || '').trim() ? 'CONFIGURADO' : 'SIN CREDENCIALES'}`);
  if (!/^https:\/\//i.test(PUBLIC_URL)) console.log('Mercado Pago: retorno automático desactivado en localhost; el checkout igualmente puede abrirse.');
});
