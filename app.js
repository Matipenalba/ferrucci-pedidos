/* Ferrucci Pizzas · Pedidos por WhatsApp
 *
 * El catálogo viene de la planilla "Ferrucci - Catálogo Pedidos" (vía Apps Script).
 * Si config.js no tiene la dirección, usa catalogo-ejemplo.json.
 */
(function () {
  'use strict';

  var ORDEN_RUBROS = ['Pizza Grande', 'Pizza Chica', 'Empanadas', 'Sándwiches', 'Bebidas', 'Focaccias'];
  var RUBRO_MEDIAS = 'Pizza Grande';   // único rubro que se pide de a media
  var FOTO_POR_RUBRO = {
    'Pizza Grande': 'pizza.svg', 'Pizza Chica': 'pizza.svg', 'Empanadas': 'empanada.svg',
    'Sándwiches': 'panuozzo.jpg', 'Bebidas': 'gaseosa.svg', 'Focaccias': 'focaccia.svg'
  };
  var BAJADAS = {
    'Pizza Grande': 'Elegí pizzas enteras o media de un gusto (una media por gusto). Cada media se combina con otra para completar una pizza.',
    'Pizza Chica': 'Pizzas individuales, de un solo gusto.'
  };

  var catalogo = null;           // datos de la planilla
  var porCodigo = {};            // codigo -> producto
  var carrito = {};              // codigo -> cantidad (en Pizza Grande puede ser 0,5)
  var entrega = null;            // 'retiro' | 'envio'
  var pago = null;               // 'Efectivo' | 'Transferencia'

  var $ = function (id) { return document.getElementById(id); };

  // ---------- Utilidades ----------

  function pesos(n) {
    return '$' + Math.round(n).toLocaleString('es-AR');
  }

  function esc(t) {
    return String(t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // 0.5 -> "½", 1.5 -> "1½"
  function cant(n) {
    var entero = Math.floor(n);
    var media = n - entero >= 0.5;
    return (entero ? String(entero) : '') + (media ? '½' : '') || '0';
  }

  function nombreLargo(p) {
    if (p.rubro === 'Pizza Grande') return p.nombre + ' (grande)';
    if (p.rubro === 'Pizza Chica') return p.nombre + ' (chica)';
    return p.nombre;
  }

  function slug(t) {
    return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  }

  // ---------- Carga ----------

  function cargar() {
    var url = window.CATALOGO_URL || 'catalogo-ejemplo.json';
    fetch(url, { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(iniciar)
      .catch(function () {
        $('catalogo').innerHTML =
          '<p class="cargando">No pudimos cargar el menú. Probá de nuevo en un rato o escribinos por WhatsApp.</p>';
      });
  }

  function iniciar(datos) {
    catalogo = datos;
    datos.productos.forEach(function (p) { porCodigo[p.codigo] = p; });

    if (datos.local && datos.local.abierto === false) {
      var aviso = $('aviso-cerrado');
      aviso.textContent = datos.local.mensaje || 'Ahora estamos cerrados.';
      aviso.hidden = false;
    }

    dibujarCatalogo();
    actualizarBarra();
  }

  // ---------- Catálogo ----------

  function dibujarCatalogo() {
    var rubros = ORDEN_RUBROS.filter(function (r) {
      return catalogo.productos.some(function (p) { return p.rubro === r; });
    });
    // Rubros que no estén en la lista fija van al final
    catalogo.productos.forEach(function (p) {
      if (rubros.indexOf(p.rubro) === -1) rubros.push(p.rubro);
    });

    $('rubros').innerHTML = rubros.map(function (r) {
      return '<a href="#r-' + slug(r) + '">' + esc(r) + '</a>';
    }).join('');

    $('catalogo').innerHTML = rubros.map(function (r) {
      var items = catalogo.productos.filter(function (p) { return p.rubro === r; });
      var cabecera = '<h2>' + esc(r) + '</h2>';

      if (BAJADAS[r]) cabecera += '<p class="bajada">' + BAJADAS[r] + '</p>';
      if (r === 'Empanadas') {
        var e = catalogo.empanadas || {};
        cabecera += '<div class="info-empanadas">' +
          'Unidad <strong>' + pesos(items[0] ? items[0].precio : 0) + '</strong>' +
          (e.mediaDocena ? ' · Media docena <strong>' + pesos(e.mediaDocena) + '</strong>' : '') +
          (e.docena ? ' · Docena <strong>' + pesos(e.docena) + '</strong>' : '') +
          '<div class="estado-empanadas" id="estado-empanadas">Podés combinar gustos: el precio especial se aplica sobre el total.</div>' +
          '</div>';
      }

      var chico = false;
      return '<section class="seccion" id="r-' + slug(r) + '">' + cabecera +
        '<div class="grilla">' + items.map(function (p) { return tarjeta(p, chico); }).join('') + '</div>' +
        '</section>';
    }).join('');

    $('catalogo').addEventListener('click', function (ev) {
      var ver = ev.target.closest('[data-ver]');
      if (ver && !ev.target.closest('button[data-clave]')) { abrirDetalle(ver.getAttribute('data-ver')); return; }
      alTocarContador(ev);
    });
    marcarRubroActivo();
  }

  function fotoDe(p) {
    var archivo = p.foto || FOTO_POR_RUBRO[p.rubro] || 'pizza.svg';
    return { src: 'img/' + archivo, ilustracion: /\.svg$/i.test(archivo) };
  }

  function lineasDe(p) {
    return (p.rubro === RUBRO_MEDIAS)
      ? linea(p.codigo, 'Entera', p.precio) + linea(p.codigo + ':m', 'Media', p.precio / 2)
      : linea(p.codigo, 'Precio', p.precio);
  }

  function tarjeta(p, chico) {
    var f = fotoDe(p);
    return '<article class="producto' + (chico ? ' chico' : '') + '" data-producto="' + esc(p.codigo) + '">' +
      '<button type="button" class="producto-abrir" data-ver="' + esc(p.codigo) + '" aria-label="Ver detalle de ' + esc(p.nombre) + '">' +
      '<img class="producto-foto' + (f.ilustracion ? ' ilustracion' : '') + '" src="' + esc(f.src) + '" alt="" loading="lazy">' +
      '<span class="ver-mas">Ver más</span>' +
      '</button>' +
      '<div class="producto-cuerpo">' +
      '<h3 class="producto-nombre" data-ver="' + esc(p.codigo) + '">' + esc(p.nombre) + '</h3>' +
      (p.descripcion ? '<p class="producto-desc" data-ver="' + esc(p.descripcion ? p.codigo : '') + '">' + esc(p.descripcion) + '</p>' : '') +
      lineasDe(p) +
      '</div></article>';
  }

  // ---------- Detalle ampliado ----------

  function abrirDetalle(codigo) {
    var p = porCodigo[codigo];
    if (!p) return;
    var f = fotoDe(p);
    $('detalle-contenido').innerHTML =
      '<img class="detalle-foto' + (f.ilustracion ? ' ilustracion' : '') + '" src="' + esc(f.src) + '" alt="' + esc(p.nombre) + '">' +
      '<div class="detalle-cuerpo">' +
      '<p class="detalle-rubro">' + esc(p.rubro) + '</p>' +
      '<h3 class="detalle-nombre">' + esc(p.nombre) + '</h3>' +
      (p.descripcion ? '<p class="detalle-desc">' + esc(p.descripcion) + '</p>' : '') +
      lineasDe(p) +
      '</div>';
    sincronizarContadores();
    $('detalle').hidden = false;
    document.body.classList.add('sin-scroll');
    $('detalle-cerrar').focus();
  }

  function cerrarDetalle() {
    $('detalle').hidden = true;
    document.body.classList.remove('sin-scroll');
  }

  // Deja todos los contadores (tarjeta y detalle) iguales al carrito
  function sincronizarContadores() {
    document.querySelectorAll('output[data-cantidad]').forEach(function (out) {
      var clave = out.getAttribute('data-cantidad');
      var n = carrito[clave] || 0;
      var maximo = /:m$/.test(clave) ? 1 : 99;
      out.textContent = n;
      out.parentNode.querySelector('.menos').disabled = (n === 0);
      out.parentNode.querySelector('.mas').disabled = (n >= maximo);
    });
  }

  function linea(clave, etiqueta, precio) {
    return '<div class="linea-compra">' +
      '<div class="linea-etiqueta"><small>' + etiqueta + '</small><span class="precio">' + pesos(precio) + '</span></div>' +
      '<div class="contador">' +
      '<button type="button" class="menos" data-clave="' + esc(clave) + '" data-paso="-1" aria-label="Quitar uno" disabled>−</button>' +
      '<output data-cantidad="' + esc(clave) + '">0</output>' +
      '<button type="button" class="mas" data-clave="' + esc(clave) + '" data-paso="1" aria-label="Agregar uno">+</button>' +
      '</div></div>';
  }

  function alTocarContador(ev) {
    var b = ev.target.closest('button[data-clave]');
    if (!b) return;
    var clave = b.getAttribute('data-clave');
    var esMedia = /:m$/.test(clave);
    var codigo = clave.replace(/:m$/, '');
    var maximo = esMedia ? 1 : 99;
    var nueva = Math.max(0, (carrito[clave] || 0) + Number(b.getAttribute('data-paso')));
    if (nueva > maximo) return;
    if (nueva === 0) delete carrito[clave]; else carrito[clave] = nueva;

    sincronizarContadores();

    var algo = (carrito[codigo] || 0) + (carrito[codigo + ':m'] || 0) > 0;
    document.querySelector('[data-producto="' + CSS.escape(codigo) + '"]').classList.toggle('elegido', algo);

    actualizarBarra();
  }

  function marcarRubroActivo() {
    var links = Array.prototype.slice.call(document.querySelectorAll('.rubros a'));
    if (!('IntersectionObserver' in window) || !links.length) return;
    var obs = new IntersectionObserver(function (entradas) {
      entradas.forEach(function (e) {
        if (!e.isIntersecting) return;
        links.forEach(function (a) {
          a.classList.toggle('activo', a.getAttribute('href') === '#' + e.target.id);
        });
      });
    }, { rootMargin: '-40% 0px -55% 0px' });
    document.querySelectorAll('.seccion').forEach(function (s) { obs.observe(s); });
  }

  // ---------- Cálculo del pedido ----------

  function calcular() {
    var renglones = [];      // { texto, detalle, importe }
    var grandes = 0;            // suma de Pizza Grande (tiene que dar entero)
    var empanadas = 0;
    var empanadasDetalle = [];
    var unidades = 0;
    var subtotal = 0;

    // Mismo orden que el catálogo: enteras y después medias de cada producto
    var orden = {};
    catalogo.productos.forEach(function (p, i) { orden[p.codigo] = i; });
    var claves = Object.keys(carrito).sort(function (a, b) {
      return (orden[a.replace(/:m$/, '')] - orden[b.replace(/:m$/, '')]) || (/:m$/.test(a) - /:m$/.test(b));
    });

    claves.forEach(function (clave) {
      var esMedia = /:m$/.test(clave);
      var n = esMedia ? carrito[clave] / 2 : carrito[clave];   // una media cuenta como 0,5 pizza
      var p = porCodigo[clave.replace(/:m$/, '')];
      if (!p) return;

      if (p.rubro === 'Empanadas') {
        empanadas += n;
        empanadasDetalle.push(n + ' ' + p.nombre);
        return;
      }

      var importe = p.precio * n;
      if (p.rubro === RUBRO_MEDIAS) grandes += n;
      unidades += n;
      subtotal += importe;
      renglones.push({ texto: (esMedia ? 'Media ' : cant(n) + ' × ') + nombreLargo(p), importe: importe });
    });

    var emp = null;
    if (empanadas > 0) {
      var e = catalogo.empanadas || {};
      var unit = 0;
      catalogo.productos.forEach(function (p) { if (p.rubro === 'Empanadas' && !unit) unit = p.precio; });
      var docenas = e.docena ? Math.floor(empanadas / 12) : 0;
      var resto = empanadas - docenas * 12;
      var medias = e.mediaDocena ? Math.floor(resto / 6) : 0;
      var sueltas = resto - medias * 6;
      var importeEmp = docenas * (e.docena || 0) + medias * (e.mediaDocena || 0) + sueltas * unit;

      var partes = [];
      if (docenas) partes.push(docenas + (docenas === 1 ? ' docena' : ' docenas'));
      if (medias) partes.push('1 media docena');
      if (sueltas) partes.push(sueltas + (sueltas === 1 ? ' suelta' : ' sueltas'));

      emp = { cantidad: empanadas, detalle: empanadasDetalle, precio: partes.join(' + '), importe: importeEmp };
      subtotal += importeEmp;
      unidades += empanadas;
    }

    return {
      renglones: renglones,
      empanadas: emp,
      grandes: grandes,
      unidades: unidades,
      subtotal: subtotal,
      envio: entrega === 'envio' ? (catalogo.envio || 0) : 0
    };
  }

  function actualizarBarra() {
    var c = calcular();
    var hay = Object.keys(carrito).length > 0;
    $('barra').hidden = !hay || !$('paso-datos').hidden;

    var piezas = c.renglones.length + (c.empanadas ? 1 : 0);
    $('barra-cantidad').textContent = piezas + (piezas === 1 ? ' ítem' : ' ítems');
    $('barra-total').textContent = pesos(c.subtotal);

    // Media pizza grande suelta: aviso fijo y no deja continuar hasta completarla
    var mediaSuelta = c.grandes % 1 !== 0;
    var err = $('error-catalogo');
    err.textContent = mediaSuelta
      ? 'Falta otra media pizza grande para completar la pizza. Elegí otra media del gusto que quieras.'
      : '';
    err.hidden = !mediaSuelta;
    $('btn-continuar').disabled = mediaSuelta;

    var est = $('estado-empanadas');
    if (est) {
      est.textContent = c.empanadas
        ? 'Llevás ' + c.empanadas.cantidad + (c.empanadas.cantidad === 1 ? ' empanada' : ' empanadas') +
          ': ' + c.empanadas.precio + ' = ' + pesos(c.empanadas.importe) +
          (faltanParaPromo(c.empanadas.cantidad) ? '. ' + faltanParaPromo(c.empanadas.cantidad) : '')
        : 'Podés combinar gustos: el precio especial se aplica sobre el total.';
    }
  }

  function faltanParaPromo(n) {
    var e = catalogo.empanadas || {};
    var resto = n % 12;
    if (e.mediaDocena && resto < 6) {
      return 'Te faltan ' + (6 - resto) + ' para la media docena';
    }
    if (e.docena && resto > 6) {
      return 'Te faltan ' + (12 - resto) + ' para la docena';
    }
    return '';
  }

  // ---------- Paso 2 ----------

  function irADatos() {
    var c = calcular();
    if (c.grandes % 1 !== 0) return;   // el aviso ya está visible en la barra
    $('paso-catalogo').hidden = true;
    $('barra').hidden = true;
    $('paso-datos').hidden = false;
    $('error-datos').hidden = true;
    dibujarResumen();
    window.scrollTo(0, 0);
  }

  function volverACatalogo() {
    $('paso-datos').hidden = true;
    $('paso-catalogo').hidden = false;
    actualizarBarra();
  }

  function dibujarResumen() {
    var c = calcular();
    var html = c.renglones.map(function (r) {
      return '<div class="renglon"><span>' + esc(r.texto) + '</span><span>' + pesos(r.importe) + '</span></div>';
    }).join('');

    if (c.empanadas) {
      html += '<div class="renglon"><span>' + c.empanadas.cantidad + ' × Empanadas' +
        '<small>' + esc(c.empanadas.detalle.join(', ')) + '</small>' +
        '<small>' + esc(c.empanadas.precio) + '</small></span>' +
        '<span>' + pesos(c.empanadas.importe) + '</span></div>';
    }

    if (entrega === 'envio') {
      html += '<div class="renglon"><span>Envío</span><span>' + pesos(c.envio) + '</span></div>';
    }

    html += '<div class="renglon total"><span>Total</span><span>' + pesos(c.subtotal + c.envio) + '</span></div>';
    $('resumen').innerHTML = html;
  }

  function elegir(grupo, valor) {
    document.querySelectorAll('[data-' + grupo + ']').forEach(function (b) {
      b.setAttribute('aria-checked', String(b.getAttribute('data-' + grupo) === valor));
    });
  }

  function armarMensaje(c) {
    var l = [];
    l.push('*Pedido Ferrucci Pizzas*');
    l.push('Nombre: ' + $('nombre').value.trim());
    l.push(entrega === 'envio'
      ? 'Envío a domicilio: ' + $('domicilio').value.trim()
      : 'Retiro en el local');
    var horario = $('horario').value.trim();
    if (horario) l.push('Horario de preferencia: ' + horario);
    l.push('');
    c.renglones.forEach(function (r) { l.push('• ' + r.texto + ': ' + pesos(r.importe)); });
    if (c.empanadas) {
      l.push('• ' + c.empanadas.cantidad + ' empanadas (' + c.empanadas.detalle.join(', ') + '): ' + pesos(c.empanadas.importe));
    }
    if (entrega === 'envio') l.push('• Envío: ' + pesos(c.envio));
    l.push('');
    l.push('*Total: ' + pesos(c.subtotal + c.envio) + '*');
    l.push('Pago: ' + pago);
    return l.join('\n');
  }

  function finalizar() {
    var err = $('error-datos');
    var falta = [];
    if (!$('nombre').value.trim()) falta.push('tu nombre');
    if (!entrega) falta.push('si es retiro o envío');
    if (entrega === 'envio' && !$('domicilio').value.trim()) falta.push('el domicilio');
    if (!pago) falta.push('la forma de pago');

    if (catalogo.local && catalogo.local.abierto === false) {
      err.textContent = catalogo.local.mensaje || 'Ahora estamos cerrados.';
      err.hidden = false;
      return;
    }
    if (falta.length) {
      err.textContent = 'Falta completar ' + falta.join(', ').replace(/, ([^,]*)$/, ' y $1') + '.';
      err.hidden = false;
      return;
    }
    err.hidden = true;

    var c = calcular();
    var url = 'https://wa.me/' + catalogo.whatsapp + '?text=' + encodeURIComponent(armarMensaje(c));
    window.location.href = url;
  }

  // ---------- Eventos ----------

  $('detalle').addEventListener('click', function (ev) {
    if (ev.target === $('detalle') || ev.target.closest('#detalle-cerrar') || ev.target.closest('#detalle-listo')) {
      cerrarDetalle();
      return;
    }
    alTocarContador(ev);
  });
  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape' && !$('detalle').hidden) cerrarDetalle();
  });

  $('btn-continuar').addEventListener('click', irADatos);
  $('btn-volver').addEventListener('click', volverACatalogo);
  $('btn-finalizar').addEventListener('click', finalizar);

  document.querySelectorAll('[data-entrega]').forEach(function (b) {
    b.addEventListener('click', function () {
      entrega = b.getAttribute('data-entrega');
      elegir('entrega', entrega);
      $('campo-domicilio').hidden = (entrega !== 'envio');
      if (entrega === 'envio') $('domicilio').focus();
      dibujarResumen();
    });
  });

  document.querySelectorAll('[data-pago]').forEach(function (b) {
    b.addEventListener('click', function () {
      pago = b.getAttribute('data-pago');
      elegir('pago', pago);
    });
  });

  // El aviso de datos faltantes se borra en cuanto el cliente corrige algo
  ['nombre', 'domicilio'].forEach(function (id) {
    $(id).addEventListener('input', function () { $('error-datos').hidden = true; });
  });
  document.querySelectorAll('[data-entrega],[data-pago]').forEach(function (b) {
    b.addEventListener('click', function () { $('error-datos').hidden = true; });
  });

  // Exponer el cálculo para pruebas automáticas
  window.__ferrucci = { calcular: calcular, armarMensaje: armarMensaje, carrito: carrito };

  cargar();
})();
