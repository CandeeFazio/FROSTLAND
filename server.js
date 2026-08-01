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
  notifications: []
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
  db.products = (db.products || []).map(p => ({ active: true, imageUrl: '', description: '', ...p }));
  db.flavors = (db.flavors || []).map(f => ({ bucketStock: Number(f.bucketStock ?? f.stock ?? 0), lowBucketsAt: Number(f.lowBucketsAt ?? f.lowStockAt ?? 1), active: true, ...f }));
  db.orders ||= [];
  db.users ||= [];
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
  socket.on('chat:join', async ({ orderId }) => {
    const db = await readDb();
    const order = db.orders.find(o => o.id === orderId);
    if (!order) return socket.emit('chat:error', { message: 'Pedido inexistente.' });
    const allowed = ['admin','courier'].includes(socket.user.role) || order.userId === socket.user.id;
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
    const flavorIds = [...new Set(raw.flavorIds || [])];
    if (!flavorIds.length || flavorIds.length > product.maxFlavors) throw new Error(`${product.name} permite entre 1 y ${product.maxFlavors} sabores.`);
    const flavors = flavorIds.map(id => db.flavors.find(f => f.id === id && f.active)).filter(Boolean);
    if (flavors.length !== flavorIds.length) throw new Error('Hay sabores inválidos o no disponibles.');
    const unavailable = flavors.find(f => Number(f.bucketStock || 0) <= 0);
    if (unavailable) throw new Error(`${unavailable.name} está agotado.`);
    items.push({ id: uid(), productId: product.id, productName: product.name, qty, unitPrice: product.price, flavorIds, flavorNames: flavors.map(f => f.name), subtotal: product.price * qty });
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
    if (!['cash','mercadopago'].includes(paymentMethod)) throw new Error('Medio de pago inválido.');
    const calc = calculateOrder(req.db, req.body, req.user);
    const order = { id: uid(), code: `FR-${Date.now().toString().slice(-7)}`, userId: req.user.id, customer: publicUser(req.user), ...calc, paymentMethod, paymentStatus: paymentMethod === 'cash' ? 'pending_cash' : 'pending', status: 'received', createdAt: now(), updatedAt: now() };
    req.db.orders.push(order);
    req.user.points = Math.max(0, (req.user.points || 0) - calc.pointsUsed);
    order.inventoryDeducted = false;
    await writeDb(req.db);

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
      order.pointsCredited = true; order.status = 'confirmed';
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
  if (req.user.role !== 'admin' && req.user.role !== 'courier' && order.userId !== req.user.id) return res.status(403).json({ error: 'No tenés acceso a este chat.' });
  res.json(order.messages || []);
});
app.post('/api/orders/:id/messages', auth, async (req, res) => {
  const order = req.db.orders.find(o => o.id === req.params.id);
  if (!order) return res.status(404).json({ error: 'Pedido no encontrado.' });
  if (req.user.role !== 'admin' && req.user.role !== 'courier' && order.userId !== req.user.id) return res.status(403).json({ error: 'No tenés acceso a este chat.' });
  const text = String(req.body.text || '').trim().slice(0, 500);
  if (!text) return res.status(400).json({ error: 'Escribí un mensaje.' });
  order.messages ||= [];
  const message = { id: uid(), userId: req.user.id, senderName: req.user.role === 'admin' ? 'FROSTLAND' : req.user.name, senderRole: req.user.role, text, createdAt: now() };
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

app.get('/api/admin/dashboard', auth, role('admin'), (req, res) => {
  const orders = req.db.orders;
  const paid = orders.filter(o => o.paymentStatus === 'approved' || o.paymentMethod === 'cash');
  res.json({ totals: { orders: orders.length, sales: paid.reduce((a,o)=>a+o.total,0), customers: req.db.users.filter(u=>u.role==='customer').length, pending: orders.filter(o=>!['delivered','cancelled'].includes(o.status)).length }, orders: orders.slice().sort((a,b)=>b.createdAt.localeCompare(a.createdAt)), users: req.db.users.map(publicUser), products: req.db.products, flavors: req.db.flavors, settings: req.db.settings });
});
app.put('/api/admin/orders/:id', auth, role('admin','courier'), async (req, res) => {
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
app.put('/api/admin/settings', auth, role('admin'), async (req, res) => {
  const body = req.body || {};
  req.db.settings = { ...req.db.settings, ...body, adminPin: req.db.settings.adminPin };
  if (body.weeklyHours && typeof body.weeklyHours === 'object') req.db.settings.weeklyHours = body.weeklyHours;
  for (const key of ['deliveryFee','freeDeliveryFrom','minimumOrder','pointValue','welcomePoints']) req.db.settings[key] = Math.max(0, money(req.db.settings[key]));
  req.db.settings.pointsPerPeso = Math.max(0, Number(req.db.settings.pointsPerPeso) || 0);
  req.db.settings.maxPointsDiscountPercent = Math.min(100, Math.max(0, Number(req.db.settings.maxPointsDiscountPercent ?? 50)));
  if (!['auto','manual'].includes(req.db.settings.storeStatusMode)) req.db.settings.storeStatusMode = 'auto';
  await writeDb(req.db);
  res.json({ ...req.db.settings, availability: storeAvailability(req.db.settings) });
});
app.post('/api/admin/products', auth, role('admin'), async (req,res)=>{ const p={id:uid(),name:req.body.name,price:money(req.body.price),maxFlavors:Math.max(1,Number(req.body.maxFlavors)||1),active:true,imageUrl:String(req.body.imageUrl||'').trim(),description:String(req.body.description||'').trim()}; req.db.products.push(p); await writeDb(req.db); res.status(201).json(p); });
app.delete('/api/admin/products/:id', auth, role('admin'), async (req,res)=>{ const i=req.db.products.findIndex(x=>x.id===req.params.id); if(i<0)return res.status(404).json({error:'No encontrado'}); req.db.products.splice(i,1); await writeDb(req.db); res.sendStatus(204); });
app.put('/api/admin/products/:id', auth, role('admin'), async (req,res)=>{ const p=req.db.products.find(x=>x.id===req.params.id); if(!p)return res.status(404).json({error:'No encontrado'}); Object.assign(p,{name:req.body.name??p.name,price:req.body.price===undefined?p.price:money(req.body.price),maxFlavors:req.body.maxFlavors===undefined?p.maxFlavors:Math.max(1,Number(req.body.maxFlavors)),active:req.body.active===undefined?p.active:Boolean(req.body.active),imageUrl:req.body.imageUrl===undefined?p.imageUrl:String(req.body.imageUrl||'').trim(),description:req.body.description===undefined?p.description:String(req.body.description||'').trim()}); await writeDb(req.db); res.json(p); });
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
  await writeDb(req.db);
  res.json(item);
});

app.post('/api/admin/users', auth, role('admin'), async (req,res)=>{ if(!['admin','courier'].includes(req.body.role))return res.status(400).json({error:'Rol inválido'}); const u={id:uid(),name:req.body.name,email:req.body.email.toLowerCase(),phone:req.body.phone||'',passwordHash:await bcrypt.hash(req.body.password||'frostland123',10),role:req.body.role,points:0,createdAt:now()}; req.db.users.push(u); await writeDb(req.db); res.status(201).json(publicUser(u)); });

app.get('/{*splat}', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

await initFirebase();
await ensureDb();
server.listen(PORT, '0.0.0.0', () => {
  console.log(`FROSTLAND funcionando en ${PUBLIC_URL}`);
  console.log(`Archivo de configuración: ${loadedEnvFile || 'NO ENCONTRADO (.env o .env.txt)'}`);
  console.log(`Mercado Pago: ${String(process.env.MP_ACCESS_TOKEN || '').trim() ? 'CONFIGURADO' : 'SIN CREDENCIALES'}`);
  if (!/^https:\/\//i.test(PUBLIC_URL)) console.log('Mercado Pago: retorno automático desactivado en localhost; el checkout igualmente puede abrirse.');
});
