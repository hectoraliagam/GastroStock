// const API_URL = 'http://127.0.0.1:8000/api';
const API_URL = 'https://gastrostock-27s9.onrender.com/api';
const loader = document.getElementById('loading');
const toggleLoader = (show) => loader.style.display = show ? 'flex' : 'none';

let currentUser = JSON.parse(localStorage.getItem('gastro_user'));
let inventarioGlobal = [];

if (currentUser) iniciarDashboard();

document.getElementById('formLogin').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button');
    btn.innerText = 'Verificando...';
    
    const payload = { username: document.getElementById('username').value, password: document.getElementById('password').value };

    try {
        const res = await fetch(`${API_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if (res.ok) {
            const data = await res.json();
            currentUser = data.user;
            localStorage.setItem('gastro_user', JSON.stringify(currentUser));
            showToast("Acceso autorizado", "success");
            iniciarDashboard();
        } else {
            showToast("Usuario o contraseña incorrectos", "error");
        }
    } catch (error) {
        showToast("Error conectando al servidor", "error");
    } finally {
        btn.innerText = 'Ingresar';
    }
});

function cerrarSesion() {
    localStorage.removeItem('gastro_user');
    currentUser = null;
    document.getElementById('app-dashboard').style.display = 'none';
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('formLogin').reset();
}

function iniciarDashboard() {
    document.getElementById('login-screen').style.display = 'none';
    
    // Si eres el administrador principal, muestras tu panel privado
    if (currentUser.rol === 'superadmin') {
        document.getElementById('superadmin-dashboard').style.display = 'block';
        document.getElementById('app-dashboard').style.display = 'none';
        cargarAdminDashboard();
        return;
    }

    // Si es un cliente (Dueño o empleado)
    document.getElementById('superadmin-dashboard').style.display = 'none';
    document.getElementById('app-dashboard').style.display = 'block';
    
    if (currentUser.rol === 'empleado') {
        document.getElementById('widget-capital').style.display = 'none';
        document.querySelector('.col-valorizacion').style.display = 'none';
        document.getElementById('btn-crud-insumos').style.display = 'none';
    } else {
        document.getElementById('widget-capital').style.display = 'block';
        document.querySelector('.col-valorizacion').style.display = 'table-cell';
        document.getElementById('btn-crud-insumos').style.display = 'flex';
    }
    cargarDashboard();
}

function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const tag = type === 'success' ? 'OK' : 'Error';
    toast.innerHTML = `<strong>[${tag}]</strong> <span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 100);
    setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300); }, 3500);
}

function mostrarModalProximaAct() { document.getElementById('modal-update').style.display = 'flex'; }
function cerrarModal() { document.getElementById('modal-update').style.display = 'none'; }
function abrirCrud() { 
    document.getElementById('modal-crud').style.display = 'flex'; 
    cancelarEdicion();
    renderizarTablaCrud(); 
}
function cerrarCrud() { document.getElementById('modal-crud').style.display = 'none'; }

async function cargarDashboard() {
    if (!currentUser) return;
    try {
        const res = await fetch(`${API_URL}/reportes/valorizacion/${currentUser.id_restaurante}`);
        const data = await res.json();
        document.getElementById('capital-total').innerText = `S/ ${data.capital_total_almacen.toFixed(2)}`;

        const tbody = document.getElementById('tabla-inventario');
        const select = document.getElementById('id_inventario');
        tbody.innerHTML = '';
        select.innerHTML = '<option value="">Seleccione un insumo...</option>';

        const resInv = await fetch(`${API_URL}/inventario/${currentUser.id_restaurante}`);
        const inventarioData = await resInv.json();
        inventarioGlobal = inventarioData.data;

        inventarioGlobal.forEach(item => {
            select.innerHTML += `<option value="${item.id}">${item.ingrediente} (${item.unidad})</option>`;
            const estadoHtml = item.alerta_compra ? `<span class="badge badge-danger">Crítico</span>` : `<span class="badge badge-success">Óptimo</span>`;
            const costoUnit = item.costo_unitario || 0;
            const valorizado = (item.cantidad_actual * costoUnit).toFixed(2);
            const valorizadoCelda = currentUser.rol === 'empleado' ? '' : `<td>S/ ${valorizado}</td>`;

            tbody.innerHTML += `
                <tr>
                    <td><strong>${item.ingrediente}</strong></td>
                    <td>${item.cantidad_actual} ${item.unidad}</td>
                    <td>${estadoHtml}</td>
                    ${valorizadoCelda}
                </tr>`;
        });
    } catch (error) {
        showToast("Error cargando los datos", "error");
    }
}

document.getElementById('formMovimiento').addEventListener('submit', async (e) => {
    e.preventDefault();
    toggleLoader(true);
    const payload = {
        id_inventario: parseInt(document.getElementById('id_inventario').value),
        tipo: document.getElementById('tipo').value,
        cantidad: parseFloat(document.getElementById('cantidad').value),
        motivo: document.getElementById('motivo').value,
        usuario: currentUser.username
    };

    try {
        const response = await fetch(`${API_URL}/movimientos`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if(response.ok) {
            document.getElementById('formMovimiento').reset();
            await cargarDashboard();
            showToast("Movimiento registrado", "success");
        } else { showToast("Error en la transacción", "error"); }
    } catch (error) { showToast("Fallo de conexión", "error"); } 
    finally { toggleLoader(false); }
});

function renderizarTablaCrud() {
    const tbody = document.getElementById('tabla-crud-insumos');
    tbody.innerHTML = '';
    inventarioGlobal.forEach(item => {
        tbody.innerHTML += `
            <tr>
                <td>${item.ingrediente} <small style="color:var(--text-muted)">(${item.unidad})</small></td>
                <td>S/ ${item.costo_unitario}</td>
                <td>
                    <button class="btn-action edit" onclick="cargarEdicion(${item.id})">Editar</button>
                    <button class="btn-action delete" onclick="eliminarInsumo(${item.id})">Eliminar</button>
                </td>
            </tr>`;
    });
}

function cargarEdicion(id) {
    const item = inventarioGlobal.find(i => i.id === id);
    if(!item) return;
    
    document.getElementById('edit-id').value = item.id;
    document.getElementById('nuevo-nombre').value = item.ingrediente;
    document.getElementById('nuevo-unidad').value = item.unidad;
    document.getElementById('nuevo-minimo').value = item.stock_minimo;
    document.getElementById('nuevo-costo').value = item.costo_unitario;
    
    document.getElementById('btn-submit-crud').innerText = 'Actualizar Insumo';
    document.getElementById('btn-cancelar-edit').style.display = 'inline-block';
}

function cancelarEdicion() {
    document.getElementById('formCrearInsumo').reset();
    document.getElementById('edit-id').value = '';
    document.getElementById('btn-submit-crud').innerText = 'Guardar Insumo';
    document.getElementById('btn-cancelar-edit').style.display = 'none';
}

document.getElementById('formCrearInsumo').addEventListener('submit', async (e) => {
    e.preventDefault();
    toggleLoader(true);
    
    const idEdit = document.getElementById('edit-id').value;
    const payload = {
        ingrediente: document.getElementById('nuevo-nombre').value,
        unidad: document.getElementById('nuevo-unidad').value,
        stock_minimo: parseFloat(document.getElementById('nuevo-minimo').value),
        costo_unitario: parseFloat(document.getElementById('nuevo-costo').value)
    };

    const isEdit = idEdit !== "";
    const method = isEdit ? 'PUT' : 'POST';
    const url = isEdit ? `${API_URL}/inventario/${currentUser.id_restaurante}/${idEdit}` : `${API_URL}/inventario/${currentUser.id_restaurante}`;

    try {
        const response = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if(response.ok) {
            cancelarEdicion();
            await cargarDashboard();
            renderizarTablaCrud();
            showToast(isEdit ? "Insumo actualizado" : "Insumo agregado", "success");
        } else { showToast("Error al procesar", "error"); }
    } catch (error) { showToast("Error de conexión", "error"); } 
    finally { toggleLoader(false); }
});

async function eliminarInsumo(id_insumo) {
    if(!confirm("¿Seguro que deseas eliminar este insumo?")) return;
    toggleLoader(true);
    try {
        const response = await fetch(`${API_URL}/inventario/${currentUser.id_restaurante}/${id_insumo}`, { method: 'DELETE' });
        if(response.ok) {
            await cargarDashboard();
            renderizarTablaCrud();
            showToast("Insumo eliminado", "success");
        } else { showToast("No se puede eliminar porque tiene movimientos guardados.", "error"); }
    } catch (error) { showToast("Error de conexión", "error"); } 
    finally { toggleLoader(false); }
}

// ==========================================
// FUNCIONES DEL PANEL SUPERADMIN
// ==========================================
async function cargarAdminDashboard() {
    try {
        const res = await fetch(`${API_URL}/admin/restaurantes`);
        const result = await res.json();
        const tbody = document.getElementById('tabla-admin-clientes');
        tbody.innerHTML = '';
        
        result.data.forEach(cliente => {
            const estadoHtml = cliente.estado === 'activo' 
                ? `<span class="badge badge-success">Activo</span>` 
                : `<span class="badge badge-danger">Suspendido</span>`;
                
            const btnSuspenderText = cliente.estado === 'activo' ? 'Suspender' : 'Activar';
            const nuevoEstado = cliente.estado === 'activo' ? 'suspendido' : 'activo';

            tbody.innerHTML += `
                <tr>
                    <td>#${cliente.id}</td>
                    <td><strong>${cliente.nombre}</strong></td>
                    <td><small>U: ${cliente.username}<br>P: ${cliente.password}</small></td>
                    <td>${estadoHtml}</td>
                    <td>
                        <button class="btn-action edit" onclick="cambiarEstadoCliente(${cliente.id}, '${nuevoEstado}')">${btnSuspenderText}</button>
                        <button class="btn-action delete" onclick="eliminarCliente(${cliente.id})">Borrar</button>
                    </td>
                </tr>
            `;
        });
    } catch (error) {
        showToast("Error cargando clientes", "error");
    }
}

document.getElementById('formNuevoCliente')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    toggleLoader(true);
    
    const payload = {
        nombre_restaurante: document.getElementById('admin-restaurante').value,
        username: document.getElementById('admin-user').value,
        password: document.getElementById('admin-pass').value
    };

    try {
        const response = await fetch(`${API_URL}/admin/restaurantes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        const result = await response.json();
        if(response.ok) {
            document.getElementById('formNuevoCliente').reset();
            cargarAdminDashboard();
            showToast("Cliente creado. Ya puede iniciar sesión.", "success");
        } else { 
            showToast(result.detail || "Error al crear", "error"); 
        }
    } catch (error) { showToast("Error de conexión", "error"); } 
    finally { toggleLoader(false); }
});

async function cambiarEstadoCliente(idRestaurante, nuevoEstado) {
    if(!confirm(`¿Deseas cambiar el estado a ${nuevoEstado}?`)) return;
    toggleLoader(true);
    try {
        const res = await fetch(`${API_URL}/admin/restaurantes/${idRestaurante}/estado`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ estado: nuevoEstado })
        });
        if(res.ok) {
            cargarAdminDashboard();
            showToast(`Cliente ${nuevoEstado}`, "success");
        } else {
            showToast("Error al actualizar estado", "error");
        }
    } catch (error) { showToast("Error de conexión", "error"); } 
    finally { toggleLoader(false); }
}

async function eliminarCliente(idRestaurante) {
    const userCode = prompt("Peligro: Esto borrará todo el historial e inventario de este cliente. Escribe 'BORRAR' para confirmar.");
    if (userCode !== "BORRAR") {
        showToast("Operación cancelada", "success");
        return;
    }
    
    toggleLoader(true);
    try {
        const response = await fetch(`${API_URL}/admin/restaurantes/${idRestaurante}`, { method: 'DELETE' });
        if(response.ok) {
            cargarAdminDashboard();
            showToast("Cliente y datos eliminados.", "success");
        } else { 
            showToast("Error al eliminar", "error"); 
        }
    } catch (error) { showToast("Error de conexión", "error"); } 
    finally { toggleLoader(false); }
}

async function enviarAlertaWhatsApp() {
    // La lógica de Evolution API se implementará en la próxima actualización
}
