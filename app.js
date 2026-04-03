// ===================================================
// MI ÁLBUM DE FORTALEZAS — App Principal
// Firebase Auth + Firestore + PWA
// ===================================================

// ===== CONFIGURACIÓN FIREBASE =====
const firebaseConfig = {
  apiKey: "AIzaSyDDlgIMPQvVR0J-rsUIaQ8_QzzZd9Ja3go",
  authDomain: "album-de-fortalezas.firebaseapp.com",
  projectId: "album-de-fortalezas",
  storageBucket: "album-de-fortalezas.firebasestorage.app",
  messagingSenderId: "700564751434",
  appId: "1:700564751434:web:8b8d9c5da52f0c396f52b3"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// Persistencia offline
db.enablePersistence({ synchronizeTabs: true }).catch(err => {
  console.log('Persistencia offline no disponible:', err.code);
});

// ===== ESTADO GLOBAL =====
let estadoApp = {
  usuario: null,        // datos del usuario actual
  pacienteId: null,     // ID del paciente (si es niño = propio UID)
  rol: null,            // 'nino' | 'psicologo' | 'padre'
  semana: 1,
  datos: { cualidad: [], habilidad: [], 'me-gusta': [], aprendiendo: [],
           logro: [], supere: [], 'quiero-intentar': [],
           momento: [], ayude: [], problema: [], compartir: [],
           emocion: [] },
  fortalezasIniciales: [],
  pacienteActual: null, // para vista psicólogo
};

const emojisSeleccionados = { p1: '💎', p2: '🏆', p3: '😊', p4: '😄', avatar: '🦋' };
const catActualP1 = { val: 'cualidad' };
const catActualP2 = { val: 'logro' };
const catActualP3 = { val: 'momento' };
let emocionSeleccionada = null;
let calmaSeleccionada = null;
let tabLogin = 'nino';

// Prefijos localStorage (respaldo)
const LS_KEY = uid => `album_backup_${uid}`;

// ===== INIT =====
window.addEventListener('load', () => {
  // Ocultar pantalla de carga tras auth check
  auth.onAuthStateChanged(async user => {
    if (user) {
      await cargarPerfil(user.uid);
    } else {
      mostrarLogin();
    }
  });

  // Detector offline
  window.addEventListener('offline', () => {
    document.getElementById('offline-banner').classList.add('visible');
  });
  window.addEventListener('online', () => {
    document.getElementById('offline-banner').classList.remove('visible');
  });
});

function mostrarLogin() {
  document.getElementById('pantalla-carga').style.display = 'none';
  document.getElementById('pantalla-login').style.display = 'block';
}

// ===== TABS LOGIN =====
function setTab(tab, btn) {
  tabLogin = tab;
  document.querySelectorAll('.login-tab').forEach(b => b.classList.remove('activo'));
  btn.classList.add('activo');
  const lbl = tab === 'nino' ? '¡Entrar a mi álbum!' : '🩺 Entrar al panel';
  document.querySelector('.login-btn').textContent = lbl;
}

// ===== LOGIN =====
async function iniciarSesion() {
  const username = document.getElementById('login-user').value.trim().toLowerCase();
  const pass = document.getElementById('login-pass').value;
  const errEl = document.getElementById('login-error');
  errEl.style.display = 'none';

  if (!username || !pass) {
    mostrarError(errEl, '✏️ Escribe tu usuario y contraseña');
    return;
  }

  try {
    // Buscamos el email en Firestore asociado al username
    const snap = await db.collection('usuarios_username')
      .where('username', '==', username).limit(1).get();

    if (snap.empty) {
      mostrarError(errEl, '❌ Usuario no encontrado');
      return;
    }

    const userDoc = snap.docs[0].data();
    const email = userDoc.email;

    const cred = await auth.signInWithEmailAndPassword(email, pass);
    await cargarPerfil(cred.user.uid);
  } catch (e) {
    let msg = '❌ Usuario o contraseña incorrectos';
    if (e.code === 'auth/too-many-requests') msg = '⏳ Demasiados intentos. Espera un momento.';
    mostrarError(errEl, msg);
  }
}

function mostrarError(el, msg) {
  el.textContent = msg;
  el.style.display = 'block';
}

// ===== CARGAR PERFIL =====
async function cargarPerfil(uid) {
  try {
    const doc = await db.collection('usuarios').doc(uid).get();
    if (!doc.exists) {
      auth.signOut();
      mostrarLogin();
      return;
    }

    const data = doc.data();
    estadoApp.usuario = { uid, ...data };
    estadoApp.rol = data.rol;

    if (data.rol === 'psicologo') {
      estadoApp.pacienteId = null;
      iniciarAppPsicologo();
    } else {
      // niño: su pacienteId = su uid (o referencia directa)
      estadoApp.pacienteId = uid;
      await cargarDatosNino(uid);
      iniciarAppNino();
    }
  } catch (e) {
    console.error('Error cargando perfil:', e);
    // Intentar desde localStorage como fallback
    const backup = JSON.parse(localStorage.getItem(LS_KEY(uid)) || 'null');
    if (backup) {
      estadoApp.usuario = backup.usuario;
      estadoApp.rol = backup.rol;
      estadoApp.datos = backup.datos || estadoApp.datos;
      estadoApp.semana = backup.semana || 1;
      estadoApp.fortalezasIniciales = backup.fortalezasIniciales || [];
      if (backup.rol === 'nino') iniciarAppNino();
    } else {
      mostrarLogin();
    }
  }
}

// ===== CARGAR DATOS NIÑO =====
async function cargarDatosNino(pacienteId) {
  try {
    // Cargar metadatos (semana)
    const avanceDoc = await db.collection('avance').doc(pacienteId).get();
    if (avanceDoc.exists) {
      estadoApp.semana = avanceDoc.data().semanaActual || 1;
    }

    // Cargar fortalezas iniciales
    const fortDoc = await db.collection('fortalezas_iniciales').doc(pacienteId).get();
    if (fortDoc.exists) {
      estadoApp.fortalezasIniciales = fortDoc.data().lista || [];
    }

    // Cargar registros por categoría
    const registros = await db.collection('registros').doc(pacienteId)
      .collection('items').orderBy('fecha', 'desc').limit(200).get();

    // Reset
    Object.keys(estadoApp.datos).forEach(k => estadoApp.datos[k] = []);

    registros.forEach(doc => {
      const d = doc.data();
      if (estadoApp.datos[d.categoria] !== undefined) {
        estadoApp.datos[d.categoria].push({ id: doc.id, ...d });
      }
    });

    // Guardar backup localStorage
    guardarBackupLocal();

  } catch (e) {
    console.warn('Error cargando datos, usando backup:', e);
    const backup = JSON.parse(localStorage.getItem(LS_KEY(pacienteId)) || 'null');
    if (backup) {
      estadoApp.datos = backup.datos || estadoApp.datos;
      estadoApp.semana = backup.semana || 1;
      estadoApp.fortalezasIniciales = backup.fortalezasIniciales || [];
    }
  }
}

function guardarBackupLocal() {
  const uid = estadoApp.pacienteId || estadoApp.usuario?.uid;
  if (!uid) return;
  localStorage.setItem(LS_KEY(uid), JSON.stringify({
    usuario: estadoApp.usuario,
    rol: estadoApp.rol,
    datos: estadoApp.datos,
    semana: estadoApp.semana,
    fortalezasIniciales: estadoApp.fortalezasIniciales
  }));
}

// ===== INICIAR APP NIÑO =====
function iniciarAppNino() {
  document.getElementById('pantalla-carga').style.display = 'none';
  document.getElementById('pantalla-login').style.display = 'none';
  document.getElementById('app').style.display = 'block';
  document.getElementById('nav-nino').style.display = 'flex';
  document.getElementById('nav-psicologo').style.display = 'none';

  const u = estadoApp.usuario;
  const nombre = u.nombre || 'Amigo/a';

  document.getElementById('header-nombre-txt').textContent = `¡Hola, ${nombre.split(' ')[0]}!`;
  document.getElementById('header-avatar').textContent = u.avatar || '🦋';
  document.getElementById('saludo-inicio').textContent = `👋 ¡Hola, ${nombre.split(' ')[0]}!`;

  // El botón de avanzar semana solo lo muestra el psicólogo
  // (o podemos mostrarlo siempre para demo)
  // En producción, esto lo controla el psicólogo
  document.getElementById('btn-avanzar-semana').style.display = 'flex';

  // Mostrar sección inicio como activa
  irSeccion('inicio');
  document.querySelectorAll('#nav-nino .nav-btn').forEach((b,i) => {
    b.classList.remove('activo');
    if (i === 0) b.classList.add('activo');
  });

  renderTodo();
  actualizarSemana();
  actualizarAutoestima();
}

// ===== INICIAR APP PSICÓLOGO =====
async function iniciarAppPsicologo() {
  document.getElementById('pantalla-carga').style.display = 'none';
  document.getElementById('pantalla-login').style.display = 'none';
  document.getElementById('app').style.display = 'block';
  document.getElementById('nav-nino').style.display = 'none';
  document.getElementById('nav-psicologo').style.display = 'flex';

  const u = estadoApp.usuario;
  document.getElementById('header-nombre-txt').textContent = `Dr. ${u.nombre?.split(' ')[0] || 'Psicólogo'}`;
  document.getElementById('header-avatar').textContent = '🩺';
  document.getElementById('dash-welcome').textContent = `Bienvenido/a, ${u.nombre || 'Psicólogo'}`;
  document.getElementById('btn-avanzar-semana').style.display = 'none';

  irSeccion('dash-inicio');
  document.querySelectorAll('#nav-psicologo .nav-btn').forEach((b,i) => {
    b.classList.remove('activo');
    if (i === 0) b.classList.add('activo');
  });

  await cargarPacientes();
  renderDashboard();
}

// ===== CERRAR SESIÓN =====
async function cerrarSesion() {
  await auth.signOut();
  estadoApp = { usuario: null, pacienteId: null, rol: null, semana: 1,
    datos: { cualidad: [], habilidad: [], 'me-gusta': [], aprendiendo: [],
             logro: [], supere: [], 'quiero-intentar': [],
             momento: [], ayude: [], problema: [], compartir: [], emocion: [] },
    fortalezasIniciales: [], pacienteActual: null };
  document.getElementById('app').style.display = 'none';
  document.getElementById('pantalla-login').style.display = 'block';
  document.getElementById('login-user').value = '';
  document.getElementById('login-pass').value = '';
  document.getElementById('login-error').style.display = 'none';
}

// ===== NAVEGACIÓN =====
function ir(seccion, btn) {
  irSeccion(seccion);
  const nav = estadoApp.rol === 'psicologo' ? '#nav-psicologo' : '#nav-nino';
  document.querySelectorAll(`${nav} .nav-btn`).forEach(b => b.classList.remove('activo'));
  if (btn) btn.classList.add('activo');
}

function irSeccion(id) {
  document.querySelectorAll('.seccion').forEach(s => s.classList.remove('activa'));
  const el = document.getElementById(id);
  if (el) el.classList.add('activa');
}

// ===== EMOJI SELECTOR =====
function selEmoji(el, key) {
  el.closest('.emoji-picker').querySelectorAll('.emoji-op').forEach(e => e.classList.remove('sel'));
  el.classList.add('sel');
  emojisSeleccionados[key] = el.textContent;
}

// ===== SUBCATEGORÍAS =====
function setCatP1(cat, btn) {
  catActualP1.val = cat;
  btn.closest('div').querySelectorAll('.estrategia-btn').forEach(b => b.classList.remove('sel'));
  btn.classList.add('sel');
  const configs = {
    cualidad: { titulo: '➕ Agregar una cualidad', lbl: '¿Cuál es tu cualidad especial?', ph: 'Ej: Soy muy creativa...', emoji: '💎' },
    habilidad: { titulo: '➕ Agregar una habilidad', lbl: '¿Qué sabes hacer bien?', ph: 'Ej: Soy buena ayudando...', emoji: '⚡' },
    'me-gusta': { titulo: '➕ Lo que me gusta de mí', lbl: '¿Qué te gusta de ti mismo/a?', ph: 'Ej: Me gusta cómo soy amable...', emoji: '❤️' },
    aprendiendo: { titulo: '➕ Algo que estoy aprendiendo', lbl: '¿Qué estás aprendiendo?', ph: 'Ej: Estoy aprendiendo a nadar...', emoji: '🌱' },
  };
  const c = configs[cat];
  document.getElementById('p1-form-titulo').textContent = c.titulo;
  document.getElementById('p1-form-lbl').textContent = c.lbl;
  document.getElementById('p1-texto').placeholder = c.ph;
  emojisSeleccionados.p1 = c.emoji;
  document.querySelector('#emoji-p1 .emoji-op.sel')?.classList.remove('sel');
  document.querySelector('#emoji-p1 .emoji-op').classList.add('sel');
  renderGridP1();
}

function setCatP2(cat, btn) {
  catActualP2.val = cat;
  btn.closest('div').querySelectorAll('.estrategia-btn').forEach(b => b.classList.remove('sel'));
  btn.classList.add('sel');
  const configs = {
    logro: { titulo: '➕ Agregar un logro', lbl: '¿Cuál fue tu logro?', ph: 'Ej: Saqué buena nota...', emoji: '🏆' },
    supere: { titulo: '➕ Algo que superé', lbl: '¿Qué fue difícil y lograste?', ph: 'Ej: Me costó mucho pero...', emoji: '💪' },
    'quiero-intentar': { titulo: '➕ Quiero intentar', lbl: '¿Qué quieres intentar?', ph: 'Ej: Quiero aprender a...', emoji: '🚀' },
  };
  const c = configs[cat];
  document.getElementById('p2-form-titulo').textContent = c.titulo;
  document.getElementById('p2-form-lbl').textContent = c.lbl;
  document.getElementById('p2-texto').placeholder = c.ph;
  emojisSeleccionados.p2 = c.emoji;
  renderGridP2();
}

function setCatP3(cat, btn) {
  catActualP3.val = cat;
  btn.closest('div').querySelectorAll('.estrategia-btn').forEach(b => b.classList.remove('sel'));
  btn.classList.add('sel');
  const configs = {
    momento: { titulo: '➕ Guardar un momento feliz', lbl: '¿Qué pasó?', ph: 'Cuéntame sobre ese momento especial...', emoji: '😊' },
    ayude: { titulo: '➕ Ayudé a alguien', lbl: '¿A quién ayudaste y cómo?', ph: 'Ej: Ayudé a mi amigo con...', emoji: '🤝' },
    problema: { titulo: '➕ Resolví un problema', lbl: '¿Qué problema resolviste?', ph: 'Ej: Cuando peleé con... decidí...', emoji: '🧩' },
    compartir: { titulo: '➕ Compartí con otros', lbl: '¿Con quién compartiste?', ph: 'Ej: Hoy compartí mis colores con...', emoji: '🎉' },
  };
  const c = configs[cat];
  document.getElementById('p3-form-titulo').textContent = c.titulo;
  document.getElementById('p3-form-lbl').textContent = c.lbl;
  document.getElementById('p3-texto').placeholder = c.ph;
  emojisSeleccionados.p3 = c.emoji;
  renderGridP3();
}

// ===== EMOCIÓN =====
function selEmocion(btn, emoji, nombre) {
  document.querySelectorAll('.emocion-btn').forEach(b => b.classList.remove('sel'));
  btn.classList.add('sel');
  emocionSeleccionada = { emoji, nombre };
  // Mostrar opciones de calma si emoción negativa
  const negativas = ['😟','😢','😠','😨'];
  document.getElementById('calma-grupo').style.display =
    negativas.includes(emoji) ? 'block' : 'none';
}

function selCalma(btn) {
  document.querySelectorAll('.estrategia-btn').forEach(b => b.classList.remove('sel'));
  btn.classList.add('sel');
  calmaSeleccionada = btn.textContent.trim();
}

// ===== GUARDAR REGISTROS =====
async function guardarEntrada(categoria, texto, emoji, extra = {}) {
  if (!texto) { mostrarToast('✏️ ¡Escribe algo primero!'); return false; }

  setSyncStatus('syncing');

  const entrada = {
    categoria,
    texto,
    emoji,
    semana: estadoApp.semana,
    fecha: firebase.firestore.Timestamp.now(),
    fechaStr: new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }),
    pacienteId: estadoApp.pacienteId,
    ...extra
  };

  // Actualizar local inmediatamente
  if (!estadoApp.datos[categoria]) estadoApp.datos[categoria] = [];
  const entradaLocal = { ...entrada, id: 'tmp_' + Date.now() };
  estadoApp.datos[categoria].unshift(entradaLocal);
  guardarBackupLocal();

  // Guardar en Firestore
  try {
    const ref = await db.collection('registros').doc(estadoApp.pacienteId)
      .collection('items').add(entrada);
    // Actualizar ID local
    estadoApp.datos[categoria][0].id = ref.id;
    setSyncStatus('synced');

    // Actualizar progreso
    actualizarProgreso();
  } catch (e) {
    console.warn('Error guardando en Firebase, guardado en backup:', e);
    setSyncStatus('error');
  }

  return true;
}

async function actualizarProgreso() {
  try {
    const total = getTotalEntradas();
    await db.collection('avance').doc(estadoApp.pacienteId).set({
      semanaActual: estadoApp.semana,
      totalRegistros: total,
      ultimaActualizacion: firebase.firestore.Timestamp.now()
    }, { merge: true });
  } catch(e) { /* offline */ }
}

function getTotalEntradas() {
  return Object.values(estadoApp.datos).reduce((a, arr) => a + (arr?.length || 0), 0);
}

// ===== GUARDAR PILAR 1 =====
async function guardarP1() {
  const texto = document.getElementById('p1-texto').value.trim();
  const cat = catActualP1.val;
  const ok = await guardarEntrada(cat, texto, emojisSeleccionados.p1);
  if (ok) {
    document.getElementById('p1-texto').value = '';
    renderGridP1();
    actualizarStats();
    actualizarAutoestima();
    actualizarFraseDinamica();
    mostrarToast(`${emojisSeleccionados.p1} ¡Guardado en tu álbum!`);
    celebrar();
  }
}

// ===== GUARDAR PILAR 2 =====
async function guardarP2() {
  const texto = document.getElementById('p2-texto').value.trim();
  const cat = catActualP2.val;
  const ok = await guardarEntrada(cat, texto, emojisSeleccionados.p2);
  if (ok) {
    document.getElementById('p2-texto').value = '';
    renderGridP2();
    actualizarStats();
    actualizarAutoestima();
    mostrarToast(`${emojisSeleccionados.p2} ¡Guardado en tu álbum!`);
    celebrar();
  }
}

// ===== GUARDAR PILAR 3 =====
async function guardarP3() {
  const texto = document.getElementById('p3-texto').value.trim();
  const cat = catActualP3.val;
  const ok = await guardarEntrada(cat, texto, emojisSeleccionados.p3);
  if (ok) {
    document.getElementById('p3-texto').value = '';
    renderGridP3();
    actualizarStats();
    mostrarToast(`${emojisSeleccionados.p3} ¡Guardado en tu álbum!`);
    celebrar();
  }
}

// ===== GUARDAR PILAR 4 =====
async function guardarP4() {
  if (!emocionSeleccionada) { mostrarToast('😊 ¡Elige cómo te sientes hoy!'); return; }

  const contexto = document.getElementById('p4-contexto').value.trim();
  const plan = document.getElementById('p4-plan').value.trim();
  const texto = `${emocionSeleccionada.nombre}${contexto ? ' — ' + contexto : ''}${plan ? ' | Plan: ' + plan : ''}`;

  const extra = {
    emocionEmoji: emocionSeleccionada.emoji,
    emocionNombre: emocionSeleccionada.nombre,
    contexto,
    calma: calmaSeleccionada,
    plan
  };

  const ok = await guardarEntrada('emocion', texto, emocionSeleccionada.emoji, extra);
  if (ok) {
    document.getElementById('p4-contexto').value = '';
    document.getElementById('p4-plan').value = '';
    document.querySelectorAll('.emocion-btn').forEach(b => b.classList.remove('sel'));
    document.querySelectorAll('#mente-fuerte .estrategia-btn').forEach(b => b.classList.remove('sel'));
    document.getElementById('calma-grupo').style.display = 'none';
    emocionSeleccionada = null;
    calmaSeleccionada = null;
    renderGridP4();
    actualizarStats();
    mostrarToast('🧠 ¡Tu día guardado!');
    celebrar();
  }
}

// ===== ELIMINAR ENTRADA =====
async function eliminar(categoria, id) {
  estadoApp.datos[categoria] = (estadoApp.datos[categoria] || []).filter(i => i.id !== id);
  guardarBackupLocal();
  renderTodo();
  actualizarStats();

  // Eliminar de Firestore
  try {
    if (!id.startsWith('tmp_')) {
      await db.collection('registros').doc(estadoApp.pacienteId)
        .collection('items').doc(id).delete();
    }
  } catch(e) { console.warn('Error eliminando:', e); }
}

// ===== FORTALEZAS INICIALES =====
async function agregarFortalezaInicial() {
  const input = document.getElementById('fi-input');
  const texto = input.value.trim();
  if (!texto) { mostrarToast('✏️ Escribe una fortaleza'); return; }
  if (estadoApp.fortalezasIniciales.length >= 3) {
    mostrarToast('✨ ¡Ya tienes tus 3 fortalezas iniciales!'); return;
  }
  estadoApp.fortalezasIniciales.push(texto);
  input.value = '';
  renderFortalezasIniciales();
  guardarBackupLocal();
  mostrarToast('💎 ¡Primera fortaleza guardada!');
  celebrar();

  try {
    await db.collection('fortalezas_iniciales').doc(estadoApp.pacienteId).set({
      lista: estadoApp.fortalezasIniciales,
      actualizado: firebase.firestore.Timestamp.now()
    });
  } catch(e) { console.warn('Error guardando fortaleza inicial:', e); }
}

// ===== SEMANA =====
async function avanzarSemana() {
  if (estadoApp.semana < 8) {
    estadoApp.semana++;
    guardarBackupLocal();
    actualizarSemana();
    mostrarToast('📅 ¡Nueva semana! ¡Sigues creciendo! 🌟');

    try {
      await db.collection('avance').doc(estadoApp.pacienteId).set({
        semanaActual: estadoApp.semana,
        ultimaActualizacion: firebase.firestore.Timestamp.now()
      }, { merge: true });
    } catch(e) { console.warn('Error actualizando semana:', e); }
  }
}

function actualizarSemana() {
  const s = estadoApp.semana;
  document.getElementById('semana-num').textContent = s;
  document.getElementById('semana-meta-txt').textContent = `Semana ${s} de 8`;
  document.getElementById('header-semana-badge').textContent = `S${s}`;
  document.getElementById('header-progress').style.width = `${(s/8)*100}%`;

  const fases = ['','🌱 Descubriendo mi identidad','🌿 Conociendo mis fortalezas',
    '🌸 Usando mis logros','💪 ¡Cada vez más fuerte!',
    '🤝 Compartiendo y conectando','👨‍👩‍👧 Mi familia me ve crecer',
    '⭐ ¡Soy mi propio fan!','🎉 ¡Completé el programa!'];
  document.getElementById('semana-fase-txt').textContent = fases[s] || fases[8];
  document.getElementById('barra-semana').style.width = `${(s/8)*100}%`;

  // Fases
  const fasesInfo = [
    { nombre: '🌱 Identidad (S1-2)', desde: 1, hasta: 2 },
    { nombre: '🌸 Competencia (S3-4)', desde: 3, hasta: 4 },
    { nombre: '🤝 Relaciones (S5-6)', desde: 5, hasta: 6 },
    { nombre: '🏆 Autonomía (S7-8)', desde: 7, hasta: 8 },
  ];
  document.getElementById('fases-container').innerHTML = fasesInfo.map(f => {
    const clase = s > f.hasta ? 'completada' : s >= f.desde ? 'actual' : 'pendiente';
    const icon = clase === 'completada' ? '✅' : clase === 'actual' ? '▶️' : '⏳';
    return `<div class="fase-chip ${clase}">${icon} ${f.nombre}</div>`;
  }).join('');

  // Desbloquear reestructuración en semana 3
  const retoEl = document.getElementById('reto-contenido');
  const bloqMsg = document.getElementById('reto-bloqueo-msg');
  if (retoEl) {
    if (s >= 3) {
      retoEl.style.opacity = '1';
      retoEl.style.pointerEvents = 'auto';
      bloqMsg.textContent = '';
    } else {
      retoEl.style.opacity = '0.4';
      retoEl.style.pointerEvents = 'none';
      bloqMsg.textContent = `(Disponible en semana 3 — estás en semana ${s})`;
    }
  }
}

// ===== RENDER GRIDS =====
function renderTodo() {
  renderGridP1();
  renderGridP2();
  renderGridP3();
  renderGridP4();
  renderFortalezasIniciales();
  actualizarStats();
  actualizarFraseDinamica();
}

function crearTarjeta(item, tipo) {
  const div = document.createElement('div');
  div.className = `tarjeta ${tipo}`;
  div.innerHTML = `
    <button class="btn-del" onclick="eliminar('${tipo}','${item.id}')">🗑️</button>
    <span class="tarjeta-emoji">${item.emoji}</span>
    <div class="tarjeta-texto">${sanitize(item.texto)}</div>
    <div class="tarjeta-fecha">${item.fechaStr || ''}</div>
    <span class="tarjeta-semana">Semana ${item.semana || 1}</span>
  `;
  return div;
}

function sanitize(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function renderGrid(gridId, vacioId, items, tipo) {
  const grid = document.getElementById(gridId);
  const vacio = document.getElementById(vacioId);
  if (!grid) return;
  grid.innerHTML = '';
  if (!items || items.length === 0) {
    vacio.style.display = 'block';
    grid.style.display = 'none';
    return;
  }
  vacio.style.display = 'none';
  grid.style.display = 'grid';
  items.forEach(item => grid.appendChild(crearTarjeta(item, tipo)));
}

function renderGridP1() {
  const cat = catActualP1.val;
  const items = estadoApp.datos[cat] || [];
  renderGrid('grid-p1', 'vacio-p1', items, cat);
}

function renderGridP2() {
  const cat = catActualP2.val;
  const items = estadoApp.datos[cat] || [];
  renderGrid('grid-p2', 'vacio-p2', items, 'logro');
}

function renderGridP3() {
  const cat = catActualP3.val;
  const items = estadoApp.datos[cat] || [];
  renderGrid('grid-p3', 'vacio-p3', items, 'social');
}

function renderGridP4() {
  const items = estadoApp.datos['emocion'] || [];
  const grid = document.getElementById('grid-p4');
  const vacio = document.getElementById('vacio-p4');
  if (!grid) return;
  grid.innerHTML = '';
  if (!items.length) {
    vacio.style.display = 'block'; grid.style.display = 'none'; return;
  }
  vacio.style.display = 'none'; grid.style.display = 'grid';
  items.forEach(item => {
    const div = document.createElement('div');
    div.className = 'tarjeta emocion';
    div.innerHTML = `
      <button class="btn-del" onclick="eliminar('emocion','${item.id}')">🗑️</button>
      <span class="tarjeta-emoji">${item.emoji}</span>
      <div class="tarjeta-texto">${sanitize(item.emocionNombre || item.texto)}</div>
      ${item.contexto ? `<div class="tarjeta-meta" style="color:#888;font-size:0.82rem">${sanitize(item.contexto.substring(0,60))}${item.contexto.length>60?'...':''}</div>` : ''}
      ${item.calma ? `<div class="tarjeta-meta" style="color:var(--verde);font-size:0.78rem">🌬️ ${sanitize(item.calma)}</div>` : ''}
      ${item.plan ? `<div class="tarjeta-meta" style="color:var(--morado);font-size:0.78rem">📋 ${sanitize(item.plan)}</div>` : ''}
      <div class="tarjeta-fecha">${item.fechaStr || ''}</div>
      <span class="tarjeta-semana">Semana ${item.semana || 1}</span>
    `;
    grid.appendChild(div);
  });
}

function renderFortalezasIniciales() {
  const cont = document.getElementById('cont-fortalezas-iniciales');
  if (!cont) return;
  const forts = estadoApp.fortalezasIniciales;
  if (!forts.length) {
    cont.innerHTML = '<div class="evidencia-item" style="color:#bbb;font-style:italic">💭 ¡Las agregaremos juntos en la primera sesión!</div>';
    return;
  }
  const emojis = ['💎', '⭐', '🌸'];
  cont.innerHTML = forts.map((f, i) =>
    `<div class="evidencia-item">${emojis[i] || '✨'} ${sanitize(f)}</div>`
  ).join('');

  // Ocultar input si ya tiene 3
  if (forts.length >= 3) {
    const row = document.getElementById('fi-row');
    if (row) row.style.display = 'none';
  }
}

// ===== ESTADÍSTICAS =====
function actualizarStats() {
  const d = estadoApp.datos;
  const cat = (arr) => arr?.length || 0;
  const cualidades = cat(d.cualidad) + cat(d.habilidad) + cat(d['me-gusta']) + cat(d.aprendiendo);
  const logros = cat(d.logro) + cat(d.supere) + cat(d['quiero-intentar']);
  const social = cat(d.momento) + cat(d.ayude) + cat(d.problema) + cat(d.compartir);
  const emociones = cat(d.emocion);
  const total = cualidades + logros + social + emociones;

  setEl('st-cualidad', cualidades);
  setEl('st-logro', logros);
  setEl('st-habilidad', cat(d.habilidad));
  setEl('st-social', social);
  setEl('st-emocion', emociones);
  setEl('st-total', total);
}

function setEl(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function actualizarAutoestima() {
  const d = estadoApp.datos;
  const positivos = (d.cualidad?.length || 0) + (d['me-gusta']?.length || 0) +
    (d.logro?.length || 0) + (d.supere?.length || 0) + estadoApp.fortalezasIniciales.length;
  const nivel = Math.min(10, positivos);
  document.querySelectorAll('.autoestima-seg').forEach((seg, i) => {
    seg.classList.toggle('activo', i < nivel);
  });
}

// ===== FRASE DINÁMICA =====
function actualizarFraseDinamica() {
  const todas = [];
  ['cualidad','habilidad','me-gusta','aprendiendo','logro','supere'].forEach(cat => {
    (estadoApp.datos[cat] || []).forEach(e => todas.push(e.texto));
  });
  estadoApp.fortalezasIniciales.forEach(f => todas.push(f));
  const el = document.getElementById('frase-dinamica');
  if (todas.length > 0 && el) {
    const rand = todas[Math.floor(Math.random() * todas.length)];
    el.textContent = `✨ "${rand.substring(0, 60)}${rand.length > 60 ? '...' : ''}"`;
  }
}

// ===== REESTRUCTURACIÓN COGNITIVA =====
function reestructurar() {
  const sel = document.getElementById('pens-select').value;
  if (!sel) { mostrarToast('💭 Elige un pensamiento primero'); return; }

  const transformaciones = {
    no_puedo: { neg: '"No puedo hacer esto"', pos: '¡Puedo intentarlo! Antes tampoco sabía cosas que ahora sé 💪', buscar: ['logro','habilidad','supere'] },
    no_soy_bueno: { neg: '"No soy bueno/a en nada"', pos: '¡Mi álbum tiene evidencia de todo lo que hago bien! 🌟', buscar: ['logro','habilidad','cualidad'] },
    no_me_gusto: { neg: '"No me gusto cómo soy"', pos: 'Tengo cualidades muy especiales que me hacen único/a ✨', buscar: ['cualidad','me-gusta'] },
    no_me_quieren: { neg: '"Nadie me quiere"', pos: 'Tengo personas que me acompañan y momentos felices que lo prueban ❤️', buscar: ['momento','compartir'] },
    soy_tonto: { neg: '"Soy tonto/a"', pos: '¡He logrado muchas cosas que demuestran que soy inteligente y capaz! 🧠', buscar: ['logro','habilidad','aprendiendo'] },
    todo_mal: { neg: '"Todo me sale mal"', pos: '¡Tengo logros reales que demuestran lo contrario! Veámoslos 🏆', buscar: ['logro','supere','cualidad'] },
    no_tengo_amigos: { neg: '"No tengo amigos"', pos: 'He tenido momentos especiales con otras personas ¡aquí están! 🤝', buscar: ['momento','ayude','compartir'] },
  };

  const t = transformaciones[sel];
  document.getElementById('pens-neg').textContent = t.neg;
  document.getElementById('pens-pos').textContent = t.pos;

  const evidencias = [];
  t.buscar.forEach(cat => {
    (estadoApp.datos[cat] || []).slice(0, 2).forEach(e => {
      evidencias.push(`${e.emoji} ${e.texto}`);
    });
  });
  estadoApp.fortalezasIniciales.forEach(f => evidencias.push(`💎 ${f}`));

  const cont = document.getElementById('evidencias-reto');
  if (evidencias.length === 0) {
    cont.innerHTML = '<div class="evidencia-item">📝 ¡Agrega más cosas a tu álbum para ver evidencia aquí!</div>';
  } else {
    cont.innerHTML = evidencias.slice(0, 5).map(e =>
      `<div class="evidencia-item">${sanitize(e)}</div>`
    ).join('');
  }

  document.getElementById('resultado-reto').style.display = 'block';
  document.getElementById('resultado-reto').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  celebrar();
}

// ===== PSICÓLOGO — PACIENTES =====
let pacientesCache = [];

async function cargarPacientes() {
  try {
    const snap = await db.collection('pacientes')
      .where('terapeutaId', '==', estadoApp.usuario.uid)
      .orderBy('nombre').get();

    pacientesCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderPacientes();
    renderDashboard();
  } catch(e) {
    console.error('Error cargando pacientes:', e);
    document.getElementById('lista-pacientes').innerHTML =
      '<div style="padding:20px;text-align:center;color:#888">Error cargando pacientes. Verifica conexión.</div>';
  }
}

function renderPacientes() {
  const cont = document.getElementById('lista-pacientes');
  if (!cont) return;
  if (!pacientesCache.length) {
    cont.innerHTML = `
      <div style="padding:40px;text-align:center;color:#bbb">
        <div style="font-size:48px;margin-bottom:12px">👥</div>
        <p style="font-weight:700">Aún no tienes pacientes.<br>¡Crea el primero!</p>
      </div>`;
    return;
  }
  cont.innerHTML = '';
  pacientesCache.forEach(p => {
    const card = document.createElement('div');
    card.className = 'paciente-card';
    const semana = p.semanaActual || 1;
    const total = p.totalRegistros || 0;
    card.innerHTML = `
      <div class="paciente-avatar">${p.avatar || '🦋'}</div>
      <div class="paciente-nombre">${sanitize(p.nombre)}</div>
      <div class="paciente-edad">${p.edad ? p.edad + ' años' : ''} · Semana ${semana}/8</div>
      <div class="barra-wrap" style="margin-bottom:10px">
        <div class="barra-fill" style="width:${(semana/8)*100}%"></div>
      </div>
      <div class="paciente-stats-row">
        <span class="mini-stat">📝 ${total} registros</span>
        <span class="mini-stat">S${semana}/8</span>
      </div>
      <button class="btn-ver-paciente" onclick="verPaciente('${p.id}')">
        📋 Ver progreso completo
      </button>
    `;
    cont.appendChild(card);
  });
}

async function verPaciente(pacienteId) {
  const paciente = pacientesCache.find(p => p.id === pacienteId);
  if (!paciente) return;

  // Cargar datos del paciente
  const datos = { cualidad: [], habilidad: [], 'me-gusta': [], aprendiendo: [],
    logro: [], supere: [], 'quiero-intentar': [], momento: [], ayude: [],
    problema: [], compartir: [], emocion: [] };

  try {
    const registros = await db.collection('registros').doc(pacienteId)
      .collection('items').orderBy('fecha', 'desc').limit(200).get();
    registros.forEach(doc => {
      const d = doc.data();
      if (datos[d.categoria] !== undefined) datos[d.categoria].push({ id: doc.id, ...d });
    });
  } catch(e) { console.warn('Error cargando datos paciente:', e); }

  let fortalezasIniciales = [];
  try {
    const fDoc = await db.collection('fortalezas_iniciales').doc(pacienteId).get();
    if (fDoc.exists) fortalezasIniciales = fDoc.data().lista || [];
  } catch(e) {}

  estadoApp.pacienteActual = { ...paciente, datos, fortalezasIniciales };

  renderPerfilPaciente(paciente, datos, fortalezasIniciales);
  ir('perfil-paciente', null);

  // Activar tab
  document.querySelectorAll('#nav-psicologo .nav-btn').forEach((b,i) => {
    b.classList.toggle('activo', i === 2);
  });
}

function renderPerfilPaciente(p, datos, fortalezasIniciales) {
  const cont = document.getElementById('perfil-contenido');
  const semana = p.semanaActual || 1;

  const cats = [
    { key: ['cualidad','habilidad','me-gusta','aprendiendo'], label: '💎 Yo Soy Especial', color: 'var(--rosa)' },
    { key: ['logro','supere','quiero-intentar'], label: '🎯 Soy Capaz', color: 'var(--amarillo)' },
    { key: ['momento','ayude','problema','compartir'], label: '❤️ Me Conecto', color: 'var(--verde)' },
    { key: ['emocion'], label: '🧠 Mi Mente', color: 'var(--morado)' },
  ];

  const maxTotal = Math.max(1, ...cats.map(c => c.key.reduce((a, k) => a + (datos[k]?.length || 0), 0)));

  cont.innerHTML = `
    <div style="display:flex;align-items:center;gap:16px;margin-bottom:24px;flex-wrap:wrap">
      <div style="width:60px;height:60px;border-radius:50%;background:linear-gradient(135deg,var(--morado),var(--rosa));display:flex;align-items:center;justify-content:center;font-size:28px">
        ${p.avatar || '🦋'}
      </div>
      <div>
        <div style="font-family:'Baloo 2',cursive;font-size:1.5rem;font-weight:800;color:var(--texto)">${sanitize(p.nombre)}</div>
        <div style="color:#888;font-size:0.9rem;font-weight:600">${p.edad ? p.edad + ' años' : ''} · Semana ${semana}/8 del programa</div>
      </div>
    </div>

    <!-- Progreso general -->
    <div class="semana-widget" style="margin-bottom:20px">
      <div class="semana-num" style="color:var(--morado)">${semana}</div>
      <div class="semana-info">
        <div class="semana-lbl">Semana actual</div>
        <div class="semana-fase-txt" style="font-size:0.9rem">Progreso del programa</div>
        <div class="barra-wrap"><div class="barra-fill" style="width:${(semana/8)*100}%"></div></div>
      </div>
      <button class="btn-semana" onclick="avanzarSemanaP('${p.id}')">+1 Semana</button>
    </div>

    <!-- Stats generales -->
    <div class="stats-grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:20px">
      ${cats.map(c => {
        const total = c.key.reduce((a, k) => a + (datos[k]?.length || 0), 0);
        return `<div class="stat-card">
          <div class="stat-num" style="color:${c.color}">${total}</div>
          <div class="stat-lbl">${c.label}</div>
        </div>`;
      }).join('')}
    </div>

    <!-- Gráfico por área -->
    <div class="dash-chart" style="margin-bottom:20px">
      <div class="dash-chart-titulo">📊 Registros por área</div>
      ${cats.map(c => {
        const total = c.key.reduce((a, k) => a + (datos[k]?.length || 0), 0);
        const pct = Math.round((total / maxTotal) * 100);
        return `<div class="barra-cat">
          <div class="barra-cat-lbl">${c.label}</div>
          <div class="barra-cat-track">
            <div class="barra-cat-fill" style="width:${pct}%;background:${c.color}"></div>
          </div>
          <div class="barra-cat-num">${total}</div>
        </div>`;
      }).join('')}
    </div>

    <!-- Fortalezas iniciales -->
    ${fortalezasIniciales.length > 0 ? `
    <div class="caja-primera" style="margin-bottom:20px">
      <div class="caja-primera-titulo">💡 Fortalezas de sesión 1</div>
      ${fortalezasIniciales.map(f => `<div class="evidencia-item">💎 ${sanitize(f)}</div>`).join('')}
    </div>` : ''}

    <!-- Emociones registradas -->
    ${datos.emocion?.length > 0 ? `
    <div class="dash-chart" style="margin-bottom:20px">
      <div class="dash-chart-titulo">😊 Últimas emociones registradas</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${datos.emocion.slice(0,10).map(e => `
          <div style="background:#F7F3FF;border-radius:12px;padding:8px 12px;font-size:0.82rem;font-weight:700;color:var(--texto)">
            ${e.emoji} ${sanitize(e.emocionNombre || e.texto.substring(0,20))}
            <span style="color:#bbb;font-size:0.72rem;margin-left:4px">${e.fechaStr || ''}</span>
          </div>
        `).join('')}
      </div>
    </div>` : ''}

    <!-- Últimos logros -->
    ${(datos.logro?.length > 0 || datos.supere?.length > 0) ? `
    <div class="dash-chart">
      <div class="dash-chart-titulo">🏆 Últimos logros</div>
      ${[...(datos.logro || []), ...(datos.supere || [])].slice(0,4).map(e => `
        <div class="evidencia-item">${e.emoji} ${sanitize(e.texto)} <span style="color:#bbb;margin-left:auto;font-size:0.72rem">${e.fechaStr || ''}</span></div>
      `).join('')}
    </div>` : ''}
  `;
}

async function avanzarSemanaP(pacienteId) {
  const pac = pacientesCache.find(p => p.id === pacienteId);
  if (!pac) return;
  const nuevaSemana = Math.min(8, (pac.semanaActual || 1) + 1);
  pac.semanaActual = nuevaSemana;

  try {
    await db.collection('avance').doc(pacienteId).set({
      semanaActual: nuevaSemana,
      ultimaActualizacion: firebase.firestore.Timestamp.now()
    }, { merge: true });
    await db.collection('pacientes').doc(pacienteId).update({ semanaActual: nuevaSemana });

    mostrarToast(`📅 Semana ${nuevaSemana} activada para ${pac.nombre.split(' ')[0]}`);
    // Recargar vista
    await verPaciente(pacienteId);
  } catch(e) {
    mostrarToast('❌ Error al avanzar semana');
    console.error(e);
  }
}

// ===== DASHBOARD =====
function renderDashboard() {
  setEl('ds-total-pac', pacientesCache.length);

  const totalReg = pacientesCache.reduce((a, p) => a + (p.totalRegistros || 0), 0);
  setEl('ds-total-reg', totalReg);

  const promSemana = pacientesCache.length > 0
    ? Math.round(pacientesCache.reduce((a, p) => a + (p.semanaActual || 1), 0) / pacientesCache.length)
    : 0;
  setEl('ds-semana-prom', promSemana);

  // Pacientes rápido
  const quickCont = document.getElementById('dash-pacientes-rapido');
  if (quickCont) {
    if (!pacientesCache.length) {
      quickCont.innerHTML = '<div style="text-align:center;padding:20px;color:#bbb;font-weight:600">Crea tu primer paciente en el panel de Pacientes</div>';
    } else {
      quickCont.innerHTML = `<div class="pacientes-grid">
        ${pacientesCache.slice(0, 4).map(p => `
          <div class="paciente-card" onclick="verPaciente('${p.id}')">
            <div class="paciente-avatar">${p.avatar || '🦋'}</div>
            <div class="paciente-nombre">${sanitize(p.nombre)}</div>
            <div class="paciente-edad">${p.edad ? p.edad + ' años' : ''}</div>
            <div class="paciente-stats-row">
              <span class="mini-stat">S${p.semanaActual || 1}/8</span>
              <span class="mini-stat">📝 ${p.totalRegistros || 0}</span>
            </div>
          </div>
        `).join('')}
      </div>`;
    }
  }
}

// ===== CREAR PACIENTE =====
function abrirModalPaciente() {
  document.getElementById('modal-paciente').classList.add('visible');
}

function cerrarModal() {
  document.getElementById('modal-paciente').classList.remove('visible');
  ['m-nombre','m-edad','m-usuario','m-pass'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.getElementById('modal-error').style.display = 'none';
}

async function crearPaciente() {
  const nombre = document.getElementById('m-nombre').value.trim();
  const edad = document.getElementById('m-edad').value.trim();
  const username = document.getElementById('m-usuario').value.trim().toLowerCase();
  const pass = document.getElementById('m-pass').value;
  const avatar = emojisSeleccionados.avatar || '🦋';
  const errEl = document.getElementById('modal-error');
  errEl.style.display = 'none';

  if (!nombre || !username || !pass) {
    mostrarError(errEl, '❌ Completa nombre, usuario y contraseña'); return;
  }
  if (pass.length < 6) {
    mostrarError(errEl, '❌ La contraseña debe tener al menos 6 caracteres'); return;
  }

  // Verificar que username no existe
  try {
    const snap = await db.collection('usuarios_username').where('username', '==', username).limit(1).get();
    if (!snap.empty) {
      mostrarError(errEl, '❌ Ese nombre de usuario ya existe'); return;
    }
  } catch(e) {}

  const email = `${username}@album-fortalezas.app`;

  try {
    // Crear usuario en Firebase Auth
    // Usamos REST API para crear sin iniciar sesión
    const resp = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${firebaseConfig.apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: pass, returnSecureToken: false })
    });
    const respData = await resp.json();

    if (respData.error) {
      mostrarError(errEl, '❌ Error al crear usuario: ' + (respData.error.message || '')); return;
    }

    const uid = respData.localId;

    // Guardar perfil en Firestore
    await db.collection('usuarios').doc(uid).set({
      nombre, edad: parseInt(edad) || null,
      rol: 'nino', avatar,
      terapeutaId: estadoApp.usuario.uid,
      creado: firebase.firestore.Timestamp.now()
    });

    // Guardar en colección usuarios_username para el login
    await db.collection('usuarios_username').add({ username, email, uid });

    // Guardar en colección pacientes (referencia del terapeuta)
    await db.collection('pacientes').doc(uid).set({
      nombre, edad: parseInt(edad) || null,
      avatar, terapeutaId: estadoApp.usuario.uid,
      semanaActual: 1, totalRegistros: 0,
      creado: firebase.firestore.Timestamp.now()
    });

    // Inicializar avance
    await db.collection('avance').doc(uid).set({
      semanaActual: 1,
      totalRegistros: 0,
      ultimaActualizacion: firebase.firestore.Timestamp.now()
    });

    cerrarModal();
    mostrarToast(`🎉 ¡${nombre} creado exitosamente!`);
    celebrar();
    await cargarPacientes();

  } catch(e) {
    console.error('Error creando paciente:', e);
    mostrarError(errEl, '❌ Error al crear el paciente. Intenta de nuevo.');
  }
}

// ===== SYNC STATUS =====
function setSyncStatus(status) {
  const dot = document.getElementById('sync-dot');
  const txt = document.getElementById('sync-txt');
  if (!dot || !txt) return;
  if (status === 'syncing') {
    dot.classList.add('syncing');
    txt.textContent = 'Guardando...';
  } else if (status === 'synced') {
    dot.classList.remove('syncing');
    dot.style.background = 'var(--verde)';
    txt.textContent = 'Guardado ✓';
  } else {
    dot.classList.remove('syncing');
    dot.style.background = 'var(--amarillo)';
    txt.textContent = 'Sin conexión';
  }
}

// ===== TOAST =====
function mostrarToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('visible');
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => t.classList.remove('visible'), 2800);
}

// ===== CELEBRACIÓN =====
function celebrar() {
  const c = document.getElementById('confeti');
  const colores = ['#FF6B9D','#6C3DE8','#FFD166','#06D6A0','#4CC9F0','#FF9F1C'];
  for (let i = 0; i < 32; i++) {
    const p = document.createElement('div');
    p.className = 'confeti-p';
    p.style.left = Math.random() * 100 + 'vw';
    p.style.background = colores[Math.floor(Math.random() * colores.length)];
    p.style.width = (5 + Math.random() * 8) + 'px';
    p.style.height = (5 + Math.random() * 8) + 'px';
    p.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
    p.style.animationDelay = (Math.random() * 0.4) + 's';
    p.style.animationDuration = (1 + Math.random()) + 's';
    c.appendChild(p);
    setTimeout(() => p.remove(), 2000);
  }
}

// ===== KEYBOARD ENTER =====
document.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    const active = document.querySelector('.seccion.activa');
    if (!active) return;
    if (active.id === 'yo-soy') guardarP1();
    else if (active.id === 'soy-capaz') guardarP2();
    else if (active.id === 'inicio' && document.activeElement?.id === 'fi-input') agregarFortalezaInicial();
    else if (active.id === 'pantalla-login' || document.getElementById('pantalla-login').style.display !== 'none') iniciarSesion();
  }
});

// Enter en login
document.getElementById('login-pass')?.addEventListener('keydown', e => {
  if (e.key === 'Enter') iniciarSesion();
});
