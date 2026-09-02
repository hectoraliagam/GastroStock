/* ==========================================
   CONFIGURACIÓN Y VARIABLES GLOBALES
========================================== */
// const API_URL = 'http://127.0.0.1:8000/api';
const API_URL = 'https://gastrostock-27s9.onrender.com/api';

let currentUser = JSON.parse(localStorage.getItem('gastro_user'));
let inventarioGlobal = [];

// Inicialización
document.addEventListener('DOMContentLoaded', () => {
    if (currentUser) iniciarDashboard();
    
    // Asignación de Event Listeners a Formularios
    document.getElementById('formLogin').addEventListener('submit', handleLogin);
    document.getElementById('formMovimiento').addEventListener('submit', handleMovimiento);
    document.getElementById('formCrearInsumo').addEventListener('submit', handleInsumo);
    
    // Los formularios de admin y personal pueden no existir dependiendo del rol
    const formNuevoCliente = document.getElementById('formNuevoCliente');
    if(formNuevoCliente) formNuevoCliente.addEventListener('submit', handleNuevoCliente);
    
    const formCrearPersonal = document.getElementById('formCrearPersonal');
    if(formCrearPersonal) formCrearPersonal.addEventListener('submit', handleNuevoPersonal);
});

/* ==========================================
   UTILIDADES (UI Y ALERTAS)
========================================== */
const toggleLoader = (show) => {
    document.getElementById('loading').style.display = show ? 'flex' : 'none';
};

function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const tag = type === 'success' ? 'OK' : 'Error';
    toast.innerHTML = `<strong>[${tag}]</strong> <span>${message}</span>`;
    container.appendChild(toast);
    
    setTimeout(() => toast.classList.add('show'), 100);
    setTimeout(() => { 
        toast.classList.remove('show'); 
        setTimeout(() => toast.remove(), 300); 
    }, 3500);
}

// Control de Modales Globales
function mostrarModalProximaAct() { document.getElementById('modal-update').style.display = 'flex'; }
function cerrarModal() { document.getElementById('modal-update').style.display = 'none'; }

/* ==========================================
   MÓDULO: AUTENTICACIÓN
========================================== */
async function handleLogin(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button');
    btn.innerText = 'Verificando...';
    
    const payload = { 
        username: document.getElementById('username').value, 
        password: document.getElementById('password').value 
    };

    try {
        const res = await fetch(`${API_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        const data = await res.json();
        
        if (res.ok) {
            currentUser = data.user;
            localStorage.setItem('gastro_user', JSON.stringify(currentUser));
            showToast("Acceso autorizado", "success");
            iniciarDashboard();
        } else {
            showToast(data.detail || "Error al iniciar sesión", "error");
        }
    } catch (error) {
        showToast("Error conectando al servidor", "error");
    } finally {
        btn.innerText = 'Ingresar';
    }
}

function cerrarSesion() {
    localStorage.removeItem('gastro_user');
    currentUser = null;
    document.getElementById('app-dashboard').style.display = 'none';
    document.getElementById('superadmin-dashboard').style.display = 'none';
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('formLogin').reset();
}

function iniciarDashboard() {
    document.getElementById('login-screen').style.display = 'none';
    
    if (currentUser.rol === 'superadmin') {
        document.getElementById('superadmin-dashboard').style.display = 'block';
        document.getElementById('app-dashboard').style.display = 'none';
        cargarAdminDashboard();
        return;
    }

    // Configuración para Cliente (Dueño/Empleado)
    document.getElementById('superadmin-dashboard').style.display = 'none';
    document.getElementById('app-dashboard').style.display = 'block';
    
    const esEmpleado = currentUser.rol === 'empleado';
    document.getElementById('widget-capital').style.display = esEmpleado ? 'none' : 'block';
    document.querySelector('.col-valorizacion').style.display = esEmpleado ? 'none' : 'table-cell';
    document.getElementById('btn-crud-insumos').style.display = esEmpleado ? 'none' : 'flex';
    document.getElementById('btn-crud-personal').style.display = esEmpleado ? 'none' : 'flex';
    document.getElementById('btn-descargar-pdf').style.display = esEmpleado ? 'none' : 'flex';
    
    cargarDashboardCliente();
}

/* ==========================================
   MÓDULO: CLIENTE (INVENTARIO Y KARDEX)
========================================== */
async function cargarDashboardCliente() {
    if (!currentUser) return;
    try {
        // Cargar Valorización (Sólo si es dueño importará en la UI)
        if (currentUser.rol !== 'empleado') {
            const resVal = await fetch(`${API_URL}/reportes/valorizacion/${currentUser.id_restaurante}`);
            const dataVal = await resVal.json();
            document.getElementById('capital-total').innerText = `S/ ${dataVal.capital_total_almacen.toFixed(2)}`;
        }

        // Cargar Inventario
        const resInv = await fetch(`${API_URL}/inventario/${currentUser.id_restaurante}`);
        const inventarioData = await resInv.json();
        inventarioGlobal = inventarioData.data;

        renderizarTablaInventarioPrincipal();
    } catch (error) {
        showToast("Error cargando el dashboard", "error");
    }
}

function renderizarTablaInventarioPrincipal() {
    const tbody = document.getElementById('tabla-inventario');
    const select = document.getElementById('id_inventario');
    
    tbody.innerHTML = '';
    select.innerHTML = '<option value="">Seleccione un insumo...</option>';

    inventarioGlobal.forEach(item => {
        select.innerHTML += `<option value="${item.id}">${item.ingrediente} (${item.unidad})</option>`;
        
        const estadoHtml = item.alerta_compra 
            ? `<span class="badge badge-danger">Crítico</span>` 
            : `<span class="badge badge-success">Óptimo</span>`;
            
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
}

async function handleMovimiento(e) {
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
            await cargarDashboardCliente();
            showToast("Movimiento registrado", "success");
        } else { 
            showToast("Error en la transacción", "error"); 
        }
    } catch (error) { 
        showToast("Fallo de conexión", "error"); 
    } finally { 
        toggleLoader(false); 
    }
}

/* ==========================================
   MÓDULO: CRUD DE INSUMOS
========================================== */
function abrirCrud() { 
    document.getElementById('modal-crud').style.display = 'flex'; 
    cancelarEdicion();
    renderizarTablaCrudInsumos(); 
}

function cerrarCrud() { document.getElementById('modal-crud').style.display = 'none'; }

function renderizarTablaCrudInsumos() {
    const tbody = document.getElementById('tabla-crud-insumos');
    tbody.innerHTML = '';
    inventarioGlobal.forEach(item => {
        tbody.innerHTML += `
            <tr>
                <td>${item.ingrediente} <small style="color:var(--text-muted)">(${item.unidad})</small></td>
                <td>S/ ${item.costo_unitario}</td>
                <td>
                    <button class="btn-action edit" onclick="cargarEdicionInsumo(${item.id})">Editar</button>
                    <button class="btn-action delete" onclick="eliminarInsumo(${item.id})">Eliminar</button>
                </td>
            </tr>`;
    });
}

function cargarEdicionInsumo(id) {
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

async function handleInsumo(e) {
    e.preventDefault();
    toggleLoader(true);
    
    const idEdit = document.getElementById('edit-id').value;
    const isEdit = idEdit !== "";
    
    const payload = {
        ingrediente: document.getElementById('nuevo-nombre').value,
        unidad: document.getElementById('nuevo-unidad').value,
        stock_minimo: parseFloat(document.getElementById('nuevo-minimo').value),
        costo_unitario: parseFloat(document.getElementById('nuevo-costo').value)
    };

    const method = isEdit ? 'PUT' : 'POST';
    const url = isEdit 
        ? `${API_URL}/inventario/${currentUser.id_restaurante}/${idEdit}` 
        : `${API_URL}/inventario/${currentUser.id_restaurante}`;

    try {
        const response = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if(response.ok) {
            cancelarEdicion();
            await cargarDashboardCliente();
            renderizarTablaCrudInsumos();
            showToast(isEdit ? "Insumo actualizado" : "Insumo agregado", "success");
        } else { 
            showToast("Error al procesar", "error"); 
        }
    } catch (error) { 
        showToast("Error de conexión", "error"); 
    } finally { 
        toggleLoader(false); 
    }
}

async function eliminarInsumo(id_insumo) {
    if(!confirm("¿Seguro que deseas eliminar este insumo?")) return;
    toggleLoader(true);
    try {
        const response = await fetch(`${API_URL}/inventario/${currentUser.id_restaurante}/${id_insumo}`, { method: 'DELETE' });
        if(response.ok) {
            await cargarDashboardCliente();
            renderizarTablaCrudInsumos();
            showToast("Insumo eliminado", "success");
        } else { 
            showToast("No se puede eliminar porque tiene movimientos guardados.", "error"); 
        }
    } catch (error) { 
        showToast("Error de conexión", "error"); 
    } finally { 
        toggleLoader(false); 
    }
}

/* ==========================================
   MÓDULO: GESTIÓN DE PERSONAL (DUEÑOS)
========================================== */
function abrirCrudPersonal() {
    document.getElementById('modal-personal').style.display = 'flex';
    cargarTablaPersonal();
}

function cerrarCrudPersonal() { document.getElementById('modal-personal').style.display = 'none'; }

async function cargarTablaPersonal() {
    try {
        const res = await fetch(`${API_URL}/usuarios/${currentUser.id_restaurante}`);
        const result = await res.json();
        const tbody = document.getElementById('tabla-crud-personal');
        tbody.innerHTML = '';
        
        result.data.forEach(u => {
            const btnDelete = u.id !== currentUser.id 
                ? `<button class="btn-action delete" onclick="eliminarPersonal(${u.id})">Eliminar</button>` 
                : `<span class="badge badge-success">Tú</span>`;
                
            tbody.innerHTML += `
                <tr>
                    <td><strong>${u.username}</strong></td>
                    <td>${u.rol.toUpperCase()}</td>
                    <td>${btnDelete}</td>
                </tr>`;
        });
    } catch (error) {
        showToast("Error cargando personal", "error");
    }
}

async function handleNuevoPersonal(e) {
    e.preventDefault();
    toggleLoader(true);
    
    const payload = {
        username: document.getElementById('nuevo-user-personal').value,
        password: document.getElementById('nuevo-pass-personal').value,
        rol: document.getElementById('nuevo-rol-personal').value
    };

    try {
        const res = await fetch(`${API_URL}/usuarios/${currentUser.id_restaurante}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        const result = await res.json();
        if(res.ok) {
            document.getElementById('formCrearPersonal').reset();
            cargarTablaPersonal();
            showToast("Usuario agregado al sistema", "success");
        } else {
            showToast(result.detail || "Error al crear", "error");
        }
    } catch (error) {
        showToast("Error de conexión", "error");
    } finally {
        toggleLoader(false);
    }
}

async function eliminarPersonal(idUsuario) {
    if(!confirm("¿Seguro que deseas revocar el acceso a este usuario?")) return;
    toggleLoader(true);
    try {
        const res = await fetch(`${API_URL}/usuarios/${currentUser.id_restaurante}/${idUsuario}`, { method: 'DELETE' });
        if(res.ok) {
            cargarTablaPersonal();
            showToast("Usuario eliminado", "success");
        } else {
            const result = await res.json();
            showToast(result.detail || "No se puede eliminar", "error");
        }
    } catch (error) { 
        showToast("Error de conexión", "error"); 
    } finally { 
        toggleLoader(false); 
    }
}

/* ==========================================
   MÓDULO: EXPORTAR PDF (DUEÑOS)
========================================== */
async function descargarReportePDF() {
    toggleLoader(true);
    try {
        const res = await fetch(`${API_URL}/reportes/kpis/${currentUser.id_restaurante}`);
        const data = await res.json();
        const kpis = data.kpis;
        
        document.getElementById('kpi-capital').innerText = `S/ ${kpis.capital.toFixed(2)}`;
        document.getElementById('kpi-alertas').innerText = kpis.alertas;
        document.getElementById('kpi-proveedores').innerText = kpis.proveedores.length;
        
        const listaMov = document.getElementById('kpi-lista-movimientos');
        listaMov.innerHTML = '';
        if (kpis.movimientos.length === 0) {
            listaMov.innerHTML = '<li>No hay operaciones registradas aún.</li>';
        } else {
            kpis.movimientos.forEach(m => {
                listaMov.innerHTML += `<li><strong>${m.tipo.toUpperCase()}:</strong> ${m.total} registros operativos</li>`;
            });
        }

        const listaProv = document.getElementById('kpi-lista-proveedores');
        listaProv.innerHTML = '';
        if (kpis.proveedores.length === 0) {
            listaProv.innerHTML = '<tr><td colspan="3" style="padding: 10px; border: 1px solid #ddd; text-align: center;">No hay proveedores registrados.</td></tr>';
        } else {
            kpis.proveedores.forEach(p => {
                const telefono = p.telefono || 'Sin número';
                const dias = p.dias_entrega || 'No especificado';
                listaProv.innerHTML += `
                    <tr>
                        <td style="padding: 10px; border: 1px solid #ddd; color: #333;"><strong>${p.nombre}</strong></td>
                        <td style="padding: 10px; border: 1px solid #ddd; color: #555;">${telefono}</td>
                        <td style="padding: 10px; border: 1px solid #ddd; color: #555;">${dias}</td>
                    </tr>`;
            });
        }

        const template = document.getElementById('pdf-template');
        template.style.display = 'block'; 
        
        const opciones = {
            margin:       10,
            filename:     `Dashboard_GastroStock_${new Date().toLocaleDateString()}.pdf`,
            image:        { type: 'jpeg', quality: 0.98 },
            html2canvas:  { scale: 2 },
            jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
        };

        await html2pdf().set(opciones).from(template).save();
        template.style.display = 'none'; 
        
        showToast("Dashboard gerencial generado", "success");
    } catch (error) {
        showToast("Error al generar el PDF", "error");
    } finally {
        toggleLoader(false);
    }
}

/* ==========================================
   MÓDULO: SUPERADMIN (MASTER)
========================================== */
async function cargarAdminDashboard() {
    try {
        const res = await fetch(`${API_URL}/admin/restaurantes`);
        const result = await res.json();
        const tbody = document.getElementById('tabla-admin-clientes');
        tbody.innerHTML = '';
        
        result.data.forEach(cliente => {
            const esActivo = cliente.estado === 'activo';
            const estadoHtml = esActivo 
                ? `<span class="badge badge-success">Activo</span>` 
                : `<span class="badge badge-danger">Suspendido</span>`;
                
            const btnSuspenderText = esActivo ? 'Suspender' : 'Activar';
            const nuevoEstado = esActivo ? 'suspendido' : 'activo';

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
                </tr>`;
        });
    } catch (error) {
        showToast("Error cargando clientes", "error");
    }
}

async function handleNuevoCliente(e) {
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
    } catch (error) { 
        showToast("Error de conexión", "error"); 
    } finally { 
        toggleLoader(false); 
    }
}

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
    } catch (error) { 
        showToast("Error de conexión", "error"); 
    } finally { 
        toggleLoader(false); 
    }
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
    } catch (error) { 
        showToast("Error de conexión", "error"); 
    } finally { 
        toggleLoader(false); 
    }
}
