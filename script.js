// const API_URL = 'http://127.0.0.1:8000/api';
const API_URL = 'https://gastrostock-27s9.onrender.com/api';
const loader = document.getElementById('loading');
const toggleLoader = (show) => loader.style.display = show ? 'flex' : 'none';

let currentUser = JSON.parse(localStorage.getItem('gastro_user'));

// ==========================================
// CONTROL DE SESIÓN (LOGIN / LOGOUT)
// ==========================================
if (currentUser) {
    iniciarDashboard();
}

document.getElementById('formLogin').addEventListener('submit', async (e) => {
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
        console.error(error);
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
    document.getElementById('app-dashboard').style.display = 'block';
    
    // Control de Roles
    if (currentUser.rol === 'empleado') {
        // Ocultar el widget de dinero
        document.getElementById('widget-capital').style.display = 'none';
        // Ocultar la columna de valorización en la tabla
        document.querySelector('.col-valorizacion').style.display = 'none';
    } else {
        document.getElementById('widget-capital').style.display = 'block';
        document.querySelector('.col-valorizacion').style.display = 'table-cell';
    }
    
    cargarDashboard();
}

// ==========================================
// FUNCIONES DEL DASHBOARD
// ==========================================
function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icon = type === 'success' ? '✅' : '❌';
    toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 100);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

function mostrarModalProximaAct() {
    document.getElementById('modal-update').style.display = 'flex';
}
function cerrarModal() {
    document.getElementById('modal-update').style.display = 'none';
}
window.onclick = function(event) {
    const modal = document.getElementById('modal-update');
    if (event.target == modal) {
        modal.style.display = "none";
    }
}

async function cargarDashboard() {
    if (!currentUser) return;
    
    try {
        // 1. Cargar Valorización (Usando el id_restaurante del usuario actual)
        const res = await fetch(`${API_URL}/reportes/valorizacion/${currentUser.id_restaurante}`);
        const data = await res.json();
        document.getElementById('capital-total').innerText = `S/ ${data.capital_total_almacen.toFixed(2)}`;

        // 2. Cargar Inventario (Usando el id_restaurante del usuario actual)
        const tbody = document.getElementById('tabla-inventario');
        const select = document.getElementById('id_inventario');
        tbody.innerHTML = '';
        select.innerHTML = '<option value="">Seleccione un insumo...</option>';

        const resInv = await fetch(`${API_URL}/inventario/${currentUser.id_restaurante}`);
        const inventarioData = await resInv.json();

        inventarioData.data.forEach(item => {
            select.innerHTML += `<option value="${item.id}">${item.ingrediente} (${item.unidad})</option>`;

            const estadoHtml = item.alerta_compra 
                ? `<span class="badge badge-danger">Crítico</span>` 
                : `<span class="badge badge-success">Óptimo</span>`;

            const costoUnit = item.costo_unitario || 0;
            const valorizado = (item.cantidad_actual * costoUnit).toFixed(2);

            // Si es empleado, no generamos la celda de valorizado
            const valorizadoCelda = currentUser.rol === 'empleado' ? '' : `<td>S/ ${valorizado}</td>`;

            tbody.innerHTML += `
                <tr>
                    <td><strong>${item.ingrediente}</strong></td>
                    <td>${item.cantidad_actual} ${item.unidad}</td>
                    <td>${estadoHtml}</td>
                    ${valorizadoCelda}
                </tr>
            `;
        });
    } catch (error) {
        console.error(error);
        showToast("Error cargando los datos del servidor", "error");
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
        usuario: currentUser.username // Enviar el usuario que inició sesión
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
            showToast("Operación registrada exitosamente", "success");
        } else {
            showToast("Error interno al procesar la transacción", "error");
        }
    } catch (error) {
        console.error(error);
        showToast("Fallo de conexión al intentar guardar", "error");
    } finally {
        toggleLoader(false);
    }
});

async function enviarAlertaWhatsApp() {
    // La lógica de Evolution API se implementará en la próxima actualización
}
