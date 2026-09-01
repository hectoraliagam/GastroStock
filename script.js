const API_URL = 'https://gastrostock-27s9.onrender.com/api';
const loader = document.getElementById('loading');
const toggleLoader = (show) => loader.style.display = show ? 'flex' : 'none';

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
    try {
        const res = await fetch(`${API_URL}/reportes/valorizacion`);
        const data = await res.json();
        document.getElementById('capital-total').innerText = `S/ ${data.capital_total_almacen.toFixed(2)}`;

        const tbody = document.getElementById('tabla-inventario');
        const select = document.getElementById('id_inventario');
        tbody.innerHTML = '';
        select.innerHTML = '<option value="">Seleccione un insumo...</option>';

        const resInv = await fetch(`${API_URL}/inventario`);
        const inventarioData = await resInv.json();

        inventarioData.data.forEach(item => {
            select.innerHTML += `<option value="${item.id}">${item.ingrediente} (${item.unidad})</option>`;

            const estadoHtml = item.alerta_compra 
                ? `<span class="badge badge-danger">Crítico</span>` 
                : `<span class="badge badge-success">Óptimo</span>`;

            const costoUnit = item.costo_unitario || 0;
            const valorizado = (item.cantidad_actual * costoUnit).toFixed(2);

            tbody.innerHTML += `
                <tr>
                    <td><strong>${item.ingrediente}</strong></td>
                    <td>${item.cantidad_actual} ${item.unidad}</td>
                    <td>${estadoHtml}</td>
                    <td>S/ ${valorizado}</td>
                </tr>
            `;
        });
    } catch (error) {
        console.error(error);
        showToast("Error de conexión con el servidor", "error");
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
        usuario: document.getElementById('usuario').value
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

// Función de WhatsApp desactivada temporalmente, reemplazada por el modal en HTML
async function enviarAlertaWhatsApp() {
    // La lógica de Evolution API se implementará en la próxima actualización
}

cargarDashboard();
