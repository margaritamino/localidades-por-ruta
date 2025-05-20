let map;
let markers = [];
let marcadorSucursal = null;
let sucursales = {};
let detener = false;

async function cargarSucursales() {
  const res = await fetch('sucursales.json');
  sucursales = await res.json();
  const select = document.getElementById("sucursal");
  select.innerHTML = '';
  for (const key in sucursales) {
    const option = document.createElement("option");
    option.value = key;
    option.textContent = sucursales[key].nombre;
    select.appendChild(option);
  }
  mostrarSucursalEnMapa();
}

function initMap() {
  map = L.map('map').setView([-34.6, -58.4], 11);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
  cargarSucursales();
}

function mostrarSucursalEnMapa() {
  const id = document.getElementById("sucursal").value;
  const suc = sucursales[id];
  if (!suc) return;

  if (marcadorSucursal) map.removeLayer(marcadorSucursal);

  const icono = L.icon({
    iconUrl: 'https://cdn-icons-png.flaticon.com/512/684/684908.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41]
  });

  marcadorSucursal = L.marker([suc.lat, suc.lon], { icon: icono })
    .addTo(map)
    .bindPopup(`<b>${suc.nombre}</b>`)
    .openPopup();

  map.setView([suc.lat, suc.lon], 12);
}

async function calcularRuta(lat1, lon1, lat2, lon2) {
  const url = `https://router.project-osrm.org/route/v1/driving/${lon1},${lat1};${lon2},${lat2}?overview=false`;
  const res = await fetch(url);
  const data = await res.json();
  return data.routes?.[0]?.legs?.[0]?.distance / 2000 || null;
}

async function obtenerInfoUbicacion(lat, lon) {
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&addressdetails=1`;
  const res = await fetch(url, { headers: { 'User-Agent': 'demo-app' } });
  const data = await res.json();
  return {
    codigoPostal: data.address?.postcode || 'No disponible',
    provincia: data.address?.state || 'No disponible'
  };
}

function calcularDireccion(lat1, lon1, lat2, lon2) {
  const ns = lat2 > lat1 ? 'norte' : (lat2 < lat1 ? 'sur' : '');
  const ew = lon2 > lon1 ? 'este' : (lon2 < lon1 ? 'oeste' : '');
  return `${ns}${ns && ew ? '-' : ''}${ew}` || 'misma ubicación';
}

async function buscarLocalidades() {
  detener = false;
  const id = document.getElementById("sucursal").value;
  const minKm = parseFloat(document.getElementById("minKm").value);
  const maxKm = parseFloat(document.getElementById("maxKm").value);
  const suc = sucursales[id];
  const lista = document.getElementById("listaLocalidades");
  lista.innerHTML = "";
  document.getElementById("btnExportar").style.display = "none";
  document.getElementById("loading").style.display = "block";
  document.getElementById("btnDetener").style.display = "inline-block";

  markers.forEach(m => map.removeLayer(m));
  markers = [];

  const overpassUrl = `https://overpass-api.de/api/interpreter?data=[out:json];node[place~"town|village|city"](around:${maxKm * 2000},${suc.lat},${suc.lon});out;`;
  const res = await fetch(overpassUrl);
  const data = await res.json();

  let hayResultados = false;

  for (const loc of data.elements) {
    if (detener) break;

    const dist = await calcularRuta(suc.lat, suc.lon, loc.lat, loc.lon);
    if (dist && dist >= minKm && dist <= maxKm) {
      const { codigoPostal, provincia } = await obtenerInfoUbicacion(loc.lat, loc.lon);
      const direccion = calcularDireccion(suc.lat, suc.lon, loc.lat, loc.lon);
      const nombre = loc.tags.name || 'Sin nombre';

      const marker = L.marker([loc.lat, loc.lon]).addTo(map)
        .bindPopup(`<b>${nombre}</b><br>${dist.toFixed(1)} km<br>C.P.: ${codigoPostal}<br>Provincia: ${provincia}<br>Dirección: ${direccion}`);
      markers.push(marker);

      const li = document.createElement("li");
      li.textContent = `${nombre} – ${dist.toFixed(1)} km – Código Postal: ${codigoPostal} – Provincia: ${provincia} – Dirección: ${direccion}`;
      lista.appendChild(li);
      hayResultados = true;
    }
  }

  document.getElementById("loading").style.display = "none";
  document.getElementById("btnDetener").style.display = "none";
  if (hayResultados) document.getElementById("btnExportar").style.display = "inline-block";
}

function detenerBusqueda() {
  detener = true;
  document.getElementById("loading").style.display = "none";
  document.getElementById("btnDetener").style.display = "none";
}

function exportarExcel() {
  const items = document.querySelectorAll("#listaLocalidades li");
  if (!items.length) return alert("No hay localidades para exportar.");

  const sucursalId = document.getElementById("sucursal").value;
  const nombreSucursal = sucursales[sucursalId].nombre;

  const data = Array.from(items).map(li => {
    const partes = li.textContent.split(" – ");
    return {
      Sucursal: nombreSucursal,  // Nueva columna
      Localidad: partes[0],
      Distancia_km: partes[1].replace(' km', ''),
      Codigo_Postal: partes[2].replace('Código Postal: ', ''),
      Provincia: partes[3].replace('Provincia: ', ''),
      Direccion: partes[4].replace('Dirección: ', '')
    };
  });

  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Localidades");
  XLSX.writeFile(workbook, `localidades_cercanas_${nombreSucursal}.xlsx`);
}


initMap();
